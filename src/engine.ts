/**
 * The Siyo audio engine.
 *
 * Siyo synthesizes every sound live with the Web Audio API, so there are no
 * audio files to ship. The engine owns three things:
 *
 * 1. A lazily created audio context and a shared signal chain:
 *    `voices -> master gain -> limiter -> speakers`, plus a shared reverb.
 * 2. The voices recipes layer: `tone`, `noise`, `bell` and `mallet`, plus the
 *    `raw` escape hatch for hand-built graphs.
 * 3. A small player API: `play`, `stop`, `volume`, `mute` and `dispose`.
 *
 * The engine is headless. It never touches `window` or `document` and compiles
 * without the DOM type library; it only needs an object shaped like
 * {@link AudioContextLike}. The only globals it reads, each optional and typed
 * locally, are the `AudioContext` constructors, `setTimeout`, `console` and
 * `navigator.userActivation`.
 *
 * @module
 */

import type { AudioBufferLike, AudioContextLike, ConvolverNodeLike, GainNodeLike, NodeLike } from './context.js';
import { BELL_DEFAULTS, DEFAULT_VOL, MALLET_DEFAULTS, NOISE_DEFAULTS, TONE_DEFAULTS } from './defaults.js';
import type { TuneKnobs } from './tune.js';
import { combineKnobs, isNeutral, NEUTRAL, resolveKnobs, tuneVoices } from './tune.js';
import type {
  BellParams,
  CommonVoiceParams,
  MalletParams,
  NoiseParams,
  RawBuild,
  RawParams,
  Recipes,
  Siyo,
  SiyoOptions,
  ToneParams,
  Voices,
} from './types.js';

// Constants

/** Default master volume. Leaves headroom so layered sounds do not clip. */
const DEFAULT_VOLUME = 0.8;

/**
 * Gain value treated as silence. Exponential ramps cannot reach or start from
 * exactly zero, so envelopes start and end here instead.
 */
const SILENCE = 0.0001;

/** Length of the synthetic room impulse response, in seconds. */
const REVERB_SECONDS = 1.4;

/** Length of the shared noise buffer, in seconds. Looped for long noise voices. */
const NOISE_SECONDS = 1;

/**
 * Extra time, in milliseconds, a sound's routing is kept after its last voice
 * has ended. It absorbs timer jitter and the short delay while a browser
 * resumes a suspended context, so the very first sound is never cut off.
 */
const RELEASE_MARGIN_MS = 500;

/** Extra time an oscillator keeps running after its envelope has decayed. */
const OSC_STOP_PADDING = 0.05;

/** Extra time a noise source keeps running after its envelope has decayed. */
const NOISE_STOP_PADDING = 0.02;

/**
 * How long a raw voice is kept routed when its build function does not say
 * when it ends. Generous, so a mistake never cuts a sound short.
 */
const RAW_FALLBACK_SECONDS = 5;

/**
 * Bell partials as `[frequency ratio, relative volume, relative duration]`.
 * The ratios are deliberately inharmonic, which is what makes a struck bell
 * sound like glass or metal rather than an organ. Higher partials are quieter
 * and die away sooner, like a real strike.
 */
const BELL_PARTIALS: ReadonlyArray<readonly [ratio: number, volume: number, duration: number]> = [
  [1, 1, 1],
  [2.76, 0.45, 0.55],
  [5.4, 0.2, 0.3],
  [8.93, 0.08, 0.18],
];

/**
 * Mallet partials as `[frequency ratio, relative volume, relative duration, attack]`:
 * the struck note, a bright overtone two octaves up that dies away fast, and a
 * felt sub an octave down that gives the strike its weight.
 */
const MALLET_PARTIALS: ReadonlyArray<readonly [ratio: number, volume: number, duration: number, attack: number]> = [
  [1, 1, 1, 0.002],
  [4, 0.25, 0.25, 0.001],
  [0.5, 0.3, 0.4, 0.003],
];

// Internal types

/** The shared audio graph, created once on the first sound. */
interface Engine {
  readonly ctx: AudioContextLike;
  /** Master volume. Everything is routed through this node. */
  readonly master: GainNodeLike;
  /** The limiter: the only node wired to the context's destination. */
  readonly output: NodeLike;
  /** Input of the shared reverb. */
  readonly send: GainNodeLike;
  /** Highpass in front of the reverb. */
  readonly reverbFilter: NodeLike;
  /** The impulse response, kept so the reverb can be rebuilt by `stop()`. */
  readonly impulse: AudioBufferLike;
  /** One second of white noise, reused by every noise voice. */
  readonly noiseBuffer: AudioBufferLike;
  /** The current convolver. Replaced by `stop()` to drop the reverb tail. */
  reverb: ConvolverNodeLike;
}

/**
 * Per-play routing. Each call to `play()` gets its own dry and wet gain nodes
 * so that `stop()` can silence exactly the sounds that are playing, and so
 * the nodes can be disconnected and garbage collected afterwards.
 */
interface Bus {
  /** Dry signal, feeds the master gain. */
  readonly dry: GainNodeLike;
  /** Reverb send, feeds the shared reverb input. */
  readonly wet: GainNodeLike;
  /** Context time at which the last voice of this sound ends. */
  endsAt: number;
}

/** A recipe with its options widened, for calling by string name at runtime. */
type LooseRecipe = (voices: Voices, options: unknown) => void;

/** The few globals the engine reads, typed locally so no DOM types are needed. */
interface GlobalLike {
  AudioContext?: new (options?: { latencyHint?: string }) => AudioContextLike;
  webkitAudioContext?: new (options?: { latencyHint?: string }) => AudioContextLike;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  console?: { error?: (...data: unknown[]) => void };
  navigator?: { userActivation?: { hasBeenActive?: boolean } };
}

// Helpers

const globals = (): GlobalLike => globalThis as unknown as GlobalLike;

/** Clamp a number into the range 0 to 1. */
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** A function that intentionally does nothing. */
const noop = (): void => undefined;

/**
 * Create the default audio context, or `null` when the environment has none
 * (server-side rendering, Node, very old browsers).
 */
function defaultCreateContext(): AudioContextLike | null {
  const g = globals();
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
}

/** Report an error to the default sink: `console.error` when it exists. */
function defaultOnError(error: unknown): void {
  globals().console?.error?.(error);
}

/**
 * Run `callback` after `ms` milliseconds without keeping a Node process alive.
 * Browsers ignore `unref`, which only exists on Node timers.
 */
function schedule(callback: () => void, ms: number): void {
  const timer = globals().setTimeout?.(callback, ms);
  (timer as { unref?: () => void } | undefined)?.unref?.();
}

/**
 * Whether the page has had a click, tap or key press, which browsers require
 * before audio may start. Where the platform cannot tell (no
 * `navigator.userActivation`), assume it has.
 */
function hasUserActivation(): boolean {
  return globals().navigator?.userActivation?.hasBeenActive !== false;
}

// Validation

/** What a numeric voice parameter must satisfy. */
type Rule = 'finite' | 'nonNegative' | 'positive';

/**
 * Check one numeric parameter. Browsers throw cryptic errors for non-finite or
 * out-of-range automation values, so Siyo checks first and reports clearly,
 * before any audio node has been created for the voice.
 */
function check(voice: string, field: string, value: number | undefined, rule: Rule): void {
  if (value === undefined) return;
  const ok = Number.isFinite(value) && (rule === 'finite' || (rule === 'nonNegative' ? value >= 0 : value > 0));
  if (!ok) {
    const need = rule === 'finite' ? 'a finite number' : rule === 'positive' ? 'a number above zero' : 'zero or more';
    throw new RangeError(`siyo: ${voice}.${field} must be ${need}, got ${String(value)}`);
  }
}

/** Validate the parameters every voice shares. */
function checkCommon(voice: string, o: CommonVoiceParams): void {
  check(voice, 'at', o.at, 'nonNegative');
  check(voice, 'dur', o.dur, 'positive');
  check(voice, 'vol', o.vol, 'nonNegative');
  check(voice, 'attack', o.attack, 'nonNegative');
  check(voice, 'pan', o.pan, 'finite');
  check(voice, 'rev', o.rev, 'nonNegative');
}

/** An end frequency or glide target. `0` is accepted and means "none". */
function checkTarget(voice: string, field: string, value: number | undefined): void {
  if (value !== 0) check(voice, field, value, 'positive');
}

// Signal chain

/**
 * Build the shared signal chain. Each sound's dry signal goes straight to the
 * master gain; its reverb send passes through the shared room first:
 *
 * - dry: `bus.dry -> master -> limiter -> destination`
 * - wet: `bus.wet -> send -> highpass -> reverb -> master`
 */
function buildEngine(ctx: AudioContextLike, volume: number): Engine {
  const master = ctx.createGain();
  master.gain.value = volume;

  // A gentle limiter so stacked layers never clip the output.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // Room: a stereo impulse response made of noise that fades out with a cubic
  // curve. It is cheap to generate and gives a soft, short, glassy space.
  const length = Math.max(1, Math.floor(ctx.sampleRate * REVERB_SECONDS));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.2;
    }
  }

  // Cut low frequencies from the reverb input so the room never sounds muddy.
  const reverbFilter = ctx.createBiquadFilter();
  reverbFilter.type = 'highpass';
  reverbFilter.frequency.value = 350;

  const send = ctx.createGain();
  send.connect(reverbFilter);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse;
  reverbFilter.connect(reverb);
  reverb.connect(master);

  // White noise shared by every noise voice.
  const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * NOISE_SECONDS)), ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

  return { ctx, master, output: limiter, send, reverbFilter, impulse, noiseBuffer, reverb };
}

/**
 * Cut off whatever is still ringing in the shared reverb.
 *
 * Disconnecting a sound's routing stops new audio entering the reverb, but the
 * convolver keeps playing out what it already received. Swapping in a fresh
 * convolver (reusing the same impulse) drops that tail immediately.
 */
function dropReverbTail(engine: Engine): void {
  engine.reverbFilter.disconnect();
  engine.reverb.disconnect();
  const fresh = engine.ctx.createConvolver();
  fresh.buffer = engine.impulse;
  engine.reverbFilter.connect(fresh);
  fresh.connect(engine.master);
  engine.reverb = fresh;
}

// Voices

/** Create the three voices for one play, wired to that play's {@link Bus}. */
function createVoices(engine: Engine, bus: Bus): Voices {
  const { ctx } = engine;

  /** Record when a voice ends, so the bus can be released at the right moment. */
  const track = (end: number): void => {
    if (end > bus.endsAt) bus.endsAt = end;
  };

  /** Route a voice's output node to the bus, with optional pan and reverb send. */
  const route = (node: NodeLike, o: CommonVoiceParams): void => {
    let tail: NodeLike = node;
    // `createStereoPanner` is missing on some older engines: stay centered.
    if (o.pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = o.pan;
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(bus.dry);
    if (o.rev) {
      const send = ctx.createGain();
      send.gain.value = o.rev;
      tail.connect(send);
      send.connect(bus.wet);
    }
  };

  /**
   * Schedule a gain envelope: silence -> peak over `attack`, then exponential
   * decay to silence at `start + dur`. The attack is capped at `dur`, because
   * an attack longer than the voice would put the automation out of order.
   */
  const envelope = (gain: GainNodeLike, start: number, dur: number, vol: number, attack: number): void => {
    gain.gain.setValueAtTime(SILENCE, start);
    gain.gain.linearRampToValueAtTime(Math.max(vol, SILENCE), start + Math.min(attack, dur));
    gain.gain.exponentialRampToValueAtTime(SILENCE, start + dur);
  };

  // A pitched voice: soft attack, exponential decay, optional glide and lowpass sweep.
  const tone = (o: ToneParams): void => {
    checkCommon('tone', o);
    check('tone', 'f', o.f, 'positive');
    checkTarget('tone', 'to', o.to);
    check('tone', 'glide', o.glide, 'positive');
    if (typeof o.lp === 'number') check('tone', 'lp', o.lp, 'positive');
    else if (o.lp) {
      check('tone', 'lp[0]', o.lp[0], 'positive');
      check('tone', 'lp[1]', o.lp[1], 'positive');
    }

    const t = ctx.currentTime + (o.at ?? 0);
    const dur = o.dur ?? TONE_DEFAULTS.dur;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type ?? TONE_DEFAULTS.type;
    // Up to +/-0.6% random detune so repeated sounds feel played, not sampled.
    osc.frequency.setValueAtTime(o.f * (1 + (Math.random() - 0.5) * 0.012), t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? dur));
    envelope(gain, t, dur, o.vol ?? DEFAULT_VOL, o.attack ?? TONE_DEFAULTS.attack);

    let source: NodeLike = osc;
    if (o.lp !== undefined) {
      const [start, end] = typeof o.lp === 'number' ? [o.lp, undefined] : o.lp;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(start, t);
      if (end) filter.frequency.exponentialRampToValueAtTime(end, t + dur);
      osc.connect(filter);
      source = filter;
    }
    source.connect(gain);
    route(gain, o);
    osc.start(t);
    osc.stop(t + dur + OSC_STOP_PADDING);
    track(t + dur + OSC_STOP_PADDING);
  };

  // A filtered noise burst: the texture and "material" of a sound.
  const noise = (o: NoiseParams): void => {
    checkCommon('noise', o);
    check('noise', 'f', o.f, 'positive');
    checkTarget('noise', 'to', o.to);
    check('noise', 'q', o.q, 'nonNegative');

    const t = ctx.currentTime + (o.at ?? 0);
    const dur = o.dur ?? NOISE_DEFAULTS.dur;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = engine.noiseBuffer;
    // Loop so that long bursts never run off the end of the one-second buffer.
    source.loop = true;
    filter.type = o.type ?? NOISE_DEFAULTS.type;
    filter.Q.value = o.q ?? NOISE_DEFAULTS.q;
    filter.frequency.setValueAtTime(o.f, t);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    envelope(gain, t, dur, o.vol ?? DEFAULT_VOL, o.attack ?? NOISE_DEFAULTS.attack);
    source.connect(filter);
    filter.connect(gain);
    route(gain, o);
    // Start at a random offset so repeated bursts are never identical.
    source.start(t, Math.random() * 0.5);
    source.stop(t + dur + NOISE_STOP_PADDING);
    track(t + dur + NOISE_STOP_PADDING);
  };

  // A struck glass bell: inharmonic partials that decay at different speeds.
  const bell = (o: BellParams): void => {
    checkCommon('bell', o);
    check('bell', 'f', o.f, 'positive');
    // A partial above the Nyquist frequency cannot be represented: it would
    // alias into a wrong, harsh pitch, so it is left out.
    const nyquist = ctx.sampleRate / 2;
    for (const [ratio, volume, duration] of BELL_PARTIALS) {
      if (o.f * ratio >= nyquist) continue;
      tone({
        ...o,
        f: o.f * ratio,
        vol: (o.vol ?? DEFAULT_VOL) * volume,
        dur: (o.dur ?? BELL_DEFAULTS.dur) * duration,
        attack: BELL_DEFAULTS.attack,
      });
    }
  };

  // A soft struck note: the note, a bright overtone that fades fast, and a felt sub.
  const mallet = (o: MalletParams): void => {
    checkCommon('mallet', o);
    check('mallet', 'f', o.f, 'positive');
    // Like the bell, an overtone above the Nyquist frequency is left out.
    const nyquist = ctx.sampleRate / 2;
    for (const [ratio, volume, duration, attack] of MALLET_PARTIALS) {
      if (o.f * ratio >= nyquist) continue;
      tone({
        ...o,
        f: o.f * ratio,
        vol: (o.vol ?? DEFAULT_VOL) * volume,
        dur: (o.dur ?? MALLET_DEFAULTS.dur) * duration,
        attack,
      });
    }
  };

  // The escape hatch: a graph the recipe builds itself, routed like any voice.
  const raw = (build: RawBuild, o: RawParams = {}): void => {
    check('raw', 'at', o.at, 'nonNegative');
    check('raw', 'pan', o.pan, 'finite');
    check('raw', 'rev', o.rev, 'nonNegative');
    const start = ctx.currentTime + (o.at ?? 0);
    const output = ctx.createGain();
    route(output, o);
    const end = build(ctx, output, start);
    if (!(typeof end === 'number' && Number.isFinite(end) && end >= start)) {
      // Keep the graph routed long enough to be heard, then say what went wrong.
      track(start + RAW_FALLBACK_SECONDS);
      throw new RangeError(
        `siyo: raw() build must return the context time its sound ends, at or after ${start}, got ${String(end)}`,
      );
    }
    track(end);
  };

  return { tone, noise, bell, mallet, raw };
}

// Public API

/**
 * Create a sound player from a set of recipes.
 *
 * Nothing touches the Web Audio API until the first sound plays, so creating
 * a player is free and safe during server-side rendering.
 *
 * `play()` never throws. Problems are passed to `options.onError` (by default,
 * `console.error`), so a sound can never break the event handler it is called
 * from.
 *
 * @example
 * ```ts
 * import { createSiyo } from 'siyo/core';
 * import { tap, success } from 'siyo/sounds';
 *
 * const player = createSiyo({
 *   tap, // only the sounds you import are bundled
 *   success,
 *   ping: ({ tone }) => tone({ f: 880, dur: 0.2, vol: 0.2, rev: 0.3 }),
 * });
 *
 * button.addEventListener('click', () => player.play('ping'));
 * ```
 *
 * @param sounds - A plain object of named recipes. Option types flow into `play()`.
 * @param options - Initial volume, mute state, context factory and error handler.
 * @returns A {@link Siyo} player.
 */
export function createSiyo<R extends Recipes>(sounds: R, options: SiyoOptions = {}): Siyo<R> {
  const createContext = options.createContext ?? defaultCreateContext;
  // A context the player makes itself is closed by dispose(); one that comes
  // from `options.createContext` belongs to the caller and is left running.
  const ownsContext = options.createContext === undefined;
  const onError = options.onError ?? defaultOnError;
  const requireGesture = options.requireGesture ?? true;
  // The player's own tuning, checked here where a mistake is made.
  const baseKnobs: Readonly<TuneKnobs> = options.tune ? resolveKnobs(options.tune, 'createSiyo() tune') : NEUTRAL;
  // A non-finite volume would make the browser reject the master gain and
  // leave the player silent, so it falls back to the default.
  let level =
    options.volume !== undefined && Number.isFinite(options.volume) ? clamp01(options.volume) : DEFAULT_VOLUME;
  let muted = options.muted ?? false;
  let engine: Engine | null = null;
  let contextFailureReported = false;
  /** Buses of sounds that are still playing. */
  const live = new Set<Bus>();

  /** Create the audio graph on first use. */
  function ensureEngine(): Engine | null {
    // A context that was closed (by the page, or by the browser) never comes
    // back, so start over with a fresh one.
    if (engine && engine.ctx.state === 'closed') {
      engine = null;
      live.clear();
    }
    if (!engine) {
      try {
        const ctx = createContext();
        // No context, or one that is already closed (a shared context its owner
        // has closed), means no audio for now. Building a graph on a closed
        // context would cost a full rebuild on every play and still be silent.
        if (!ctx || ctx.state === 'closed') return null;
        engine = buildEngine(ctx, level);
        // A later failure, after this context is gone, is worth reporting again.
        contextFailureReported = false;
      } catch (error) {
        // Constructing a context can fail (browser limits, blocked audio).
        // Report once, then keep quietly retrying on later sounds.
        if (!contextFailureReported) {
          contextFailureReported = true;
          onError(error);
        }
        return null;
      }
    }
    return engine;
  }

  /** Disconnect a bus so its nodes can be garbage collected. Safe to call twice. */
  function release(bus: Bus): void {
    live.delete(bus);
    bus.dry.disconnect();
    bus.wet.disconnect();
  }

  /**
   * Split the options of one `play()` into the recipe's own options and the
   * knobs to tune it with: the player's tuning, plus the call's `tune`.
   */
  function readOptions(given: unknown): { recipeOptions: unknown; knobs: Readonly<TuneKnobs> } {
    if (typeof given === 'object' && given !== null && 'tune' in given) {
      const { tune, ...recipeOptions } = given as { tune?: Partial<TuneKnobs> };
      const knobs = tune ? combineKnobs(baseKnobs, resolveKnobs(tune, 'play() tune')) : baseKnobs;
      return { recipeOptions, knobs };
    }
    return { recipeOptions: given ?? {}, knobs: baseKnobs };
  }

  /** Silence every sound that is currently playing, including its reverb tail. */
  function stop(): void {
    for (const bus of [...live]) release(bus);
    // A closed context has nothing left ringing and takes no new nodes.
    if (engine && engine.ctx.state !== 'closed') dropReverbTail(engine);
  }

  return {
    play(name, ...args) {
      if (muted) return;
      // Own-property check: a dynamic name like "constructor" must not match.
      // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn is ES2022, newer than the browsers siyo supports
      if (!Object.prototype.hasOwnProperty.call(sounds, name)) {
        onError(new Error(`siyo: unknown sound "${String(name)}"`));
        return;
      }
      // Nothing plays before the page's first click, tap or key press: not on
      // page load, and not late, stacked on top of the first gesture's sound.
      if (requireGesture && !hasUserActivation()) return;
      const recipe = sounds[name] as unknown as LooseRecipe;

      try {
        const { recipeOptions, knobs } = readOptions((args as readonly unknown[])[0]);
        const eng = ensureEngine();
        if (!eng) return;
        const { ctx } = eng;

        // Contexts start suspended until the page's first click, tap or key
        // press. Before that, resume() cannot succeed and only makes the browser
        // log a warning, so it waits for the gesture. Where audio may start
        // without one, the context starts by itself.
        if (ctx.state !== 'running' && hasUserActivation()) void Promise.resolve(ctx.resume()).catch(noop);

        const bus: Bus = { dry: ctx.createGain(), wet: ctx.createGain(), endsAt: ctx.currentTime };
        bus.dry.connect(eng.master);
        bus.wet.connect(eng.send);
        live.add(bus);
        try {
          const voices = createVoices(eng, bus);
          recipe(isNeutral(knobs) ? voices : tuneVoices(voices, knobs), recipeOptions);
        } catch (error) {
          // Voices scheduled before the failure still play; the rest is skipped.
          onError(error);
        }
        // Release once the last voice has ended. The shared reverb keeps its own
        // tail, so the send does not need to outlive the voices.
        const remainingMs = Math.max(0, bus.endsAt - ctx.currentTime) * 1000;
        schedule(() => release(bus), remainingMs + RELEASE_MARGIN_MS);
      } catch (error) {
        // A context that misbehaves, such as a non-standard one that throws
        // from a factory method, is reported too: play() never throws.
        onError(error);
      }
    },

    stop,

    volume(next) {
      if (!Number.isFinite(next)) return;
      level = clamp01(next);
      if (engine) engine.master.gain.value = level;
    },

    mute(next) {
      muted = next;
    },

    dispose() {
      for (const bus of [...live]) release(bus);
      if (!engine) return;
      const { ctx, output } = engine;
      engine = null;
      if (ownsContext) {
        const closing = ctx.close?.();
        if (closing) void closing.catch(noop);
      } else {
        // The caller's context keeps running: cut the player's graph loose from it.
        output.disconnect();
      }
    },
  };
}
