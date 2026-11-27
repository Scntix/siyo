/**
 * Public type definitions for Siyo.
 *
 * Everything a recipe author or consumer needs lives here: the four
 * synthesis voices (`tone`, `noise`, `bell`, `mallet`) and the `raw` escape
 * hatch, the shape of a recipe, and the player returned by {@link createSiyo}.
 * This file contains no runtime code.
 *
 * @module
 */

import type { AudioContextLike, GainNodeLike, NoiseFilter, ToneWave } from './context.js';
import type { TuneKnobs } from './tune.js';

// Voice parameters

/**
 * Lowpass filter cutoff in Hz.
 *
 * - A single `number` holds the cutoff fixed for the whole voice.
 * - A `[start, end]` pair sweeps the cutoff exponentially from `start` to
 *   `end` over the voice's duration. Both values must be greater than zero.
 */
export type LowpassSpec = number | readonly [start: number, end: number];

/**
 * Parameters shared by every voice.
 *
 * All time values are in **seconds**. All gain values are **linear**
 * (`1` is full scale, `0.1` is roughly -20 dB).
 *
 * Values are validated when the voice plays: a non-finite number, a negative
 * time, or a zero duration is reported through `onError` and the voice is
 * skipped, so a bad value never throws into your event handler.
 */
export interface CommonVoiceParams {
  /**
   * Delay before the voice starts, relative to the moment `play()` is called.
   * Use it to lay several voices out in time inside one recipe.
   * @defaultValue `0`
   */
  at?: number | undefined;

  /**
   * Length of the voice. The amplitude decays exponentially to silence over
   * this time, so it is also the length of the audible tail.
   * @defaultValue `0.1` for `tone`, `0.02` for `noise`, `1` for `bell`, `0.5` for `mallet`
   */
  dur?: number | undefined;

  /**
   * Peak gain, reached at the end of the attack.
   * @defaultValue `0.2`
   */
  vol?: number | undefined;

  /**
   * Time to ramp from silence up to `vol`. Short attacks sound like clicks,
   * long ones like swells. Capped at `dur`.
   * @defaultValue `0.002` for `tone`, `0.001` for `noise` (ignored by `bell` and `mallet`, which strike instantly)
   */
  attack?: number | undefined;

  /**
   * Stereo position from `-1` (hard left) to `1` (hard right).
   * Omit or pass `0` to skip the panner and keep the voice centered.
   */
  pan?: number | undefined;

  /**
   * Amount of this voice sent to the shared reverb, from `0` (dry) to `1`.
   * Omit or pass `0` for a completely dry voice.
   */
  rev?: number | undefined;
}

/** Parameters for {@link Voices.tone}: a pitched oscillator voice. */
export interface ToneParams extends CommonVoiceParams {
  /** Start frequency in Hz. A tiny random detune is applied on every play. */
  f: number;

  /**
   * End frequency in Hz. When set, the pitch glides exponentially from `f`
   * to `to`. Must be greater than zero. Omit it (or pass `0`) for no glide.
   */
  to?: number | undefined;

  /**
   * Seconds the pitch glide takes to reach `to`. Has no effect without `to`.
   * @defaultValue the voice's `dur`
   */
  glide?: number | undefined;

  /**
   * Oscillator waveform.
   * @defaultValue `'sine'`
   */
  type?: ToneWave | undefined;

  /** Optional lowpass filter that softens the oscillator. See {@link LowpassSpec}. */
  lp?: LowpassSpec | undefined;
}

/** Parameters for {@link Voices.noise}: a filtered noise burst. */
export interface NoiseParams extends CommonVoiceParams {
  /** Filter frequency in Hz: the centre of a bandpass, or the cutoff of a low/highpass. */
  f: number;

  /**
   * End filter frequency in Hz. When set, the filter sweeps exponentially from
   * `f` to `to` over the voice's duration. Must be greater than zero.
   */
  to?: number | undefined;

  /**
   * Filter resonance. Higher values give a narrower, more pitched noise.
   * @defaultValue `1.5`
   */
  q?: number | undefined;

  /**
   * Filter shape.
   * @defaultValue `'bandpass'`
   */
  type?: NoiseFilter | undefined;
}

/** Parameters for {@link Voices.bell}: a struck, glass-like bell. */
export interface BellParams extends CommonVoiceParams {
  /** Fundamental frequency in Hz. Higher partials are derived from it. */
  f: number;
}

/** Parameters for {@link Voices.mallet}: a soft struck note. */
export interface MalletParams extends CommonVoiceParams {
  /** Frequency of the note in Hz. The overtone and the sub are derived from it. */
  f: number;
}

/** Parameters for {@link Voices.raw}: where the hand-built graph sits in the mix. */
export interface RawParams {
  /**
   * Delay before the voice starts, relative to the moment `play()` is called.
   * It moves the `start` time handed to the build function.
   * @defaultValue `0`
   */
  at?: number | undefined;
  /** Stereo position from `-1` (hard left) to `1` (hard right). Omit for centered. */
  pan?: number | undefined;
  /** Amount sent to the shared reverb, from `0` (dry) to `1`. Omit for dry. */
  rev?: number | undefined;
}

/**
 * Builds a raw voice. Create nodes on `ctx`, connect the end of your graph to
 * `output`, schedule everything from `start` (in context seconds), and return
 * the context time at which the sound has finished, so the player knows when to
 * release it. Stop the sources you start.
 */
export type RawBuild = (ctx: AudioContextLike, output: GainNodeLike, start: number) => number;

/**
 * The building blocks a recipe layers together: four synthesis voices, and a
 * raw voice for anything else the Web Audio API can do.
 *
 * Methods are declared as function-valued properties (not method syntax) so a
 * recipe may safely destructure them: `({ tone, noise }) => { ... }`.
 */
export interface Voices {
  /** Play a pitched oscillator with a soft attack and exponential decay. */
  tone: (params: ToneParams) => void;

  /** Play a burst of filtered noise: the texture, or "material", of a sound. */
  noise: (params: NoiseParams) => void;

  /**
   * Play a struck-bell timbre built from four inharmonic partials that decay
   * at different speeds. Ideal for chimes, notifications and success sounds.
   */
  bell: (params: BellParams) => void;

  /**
   * Play a soft struck note, like a marimba bar: the note itself, a bright
   * overtone two octaves up that fades fast, and a quiet sub an octave down.
   * Warmer and rounder than a bell. Good for joins, uploads and timers.
   */
  mallet: (params: MalletParams) => void;

  /**
   * The low-level escape hatch: build any Web Audio graph yourself, such as a
   * decoded audio file or an FM patch, and play it through the player's
   * volume, limiter, reverb and `stop()`. Tuning does not reach inside it.
   */
  raw: (build: RawBuild, params?: RawParams) => void;
}

// Recipes

/**
 * A sound recipe: a function that layers {@link Voices} to make one sound.
 *
 * The optional second argument carries per-play options such as
 * `{ open: false }`. Declare them with a default so callers may omit them:
 *
 * ```ts
 * const toggle = ({ tone }: Voices, { on = true }: { on?: boolean } = {}): void => {
 *   tone({ f: on ? 880 : 660, dur: 0.05 });
 * };
 * ```
 */
export type Recipe<O = undefined> = (voices: Voices, options: O) => void;

/**
 * A collection of named recipes, as passed to {@link createSiyo}.
 *
 * The `never` option type is deliberate: it lets recipes with any option shape
 * be stored together while {@link PlayArgs} recovers each recipe's real
 * option type for `play()`.
 */
export type Recipes = Record<string, (voices: Voices, options: never) => void>;

/** Options every sound accepts on `play()`, next to its own. */
export interface PlayOptions {
  /**
   * Tuning for this one play, applied on top of the player's `tune` option and
   * any `tuned()` recipe: multipliers multiply and reverb adds.
   */
  tune?: Partial<TuneKnobs> | undefined;
}

/**
 * The trailing arguments of `play()` for a recipe of type `F`.
 *
 * - No options declared: an optional `{ tune }`.
 * - Options declared and all optional: an optional argument with them and `tune`.
 * - Options declared with a required field: a required argument.
 */
export type PlayArgs<F> = F extends (voices: Voices, options: infer O) => void
  ? unknown extends O
    ? [options?: PlayOptions]
    : Partial<O> extends O
      ? [options?: O & PlayOptions]
      : [options: O & PlayOptions]
  : [options?: PlayOptions];

// Player

/** Configuration accepted by {@link createSiyo}. All fields are optional. */
export interface SiyoOptions {
  /**
   * Initial master volume from `0` to `1`.
   * @defaultValue `0.8`
   */
  volume?: number;

  /**
   * Start muted. While muted, `play()` does nothing and no audio context is
   * created.
   * @defaultValue `false`
   */
  muted?: boolean;

  /**
   * Tuning applied to every sound this player plays, such as
   * `{ volume: 0.8, brightness: 0.9 }` for a softer app. It combines with
   * `tuned()` recipes and with the `tune` option of each `play()`.
   *
   * @throws {RangeError} From `createSiyo` if a multiplier is not above zero or `reverb` is negative.
   */
  tune?: Partial<TuneKnobs>;

  /**
   * Play nothing until the page has had its first click, tap or key press
   * (`navigator.userActivation.hasBeenActive`). Sounds asked for before that
   * are skipped, so nothing plays on page load and nothing plays late. Turn it
   * off in an app that may play sound before any interaction, such as a
   * desktop app's startup sound. Where the platform cannot tell whether there
   * has been a gesture, sounds are not held back.
   * @defaultValue `true`
   */
  requireGesture?: boolean;

  /**
   * Factory used to create the `AudioContext` the first time a sound plays.
   * Return `null` to signal that audio is unavailable. Supply this to share an
   * existing context, change its options, or inject a fake in tests.
   *
   * A context that comes from this factory belongs to you: {@link Siyo.dispose}
   * disconnects the player from it but never closes it, so sharing your app's
   * context is safe. If the factory creates a new context, close it yourself
   * when you are done with it.
   *
   * @defaultValue creates a low-latency `AudioContext` (or `webkitAudioContext`
   * on older Safari) and returns `null` when neither exists, such as during
   * server-side rendering. That context is the player's own, and `dispose()`
   * closes it.
   */
  createContext?: () => AudioContextLike | null;

  /**
   * Called when playing a sound fails: an unknown sound name, an invalid voice
   * parameter, a recipe that throws, or an audio context that cannot be
   * created. `play()` itself never throws, so audio can never break your
   * event handlers.
   *
   * @defaultValue logs to `console.error` when a console exists
   */
  onError?: (error: unknown) => void;
}

/** The player returned by {@link createSiyo}. */
export interface Siyo<R extends Recipes> {
  /**
   * Play a sound by name. The name and its options are checked at compile time.
   * Every sound also takes `{ tune }` to retune this one play.
   *
   * Browsers only start audio after a user gesture, so call this from a click,
   * tap or key handler. It is safe to call anywhere else: without audio
   * support (for example during server-side rendering) it silently does nothing,
   * and before the page's first gesture it is skipped (see
   * {@link SiyoOptions.requireGesture}).
   *
   * @param name - A key of the recipes this player was created with.
   * @param args - The recipe's options, when it takes any.
   */
  play: <K extends keyof R & string>(name: K, ...args: PlayArgs<R[K]>) => void;

  /** Silence every sound that is currently playing. Later sounds are unaffected. */
  stop: () => void;

  /**
   * Set the master volume. Values are clamped to `0`-`1`; non-finite values
   * are ignored.
   */
  volume: (level: number) => void;

  /** Mute or unmute. Muting does not cut sounds that are already playing; call {@link Siyo.stop} for that. */
  mute: (muted: boolean) => void;

  /**
   * Stop all sound and release the player's audio graph. A context the player
   * created itself is closed; one from {@link SiyoOptions.createContext} is only
   * disconnected and keeps running. The player stays usable: the next `play()`
   * builds a fresh graph. Call this when tearing down an app or hot-reloading a
   * module.
   */
  dispose: () => void;
}
