/**
 * Default values for voice parameters.
 *
 * Both the engine and the tuning helper read these, so a default can never
 * drift between the two. They are the values documented on the parameter types.
 *
 * @module
 */

/** Peak gain when a voice does not set `vol`. */
export const DEFAULT_VOL = 0.2;

/** Defaults for the `tone` voice. */
export const TONE_DEFAULTS = { dur: 0.1, attack: 0.002, type: 'sine' } as const;

/** Defaults for the `noise` voice. */
export const NOISE_DEFAULTS = { dur: 0.02, attack: 0.001, q: 1.5, type: 'bandpass' } as const;

/** Defaults for the `bell` voice. The bell always uses a 1 ms attack. */
export const BELL_DEFAULTS = { dur: 1, attack: 0.001 } as const;

/** Defaults for the `mallet` voice. Each of its partials has its own fixed attack. */
export const MALLET_DEFAULTS = { dur: 0.5 } as const;
