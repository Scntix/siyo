/**
 * Tuning: adjust any recipe without rewriting it.
 *
 * Six knobs reshape every voice a recipe plays: `pitch`, `length`, `attack`,
 * `volume`, `reverb` and `brightness`. Apply them to one sound with `tuned()`,
 * to every sound of a player with the `tune` option of `createSiyo`, or to a
 * single play with `play(name, { tune })`. The three combine: multipliers
 * multiply and reverb adds.
 *
 * @module
 */

import { BELL_DEFAULTS, DEFAULT_VOL, MALLET_DEFAULTS, NOISE_DEFAULTS, TONE_DEFAULTS } from './defaults.js';
import type { CommonVoiceParams, LowpassSpec, Recipe, Voices } from './types.js';

/** The six tuning knobs. Each is a multiplier, except `reverb`, which is added. */
export interface TuneKnobs {
  /** Multiplies every pitch. `2` is one octave up, `0.5` one octave down. @defaultValue `1` */
  pitch: number;
  /**
   * Multiplies every start delay (`at`) and duration (`dur`). `2` is twice as
   * long. Glide times are left as written.
   * @defaultValue `1`
   */
  length: number;
  /**
   * Multiplies the attack of every `tone` and `noise` voice: above `1` swells in
   * more slowly, below `1` strikes harder. Bells and mallets always strike
   * instantly. An attack is capped at its voice's duration.
   * @defaultValue `1`
   */
  attack: number;
  /** Multiplies every volume. @defaultValue `1` */
  volume: number;
  /** Added to every voice's reverb send (`0` to `1`). @defaultValue `0` */
  reverb: number;
  /** Multiplies filter frequencies. Higher is brighter, lower is darker. @defaultValue `1` */
  brightness: number;
}

/** Neutral knobs: tuning with these leaves a recipe unchanged. */
export const NEUTRAL: Readonly<TuneKnobs> = { pitch: 1, length: 1, attack: 1, volume: 1, reverb: 0, brightness: 1 };

const KNOBS = Object.keys(NEUTRAL) as ReadonlyArray<keyof TuneKnobs>;

/**
 * Fill in the knobs that were left out (or given as `undefined`) and validate
 * them up front, where the mistake is made, instead of letting a bad value
 * surface later as a failed sound inside an event handler.
 *
 * @param from - Where the knobs came from, for the error message.
 * @throws {RangeError} If a multiplier is not above zero, or `reverb` is negative.
 */
export function resolveKnobs(knobs: Partial<TuneKnobs>, from: string): TuneKnobs {
  const k: TuneKnobs = { ...NEUTRAL };
  for (const name of KNOBS) {
    const value = knobs[name];
    if (value !== undefined) k[name] = value;
  }
  for (const name of KNOBS) {
    if (name === 'reverb') continue;
    if (!(Number.isFinite(k[name]) && k[name] > 0)) {
      throw new RangeError(`siyo: ${from} knob "${name}" must be a number above zero, got ${String(k[name])}`);
    }
  }
  if (!(Number.isFinite(k.reverb) && k.reverb >= 0)) {
    throw new RangeError(`siyo: ${from} knob "reverb" must be zero or more, got ${String(k.reverb)}`);
  }
  return k;
}

/** Combine two sets of knobs, as if one were applied on top of the other. */
export function combineKnobs(a: Readonly<TuneKnobs>, b: Readonly<TuneKnobs>): TuneKnobs {
  return {
    pitch: a.pitch * b.pitch,
    length: a.length * b.length,
    attack: a.attack * b.attack,
    volume: a.volume * b.volume,
    reverb: a.reverb + b.reverb,
    brightness: a.brightness * b.brightness,
  };
}

/** Whether a set of knobs leaves every voice exactly as written. */
export const isNeutral = (k: Readonly<TuneKnobs>): boolean => KNOBS.every((name) => k[name] === NEUTRAL[name]);

/** Scale a lowpass spec by a factor, preserving its fixed-or-sweep shape. */
const scaleLowpass = (lp: LowpassSpec | undefined, k: number): LowpassSpec | undefined =>
  lp === undefined ? undefined : typeof lp === 'number' ? lp * k : [lp[0] * k, lp[1] * k];

/** Scale an optional number, keeping `undefined` as `undefined`. */
const scale = (n: number | undefined, k: number): number | undefined => (n === undefined ? undefined : n * k);

/**
 * Wrap `voices` so every call is adjusted by `knobs` before it reaches the
 * real voices. Optional properties a recipe left out (`to`, `lp`) stay unset.
 */
export function tuneVoices(voices: Voices, knobs: Readonly<TuneKnobs>): Voices {
  /** Apply the knobs shared by every voice: timing, volume and reverb. */
  const common = (p: CommonVoiceParams, defaultDur: number) => ({
    at: (p.at ?? 0) * knobs.length,
    dur: (p.dur ?? defaultDur) * knobs.length,
    vol: (p.vol ?? DEFAULT_VOL) * knobs.volume,
    rev: (p.rev ?? 0) + knobs.reverb,
  });

  return {
    tone: (p) => {
      const to = scale(p.to, knobs.pitch);
      const lp = scaleLowpass(p.lp, knobs.brightness);
      voices.tone({
        ...p,
        ...common(p, TONE_DEFAULTS.dur),
        attack: (p.attack ?? TONE_DEFAULTS.attack) * knobs.attack,
        f: p.f * knobs.pitch,
        ...(to !== undefined && { to }),
        ...(lp !== undefined && { lp }),
      });
    },
    noise: (p) => {
      const to = scale(p.to, knobs.brightness);
      voices.noise({
        ...p,
        ...common(p, NOISE_DEFAULTS.dur),
        attack: (p.attack ?? NOISE_DEFAULTS.attack) * knobs.attack,
        f: p.f * knobs.brightness,
        ...(to !== undefined && { to }),
      });
    },
    bell: (p) => voices.bell({ ...p, ...common(p, BELL_DEFAULTS.dur), f: p.f * knobs.pitch }),
    mallet: (p) => voices.mallet({ ...p, ...common(p, MALLET_DEFAULTS.dur), f: p.f * knobs.pitch }),
    // A raw voice builds its own nodes, so no knob can reach inside it.
    raw: voices.raw,
  };
}

/**
 * Return a retuned copy of a recipe. The original is not modified, and the
 * copy accepts the same options.
 *
 * @example
 * ```ts
 * import { createSiyo, SOUNDS, tuned } from 'siyo';
 *
 * const siyo = createSiyo({
 *   ...SOUNDS,
 *   // A higher, shorter, airier success chime
 *   success: tuned(SOUNDS.success, { pitch: 1.2, length: 0.7, reverb: 0.2 }),
 * });
 * ```
 *
 * @param recipe - The recipe to adjust.
 * @param knobs - Any subset of the knobs. Omitted knobs stay neutral.
 * @throws {RangeError} If a multiplier is not above zero, or `reverb` is negative.
 */
export function tuned<O>(recipe: Recipe<O>, knobs: Partial<TuneKnobs>): Recipe<O> {
  const k = resolveKnobs(knobs, 'tuned()');
  return (voices, options) => recipe(tuneVoices(voices, k), options);
}
