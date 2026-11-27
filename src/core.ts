/**
 * The headless core of Siyo: the engine, the tuning helper and every type,
 * with no sounds attached.
 *
 * Import from `siyo/core` when you bring your own sounds, or combine it with
 * the individual sounds from `siyo/sounds`.
 *
 * @packageDocumentation
 */

export type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  BiquadFilterNodeLike,
  ConvolverNodeLike,
  DynamicsCompressorNodeLike,
  GainNodeLike,
  NodeLike,
  NoiseFilter,
  OscillatorNodeLike,
  ParamLike,
  StereoPannerNodeLike,
  ToneWave,
} from './context.js';
export { createSiyo } from './engine.js';
export type { TuneKnobs } from './tune.js';
export { tuned } from './tune.js';
export type {
  BellParams,
  CommonVoiceParams,
  LowpassSpec,
  MalletParams,
  NoiseParams,
  PlayArgs,
  PlayOptions,
  RawBuild,
  RawParams,
  Recipe,
  Recipes,
  Siyo,
  SiyoOptions,
  ToneParams,
  Voices,
} from './types.js';
