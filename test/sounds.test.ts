import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSiyo, SOUNDS, type SoundName, siyo, type TuneKnobs, tuned, type Voices } from '../src/index.js';
import * as sounds from '../src/sounds.js';
import { type FakeNode, type FakeOsc, fakeAudio } from './mock-audio.js';

const names = Object.keys(SOUNDS) as SoundName[];
const play = (s: unknown): ((name: string, options?: object) => void) =>
  (s as { play: (n: string, o?: object) => void }).play;

/** Every option variant a built-in sound understands. */
const VARIANTS: Array<[SoundName, Record<string, unknown>]> = [
  ['menu', { open: false }],
  ['sidebar', { open: false }],
  ['dialog', { open: false }],
  ['popover', { open: false }],
  ['window', { open: false }],
  ['expand', { open: false }],
  ['toggle', { on: false }],
  ['lock', { on: false }],
  ['favorite', { on: false }],
  ['record', { on: false }],
  ['connect', { on: false }],
  ['tick', { pitch: 1.4 }],
  ['scrub', { pitch: 0.7 }],
  ['copy', { paste: true }],
  ['zoom', { in: false }],
];

/** Run every sound (and variant) on a strict fake context; return what went wrong. */
function runAll(wrap: (r: (typeof SOUNDS)[SoundName]) => (typeof SOUNDS)[SoundName] = (r) => r) {
  const a = fakeAudio();
  const errors: unknown[] = [];
  const wrapped = Object.fromEntries(names.map((n) => [n, wrap(SOUNDS[n])]));
  const s = createSiyo(wrapped, { createContext: a.createContext, onError: (e) => errors.push(e) });
  for (const name of names) play(s)(name);
  for (const [name, opts] of VARIANTS) play(s)(name, opts);
  return { a, errors };
}

describe('built-in sounds', () => {
  it('ships the 45 curated interface sounds', () => {
    assert.equal(names.length, 45);
  });

  it('exports every sound as its own named export, identical to SOUNDS', () => {
    const named = Object.entries(sounds).filter(([k, v]) => typeof v === 'function' && k !== 'SOUNDS');
    assert.equal(named.length, 45);
    for (const [name, fn] of named) assert.equal(SOUNDS[name as SoundName], fn, name);
  });

  it('plays every sound and option variant with no errors and well-ordered envelopes', () => {
    const { a, errors } = runAll();
    assert.deepEqual(errors, []);
    assert.equal(a.ctx.invertedEvents(), 0);
  });

  it('options change the sound: closing menu glides down, opening glides up', () => {
    const glide = (open: boolean): number[] => {
      const a = fakeAudio();
      createSiyo(SOUNDS, { createContext: a.createContext }).play('menu', { open });
      return (a.ctx.all<FakeOsc>('osc')[0] as FakeOsc).frequency.events.map((e) => e.value);
    };
    const opening = glide(true);
    const closing = glide(false);
    assert.ok((opening.at(-1) ?? 0) > (opening[0] ?? 0));
    assert.ok((closing.at(-1) ?? 0) < (closing[0] ?? 0));
  });

  it('the default player exposes every built-in sound', () => {
    assert.equal(typeof siyo.play, 'function');
    assert.doesNotThrow(() => siyo.play('back'));
  });
});

describe('tuned', () => {
  const capture = (recipe: (v: Voices) => void): Array<Record<string, unknown>> => {
    const calls: Array<Record<string, unknown>> = [];
    const log = (p: object): void => void calls.push({ ...p });
    recipe({ tone: log, noise: log, bell: log, mallet: log, raw: () => undefined });
    return calls;
  };
  const source = ({ tone, noise, bell }: Voices): void => {
    tone({ f: 400, to: 800, at: 0.1, dur: 0.2, vol: 0.1, lp: [1000, 2000] });
    noise({ f: 1000, to: 3000, dur: 0.1 });
    bell({ f: 1000 });
  };

  it('with no knobs leaves values unchanged', () => {
    const [t, n, b] = capture((v) => tuned(source, {})(v, undefined));
    assert.equal(t?.['f'], 400);
    assert.equal(t?.['to'], 800);
    assert.deepEqual(t?.['lp'], [1000, 2000]);
    assert.equal(n?.['f'], 1000);
    assert.equal(b?.['f'], 1000);
  });

  it('scales pitch, length, volume, reverb and brightness', () => {
    const [t, n, b] = capture((v) =>
      tuned(source, { pitch: 2, length: 2, volume: 0.5, reverb: 0.25, brightness: 0.5 })(v, undefined),
    );
    assert.equal(t?.['f'], 800);
    assert.equal(t?.['to'], 1600);
    assert.equal(t?.['at'], 0.2);
    assert.equal(t?.['dur'], 0.4);
    assert.equal(t?.['vol'], 0.05);
    assert.equal(t?.['rev'], 0.25);
    assert.deepEqual(t?.['lp'], [500, 1000]);
    assert.equal(n?.['f'], 500); // noise follows brightness, not pitch
    assert.equal(n?.['to'], 1500);
    assert.equal(b?.['f'], 2000);
    assert.equal(b?.['dur'], 2); // bell default duration 1 * length 2
  });

  it('scales the attack of tones and noise, and leaves struck voices striking', () => {
    const shaped = ({ tone, noise, bell, mallet }: Voices): void => {
      tone({ f: 400, attack: 0.01 });
      noise({ f: 1000 });
      bell({ f: 1000 });
      mallet({ f: 500 });
    };
    const [t, n, b, m] = capture((v) => tuned(shaped, { attack: 3 })(v, undefined));
    assert.ok(Math.abs((t?.['attack'] as number) - 0.03) < 1e-12);
    assert.ok(Math.abs((n?.['attack'] as number) - 0.003) < 1e-12, 'noise default attack 0.001 x 3');
    assert.ok(!('attack' in (b ?? {})));
    assert.ok(!('attack' in (m ?? {})));
  });

  it('tunes the mallet like the bell: pitch, timing, volume and reverb', () => {
    const struck = ({ mallet }: Voices): void => {
      mallet({ f: 500, at: 0.1, dur: 0.4, vol: 0.2 });
      mallet({ f: 300 });
    };
    const [m, plain] = capture((v) => tuned(struck, { pitch: 2, length: 2, volume: 0.5, reverb: 0.25 })(v, undefined));
    assert.equal(m?.['f'], 1000);
    assert.equal(m?.['at'], 0.2);
    assert.equal(m?.['dur'], 0.8);
    assert.equal(m?.['vol'], 0.1);
    assert.equal(m?.['rev'], 0.25);
    assert.equal(plain?.['dur'], 1); // mallet default duration 0.5 * length 2
  });

  it('does not invent optional fields that the recipe left unset', () => {
    const [t] = capture((v) => tuned(({ tone }: Voices) => tone({ f: 300 }), { pitch: 2 })(v, undefined));
    assert.ok(!('to' in (t ?? {})));
    assert.ok(!('lp' in (t ?? {})));
  });

  it('passes recipe options through', () => {
    const recipe = ({ tone }: Voices, { up = true }: { up?: boolean } = {}): void => tone({ f: up ? 800 : 400 });
    const [t] = capture((v) => tuned(recipe, { pitch: 2 })(v, { up: false }));
    assert.equal(t?.['f'], 800);
  });

  it('neutral tuning is audibly identical for every built-in sound', () => {
    // Same seeded randomness for both runs, so any difference is a real one.
    const events = (wrap: Parameters<typeof runAll>[0]): unknown[] => {
      let n = 0;
      const real = Math.random;
      Math.random = () => (++n * 0.6180339887) % 1;
      try {
        const { a } = runAll(wrap);
        return a.ctx.created.map((node) =>
          Object.entries(node)
            .filter(([, v]) => typeof v === 'object' && v !== null && 'events' in v)
            .map(([k, v]) => [k, (v as { events: unknown }).events]),
        );
      } finally {
        Math.random = real;
      }
    };
    assert.deepEqual(
      events((r) => tuned(r as never, {}) as never),
      events((r) => r),
    );
  });

  it('stays valid at the extremes of every knob, for every built-in sound', () => {
    const extremes: Array<Partial<TuneKnobs>> = [
      { pitch: 0.5, length: 0.4, volume: 0.05, brightness: 0.4, attack: 0.25 },
      { pitch: 2, length: 2.5, volume: 1.5, reverb: 1, brightness: 2, attack: 4 },
      { pitch: 2, length: 0.4, reverb: 1, attack: 8 },
    ];
    for (const knobs of extremes) {
      const { a, errors } = runAll((r) => tuned(r as never, knobs) as never);
      assert.deepEqual(errors, [], JSON.stringify(knobs));
      assert.equal(a.ctx.invertedEvents(), 0, JSON.stringify(knobs));
    }
  });

  it('rejects invalid knobs immediately, with a clear message', () => {
    for (const bad of [
      { pitch: 0 },
      { pitch: -1 },
      { length: Number.NaN },
      { volume: Infinity },
      { brightness: 0 },
      { attack: 0 },
    ]) {
      assert.throws(
        () => tuned(source, bad),
        /knob "(pitch|length|attack|volume|brightness)" must be a number above zero/,
      );
    }
    assert.throws(() => tuned(source, { reverb: -0.1 }), /knob "reverb" must be zero or more/);
    assert.doesNotThrow(() => tuned(source, { reverb: 0 }));
  });
});

// Keeps the helper type referenced for readers skimming imports.
export type { FakeNode };
