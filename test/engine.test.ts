import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { createSiyo, type Voices } from '../src/index.js';
import {
  type FakeBufferSource,
  FakeContext,
  type FakeGain,
  type FakeNode,
  type FakeOsc,
  fakeAudio,
} from './mock-audio.js';

const beep = ({ tone }: Voices): void => tone({ f: 440, dur: 0.1 });

/** Run `fn` while the global `navigator.userActivation` reports `hasBeenActive`. */
function withActivation(hasBeenActive: boolean, fn: () => void): void {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { userActivation: { hasBeenActive } },
    configurable: true,
    writable: true,
  });
  try {
    fn();
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    else delete (globalThis as unknown as { navigator?: unknown }).navigator;
  }
}

/**
 * Run `fn` with a global `AudioContext` that hands out fake contexts, so the
 * default factory (the one a player owns) can be tested. Returns the contexts.
 */
function withDefaultContext(fn: (contexts: FakeContext[]) => void): void {
  const g = globalThis as unknown as { AudioContext?: unknown };
  const saved = g.AudioContext;
  const contexts: FakeContext[] = [];
  g.AudioContext = function FakeAudioContext(): FakeContext {
    const ctx = new FakeContext();
    contexts.push(ctx);
    return ctx;
  };
  try {
    fn(contexts);
  } finally {
    if (saved === undefined) delete g.AudioContext;
    else g.AudioContext = saved;
  }
}

/** A player whose errors are collected instead of logged. */
function player<R extends Record<string, (v: Voices, o: never) => void>>(recipes: R, sampleRate?: number) {
  const a = fakeAudio(sampleRate);
  const errors: unknown[] = [];
  const s = createSiyo(recipes, { createContext: a.createContext, onError: (e) => errors.push(e) });
  return { a, s, errors };
}

afterEach(() => mock.timers.reset());

describe('lifecycle', () => {
  it('does not touch the audio API until the first sound plays', () => {
    const a = fakeAudio();
    createSiyo({ beep }, { createContext: a.createContext });
    assert.equal(a.created(), 0);
  });

  it('creates one context, resumes it, and reuses it across plays', () => {
    const { a, s } = player({ beep });
    s.play('beep');
    s.play('beep');
    assert.equal(a.created(), 1);
    assert.ok(a.ctx.resumeCalls >= 1);
    assert.equal(a.ctx.all<FakeOsc>('osc').length, 2);
  });

  it('routes through a limiter into the destination', () => {
    const { a, s } = player({ beep });
    s.play('beep');
    const [limiter] = a.ctx.all('compressor');
    assert.ok(limiter?.connections.includes(a.ctx.destination));
    assert.equal(a.ctx.all('convolver').length, 1);
  });

  it('does nothing, without throwing or reporting, when audio is unavailable', () => {
    const errors: unknown[] = [];
    const s = createSiyo({ beep }, { createContext: () => null, onError: (e) => errors.push(e) });
    assert.doesNotThrow(() => {
      s.play('beep');
      s.stop();
      s.dispose();
    });
    assert.deepEqual(errors, []);
  });

  it('does nothing in an environment with no AudioContext (default factory)', () => {
    // Node has no AudioContext: exactly the server-side rendering case.
    const errors: unknown[] = [];
    const s = createSiyo({ beep }, { onError: (e) => errors.push(e) });
    assert.doesNotThrow(() => s.play('beep'));
    assert.deepEqual(errors, []);
  });
});

describe('playing', () => {
  it('schedules voices relative to currentTime with an exponential decay', () => {
    const { a, s } = player({ late: ({ tone }: Voices) => tone({ f: 500, to: 250, at: 0.25, dur: 0.4, vol: 0.3 }) });
    a.ctx.currentTime = 2;
    s.play('late');
    const [osc] = a.ctx.all<FakeOsc>('osc');
    assert.ok(osc);
    assert.equal(osc.started, 2.25);
    assert.ok(Math.abs((osc.stopped ?? 0) - 2.7) < 1e-9);
    const last = osc.frequency.events.at(-1);
    assert.deepEqual([last?.kind, last?.value, last?.time], ['exp', 250, 2.65]);
  });

  it('reports unknown names (including inherited keys) instead of staying silent', () => {
    const { a, s, errors } = player({ beep });
    for (const name of ['nope', 'constructor', 'toString']) (s.play as (n: string) => void)(name);
    assert.equal(errors.length, 3);
    assert.match(String((errors[0] as Error).message), /unknown sound "nope"/);
    assert.equal(a.created(), 0);
  });

  it('passes options to the recipe, defaulting to an empty object', () => {
    const seen: unknown[] = [];
    const { s } = player({ spy: (_v: Voices, o: { x?: number } = {}) => void seen.push(o) });
    s.play('spy');
    s.play('spy', { x: 2 });
    assert.deepEqual(seen, [{}, { x: 2 }]);
  });

  it('adds a panner only when pan is set', () => {
    const { a, s } = player({
      dry: ({ tone }: Voices) => tone({ f: 440 }),
      wide: ({ tone }: Voices) => tone({ f: 440, pan: -0.5, rev: 0.3 }),
    });
    s.play('dry');
    assert.equal(a.ctx.all('panner').length, 0);
    s.play('wide');
    assert.equal(a.ctx.all('panner').length, 1);
  });

  it('stays centered on a context without createStereoPanner', () => {
    const { a, s, errors } = player({ wide: ({ tone }: Voices) => tone({ f: 440, pan: 1 }) });
    (a.ctx as unknown as { createStereoPanner?: unknown }).createStereoPanner = undefined;
    s.play('wide');
    assert.deepEqual(errors, []);
    assert.equal(a.ctx.all('panner').length, 0);
  });

  it('loops noise so long bursts never run off the buffer', () => {
    const { a, s } = player({ n: ({ noise }: Voices) => noise({ f: 2000, dur: 0.8 }) });
    s.play('n');
    assert.equal(a.ctx.all<FakeBufferSource>('buffersource')[0]?.loop, true);
  });

  it('builds a bell from four partials', () => {
    const { a, s } = player({ b: ({ bell }: Voices) => bell({ f: 1000 }) });
    s.play('b');
    const freqs = a.ctx.all<FakeOsc>('osc').map((o) => o.frequency.events[0]?.value ?? 0);
    assert.equal(freqs.length, 4);
    // Each partial sits at its ratio, within the engine's +/-0.6% random detune.
    [1, 2.76, 5.4, 8.93].forEach((ratio, i) => {
      assert.ok(Math.abs((freqs[i] ?? 0) / 1000 / ratio - 1) < 0.01);
    });
  });

  it('leaves out bell partials above the Nyquist frequency', () => {
    const { a, s } = player({ b: ({ bell }: Voices) => bell({ f: 3000 }) }, 22050); // Nyquist 11025 Hz
    s.play('b');
    // 3000 and 8280 fit; 16200 and 26790 do not.
    assert.equal(a.ctx.all<FakeOsc>('osc').length, 2);
  });

  it('builds a mallet from the note, an overtone two octaves up and a sub an octave down', () => {
    const { a, s, errors } = player({ m: ({ mallet }: Voices) => mallet({ f: 400, vol: 0.2, dur: 0.5 }) });
    s.play('m');
    assert.deepEqual(errors, []);
    const oscs = a.ctx.all<FakeOsc>('osc');
    assert.equal(oscs.length, 3);
    // Each partial sits at its ratio, within the engine's +/-0.6% random detune...
    [1, 4, 0.5].forEach((ratio, i) => {
      assert.ok(Math.abs((oscs[i]?.frequency.events[0]?.value ?? 0) / 400 / ratio - 1) < 0.01);
    });
    // ...rings for its share of the duration (plus the oscillator's stop padding)...
    [0.5, 0.125, 0.2].forEach((dur, i) => {
      assert.ok(Math.abs((oscs[i]?.stopped ?? 0) - (dur + 0.05)) < 1e-9);
    });
    // ...and peaks at its share of the volume.
    const peaks = a.ctx
      .all<FakeGain>('gain')
      .flatMap((g) => g.gain.events.filter((e) => e.kind === 'linear').map((e) => e.value));
    [0.2, 0.05, 0.06].forEach((vol, i) => {
      assert.ok(Math.abs((peaks[i] ?? 0) - vol) < 1e-9);
    });
  });

  it('leaves out a mallet overtone above the Nyquist frequency', () => {
    const { a, s } = player({ m: ({ mallet }: Voices) => mallet({ f: 3000 }) }, 22050); // the overtone, 12 kHz, does not fit
    s.play('m');
    assert.equal(a.ctx.all<FakeOsc>('osc').length, 2);
  });
});

describe('robustness: bad input never throws into the caller', () => {
  const cases: Array<[string, (v: Voices) => void, RegExp]> = [
    ['NaN frequency', ({ tone }) => tone({ f: Number.NaN }), /tone\.f must be a number above zero, got NaN/],
    ['Infinity frequency', ({ tone }) => tone({ f: Infinity }), /tone\.f/],
    ['negative frequency', ({ tone }) => tone({ f: -440 }), /tone\.f/],
    [
      'negative glide target',
      ({ tone }) => tone({ f: 440, to: -100 }),
      /tone\.to must be a number above zero, got -100/,
    ],
    ['negative delay', ({ tone }) => tone({ f: 440, at: -0.1 }), /tone\.at must be zero or more/],
    ['zero duration', ({ tone }) => tone({ f: 440, dur: 0 }), /tone\.dur must be a number above zero/],
    ['NaN volume', ({ noise }) => noise({ f: 1000, vol: Number.NaN }), /noise\.vol/],
    ['bad lowpass sweep', ({ tone }) => tone({ f: 440, lp: [300, -1] }), /tone\.lp\[1\]/],
    ['bad bell', ({ bell }) => bell({ f: 0 }), /bell\.f/],
    ['bad mallet', ({ mallet }) => mallet({ f: Number.NaN }), /mallet\.f must be a number above zero/],
    ['bad mallet timing', ({ mallet }) => mallet({ f: 440, dur: -1 }), /mallet\.dur/],
  ];
  for (const [label, recipe, message] of cases) {
    it(`reports a clear error for ${label}, creating no node for the bad voice`, () => {
      const { a, s, errors } = player({ bad: recipe });
      assert.doesNotThrow(() => s.play('bad'));
      assert.equal(errors.length, 1);
      assert.match((errors[0] as Error).message, message);
      assert.equal(a.ctx.all('osc').length + a.ctx.all('buffersource').length, 0);
    });
  }

  it('treats a glide target of 0 as "no glide" (what tuned() produces)', () => {
    const { a, s, errors } = player({ x: ({ tone }: Voices) => tone({ f: 440, to: 0 }) });
    s.play('x');
    assert.deepEqual(errors, []);
    assert.equal(a.ctx.all<FakeOsc>('osc')[0]?.frequency.events.length, 1);
  });

  it('keeps voices that were scheduled before a failing one', () => {
    const { a, s, errors } = player({
      mixed: ({ tone }: Voices) => {
        tone({ f: 440 });
        tone({ f: Number.NaN });
        tone({ f: 660 });
      },
    });
    s.play('mixed');
    assert.equal(errors.length, 1);
    assert.equal(a.ctx.all('osc').length, 1);
  });

  it('reports a recipe that throws, and still releases its routing', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const { a, s, errors } = player({
      bad: () => {
        throw new Error('boom');
      },
    });
    assert.doesNotThrow(() => s.play('bad'));
    assert.match((errors[0] as Error).message, /boom/);
    const [, , dry, wet] = a.ctx.all<FakeGain>('gain') as [FakeGain, FakeGain, FakeGain, FakeGain];
    mock.timers.tick(600);
    assert.ok(dry.disconnected && wet.disconnected);
  });

  it('caps an attack longer than the duration instead of inverting the envelope', () => {
    const { a, s, errors } = player({ x: ({ tone }: Voices) => tone({ f: 440, attack: 0.5, dur: 0.1 }) });
    s.play('x');
    assert.deepEqual(errors, []);
    assert.equal(a.ctx.invertedEvents(), 0);
  });

  it('reports a failing context factory once, and recovers on a later play', () => {
    const a = fakeAudio();
    const errors: unknown[] = [];
    let attempts = 0;
    const s = createSiyo(
      { beep },
      {
        onError: (e) => errors.push(e),
        createContext: () => {
          attempts++;
          if (attempts < 3) throw new Error('NotSupportedError');
          return a.createContext();
        },
      },
    );
    assert.doesNotThrow(() => {
      s.play('beep');
      s.play('beep');
    });
    assert.equal(errors.length, 1, 'reported once, not once per sound');
    s.play('beep');
    assert.equal(a.ctx.all('osc').length, 1, 'works once the context can be created');
  });

  it('treats a context that is already closed as no audio, instead of rebuilding on every play', () => {
    const { a, s, errors } = player({ beep });
    a.ctx.state = 'closed';
    s.play('beep');
    s.play('beep');
    assert.equal(a.ctx.created.length, 0);
    assert.deepEqual(errors, []);
  });

  it('replaces a context that was closed behind its back', () => {
    const contexts = [fakeAudio(), fakeAudio()];
    let n = 0;
    const s = createSiyo(
      { beep },
      { createContext: () => (contexts[n++] as ReturnType<typeof fakeAudio>).createContext() },
    );
    s.play('beep');
    (contexts[0] as ReturnType<typeof fakeAudio>).ctx.state = 'closed';
    s.play('beep');
    assert.equal(n, 2);
    assert.equal((contexts[1] as ReturnType<typeof fakeAudio>).ctx.all('osc').length, 1);
  });

  it('survives a context whose resume() rejects', () => {
    const { a, s, errors } = player({ beep });
    a.ctx.resume = () => Promise.reject(new Error('blocked'));
    assert.doesNotThrow(() => s.play('beep'));
    assert.deepEqual(errors, []);
  });

  it('reports a context that throws while a sound is being set up', () => {
    const { a, s, errors } = player({ beep });
    s.play('beep');
    a.ctx.createGain = () => {
      throw new Error('InvalidStateError');
    };
    assert.doesNotThrow(() => s.play('beep'));
    assert.equal(errors.length, 1);
    assert.match((errors[0] as Error).message, /InvalidStateError/);
  });

  it('reports a context failure again once an earlier context has come and gone', () => {
    const a = fakeAudio();
    const errors: unknown[] = [];
    let attempts = 0;
    const s = createSiyo(
      { beep },
      {
        onError: (e) => errors.push(e),
        createContext: () => {
          attempts++;
          if (attempts !== 2) throw new Error(`NotSupportedError ${attempts}`);
          return a.createContext();
        },
      },
    );
    s.play('beep'); // fails, reported
    s.play('beep'); // works
    s.dispose();
    s.play('beep'); // fails again: a new problem, so reported again
    assert.equal(errors.length, 2);
  });

  it('falls back to the default volume when the volume option is not a finite number', () => {
    const a = fakeAudio();
    const errors: unknown[] = [];
    const s = createSiyo(
      { beep },
      { createContext: a.createContext, volume: Number.NaN, onError: (e) => errors.push(e) },
    );
    s.play('beep');
    assert.deepEqual(errors, []);
    assert.equal((a.ctx.all<FakeGain>('gain')[0] as FakeGain).gain.value, 0.8);
    assert.equal(a.ctx.all('osc').length, 1);
  });
});

describe('user activation', () => {
  it('plays nothing before the first user gesture, and opens no audio context', () => {
    withActivation(false, () => {
      const { a, s, errors } = player({ beep });
      s.play('beep');
      s.play('beep');
      assert.equal(a.created(), 0);
      assert.deepEqual(errors, []);
    });
  });

  it('still reports an unknown sound before the first gesture', () => {
    withActivation(false, () => {
      const { s, errors } = player({ beep });
      (s.play as (n: string) => void)('nope');
      assert.equal(errors.length, 1);
    });
  });

  it('plays and resumes the context once the page has had a user gesture', () => {
    withActivation(true, () => {
      const { a, s } = player({ beep });
      s.play('beep');
      assert.equal(a.ctx.resumeCalls, 1);
      assert.equal(a.ctx.all('osc').length, 1);
    });
  });

  it('with requireGesture off, schedules sounds before a gesture without asking a locked context to resume', () => {
    withActivation(false, () => {
      const a = fakeAudio();
      const s = createSiyo({ beep }, { createContext: a.createContext, requireGesture: false });
      s.play('beep');
      s.play('beep');
      assert.equal(a.ctx.resumeCalls, 0, 'resume() cannot succeed yet and would only log a warning');
      assert.equal(a.ctx.all('osc').length, 2, 'scheduled for a context that may start by itself');
    });
  });

  it('with requireGesture off, plays straight away where audio may start without a gesture', () => {
    withActivation(false, () => {
      const a = fakeAudio();
      const s = createSiyo({ beep }, { createContext: a.createContext, requireGesture: false });
      a.ctx.state = 'running';
      s.play('beep');
      assert.equal(a.ctx.resumeCalls, 0);
      assert.equal(a.ctx.all('osc').length, 1);
    });
  });
});

describe('tuning on the player and per play', () => {
  const pitchOf = (osc: FakeOsc | undefined): number => osc?.frequency.events[0]?.value ?? 0;
  const near = (actual: number, expected: number): boolean => Math.abs(actual / expected - 1) < 0.01;

  it('applies the player tune option to every sound', () => {
    const a = fakeAudio();
    const s = createSiyo({ beep }, { createContext: a.createContext, tune: { pitch: 2 } });
    s.play('beep');
    assert.ok(near(pitchOf(a.ctx.all<FakeOsc>('osc')[0]), 880));
  });

  it('applies a per-play tune on top of the player tune', () => {
    const a = fakeAudio();
    const s = createSiyo({ beep }, { createContext: a.createContext, tune: { pitch: 2, volume: 0.5 } });
    s.play('beep', { tune: { pitch: 1.5, volume: 0.5 } });
    assert.ok(near(pitchOf(a.ctx.all<FakeOsc>('osc')[0]), 1320));
    const peak =
      a.ctx.all<FakeGain>('gain').flatMap((g) => g.gain.events.filter((e) => e.kind === 'linear'))[0]?.value ?? 0;
    assert.ok(Math.abs(peak - 0.2 * 0.25) < 1e-9, 'volume multiplies: default 0.2 x 0.5 x 0.5');
  });

  it('keeps tune out of the options the recipe sees', () => {
    const seen: unknown[] = [];
    const { s } = player({ spy: (_v: Voices, o: { open?: boolean } = {}) => void seen.push(o) });
    s.play('spy', { open: false, tune: { pitch: 2 } });
    s.play('spy', { tune: { pitch: 2 } });
    assert.deepEqual(seen, [{ open: false }, {}]);
  });

  it('reports an invalid per-play tune and plays nothing', () => {
    const { a, s, errors } = player({ beep });
    s.play('beep', { tune: { pitch: 0 } });
    assert.equal(errors.length, 1);
    assert.match((errors[0] as Error).message, /play\(\) tune knob "pitch" must be a number above zero/);
    assert.equal(a.created(), 0);
  });

  it('rejects an invalid player tune when the player is created', () => {
    assert.throws(
      () => createSiyo({ beep }, { tune: { reverb: -1 } }),
      /createSiyo\(\) tune knob "reverb" must be zero or more/,
    );
  });
});

describe('raw voice', () => {
  it('hands the build function the context, an output to connect to and the start time', () => {
    const seen: unknown[] = [];
    const { a, s, errors } = player({
      r: ({ raw }: Voices) =>
        raw(
          (ctx, output, start) => {
            seen.push(ctx, start);
            const osc = ctx.createOscillator();
            osc.connect(output);
            osc.start(start);
            osc.stop(start + 0.3);
            return start + 0.3;
          },
          { at: 0.1 },
        ),
    });
    a.ctx.currentTime = 2;
    s.play('r');
    assert.deepEqual(errors, []);
    assert.equal(seen[0], a.ctx);
    assert.equal(seen[1], 2.1);
    assert.equal(a.ctx.all<FakeOsc>('osc')[0]?.started, 2.1);
  });

  it('routes the output like any voice, with pan and a reverb send, and stop() cuts it off', () => {
    const { a, s } = player({
      r: ({ raw }: Voices) => raw((_ctx, _output, start) => start + 0.2, { pan: -0.4, rev: 0.3 }),
    });
    s.play('r');
    assert.equal(a.ctx.all('panner').length, 1);
    const [, , dry] = a.ctx.all<FakeGain>('gain') as [FakeGain, FakeGain, FakeGain];
    s.stop();
    assert.equal(dry.disconnected, true);
  });

  it('keeps the sound routed until the end time the build function returns', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const { a, s } = player({ r: ({ raw }: Voices) => raw((_ctx, _output, start) => start + 2) });
    s.play('r');
    const dry = a.ctx.all<FakeGain>('gain')[2] as FakeGain;
    mock.timers.tick(2400);
    assert.equal(dry.disconnected, false);
    mock.timers.tick(200);
    assert.equal(dry.disconnected, true);
  });

  it('reports a build function that does not say when the sound ends', () => {
    const { s, errors } = player({ r: ({ raw }: Voices) => raw((() => undefined) as unknown as () => number) });
    assert.doesNotThrow(() => s.play('r'));
    assert.match((errors[0] as Error).message, /raw\(\) build must return the context time its sound ends/);
  });

  it('leaves a raw voice untouched by tuning', () => {
    const starts: number[] = [];
    const a = fakeAudio();
    const s = createSiyo(
      {
        r: ({ raw }: Voices) =>
          raw(
            (_ctx, _output, start) => {
              starts.push(start);
              return start + 1;
            },
            { at: 0.5 },
          ),
      },
      {
        createContext: a.createContext,
        tune: { length: 2 },
      },
    );
    s.play('r');
    assert.deepEqual(starts, [0.5]);
  });
});

describe('mute, volume, stop, dispose', () => {
  it('muting prevents playback and context creation', () => {
    const a = fakeAudio();
    const s = createSiyo({ beep }, { createContext: a.createContext, muted: true });
    s.play('beep');
    assert.equal(a.created(), 0);
    s.mute(false);
    s.play('beep');
    assert.equal(a.created(), 1);
  });

  it('applies and clamps volume, and ignores non-finite values', () => {
    const a = fakeAudio();
    const s = createSiyo({ beep }, { createContext: a.createContext, volume: 0.5 });
    s.play('beep');
    const master = (): number => (a.ctx.all<FakeGain>('gain')[0] as FakeGain).gain.value;
    assert.equal(master(), 0.5);
    s.volume(0.25);
    assert.equal(master(), 0.25);
    s.volume(5);
    assert.equal(master(), 1);
    s.volume(-1);
    assert.equal(master(), 0);
    s.volume(Number.NaN);
    assert.equal(master(), 0);
  });

  it('uses the volume set before the engine exists', () => {
    const a = fakeAudio();
    const s = createSiyo({ beep }, { createContext: a.createContext });
    s.volume(0.3);
    s.play('beep');
    assert.equal((a.ctx.all<FakeGain>('gain')[0] as FakeGain).gain.value, 0.3);
  });

  it('stop() disconnects every live sound and keeps the master connected', () => {
    const { a, s } = player({ beep });
    s.play('beep');
    // Gain creation order: master, reverb send, then this play's dry and wet.
    const [master, , dry, wet] = a.ctx.all<FakeGain>('gain') as [FakeGain, FakeGain, FakeGain, FakeGain];
    assert.equal(dry.disconnected, false);
    s.stop();
    assert.ok(dry.disconnected && wet.disconnected);
    assert.equal(master.disconnected, false);
  });

  it('stop() on a context that was closed behind its back creates no new nodes', () => {
    const { a, s } = player({ beep });
    s.play('beep');
    a.ctx.state = 'closed';
    const before = a.ctx.created.length;
    assert.doesNotThrow(() => s.stop());
    assert.equal(a.ctx.created.length, before);
  });

  it('stop() also drops the reverb tail, and later sounds still reach a working reverb', () => {
    const { a, s } = player({ wet: ({ tone }: Voices) => tone({ f: 440, rev: 0.5 }) });
    s.play('wet');
    const [first] = a.ctx.all<FakeNode>('convolver');
    s.stop();
    const convolvers = a.ctx.all<FakeNode & { buffer: unknown }>('convolver');
    assert.equal(convolvers.length, 2, 'a fresh convolver replaces the ringing one');
    assert.equal(first?.disconnected, true);
    assert.ok(convolvers[1]?.buffer, 'the new convolver reuses the impulse response');
    assert.ok(convolvers[1]?.connections.length, 'and feeds the master');
    assert.doesNotThrow(() => s.play('wet'));
  });
});

describe('cleanup timing', () => {
  it('releases a short sound soon after it ends, not after a fixed 3.5 s', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const { a, s } = player({ beep }); // ends at 0.15 s
    s.play('beep');
    const dry = a.ctx.all<FakeGain>('gain')[2] as FakeGain;
    mock.timers.tick(600);
    assert.equal(dry.disconnected, false);
    mock.timers.tick(100);
    assert.equal(dry.disconnected, true);
  });

  it('does not cut off a long custom sound', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const { a, s } = player({ long: ({ tone }: Voices) => tone({ f: 440, dur: 6 }) });
    s.play('long');
    const dry = a.ctx.all<FakeGain>('gain')[2] as FakeGain;
    mock.timers.tick(5000);
    assert.equal(dry.disconnected, false, 'still ringing at 5 s');
    mock.timers.tick(1700);
    assert.equal(dry.disconnected, true);
  });

  it('does not keep a Node process alive: cleanup timers are unref()ed', () => {
    const g = globalThis as unknown as { setTimeout: (cb: () => void, ms: number) => unknown };
    const original = g.setTimeout;
    let unrefs = 0;
    g.setTimeout = () => ({
      unref: () => {
        unrefs++;
      },
    });
    try {
      const { s } = player({ beep });
      s.play('beep');
    } finally {
      g.setTimeout = original;
    }
    assert.equal(unrefs, 1);
  });

  it('dispose() closes a context the player created itself, and the player keeps working', () => {
    withDefaultContext((contexts) => {
      const s = createSiyo({ beep });
      s.play('beep');
      s.dispose();
      assert.equal(contexts[0]?.closeCalls, 1);
      s.play('beep');
      assert.equal(contexts.length, 2, 'the next sound opens a fresh context');
      assert.equal(contexts[1]?.all('osc').length, 1);
    });
  });

  it('dispose() never closes a context from createContext: it only cuts the player loose', () => {
    const { a, s } = player({ beep });
    s.play('beep');
    const [limiter] = a.ctx.all('compressor');
    s.dispose();
    assert.equal(a.ctx.closeCalls, 0, 'the caller owns this context, and may be using it');
    assert.equal(limiter?.disconnected, true, 'the player is no longer wired to the destination');
    s.play('beep');
    assert.equal(a.created(), 2, 'the next sound builds a fresh graph on it');
    assert.equal(a.ctx.all('compressor').length, 2);
  });

  it('dispose() works on a context without close()', () => {
    withDefaultContext((contexts) => {
      const errors: unknown[] = [];
      const s = createSiyo({ beep }, { onError: (e) => errors.push(e) });
      s.play('beep');
      (contexts[0] as unknown as { close?: unknown }).close = undefined;
      assert.doesNotThrow(() => s.dispose());
      assert.deepEqual(errors, []);
    });
  });

  it('methods work when destructured from the player', () => {
    const { s } = player({ beep });
    const { play, stop, dispose } = s;
    play('beep');
    stop();
    assert.doesNotThrow(dispose);
  });
});
