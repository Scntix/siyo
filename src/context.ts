/**
 * The slice of the Web Audio API that Siyo uses, described as plain
 * interfaces.
 *
 * Siyo is headless: it never reads `window` or `document`, and it does not
 * need the DOM type library. Instead of the DOM's `AudioContext`, the engine
 * talks to these minimal structural types. A real browser `AudioContext`
 * satisfies them, and so does any spec-compliant implementation (a Node
 * package, a React Native audio library, a test double).
 *
 * Members are declared with method syntax on purpose, which keeps the DOM's
 * overloaded signatures assignable to them.
 *
 * @module
 */

/** An automatable audio parameter, such as a gain or a frequency. */
export interface ParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}

/** Anything that can be wired into the audio graph. */
export interface NodeLike {
  connect(destination: NodeLike): unknown;
  disconnect(): void;
}

/** A gain (volume) node. */
export interface GainNodeLike extends NodeLike {
  readonly gain: ParamLike;
}

/** An oscillator source. `type` is the waveform name. */
export interface OscillatorNodeLike extends NodeLike {
  type: string;
  readonly frequency: ParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

/** A biquad filter. `type` is the filter shape name. */
export interface BiquadFilterNodeLike extends NodeLike {
  type: string;
  readonly frequency: ParamLike;
  readonly Q: ParamLike;
}

/** A block of audio samples. */
export interface AudioBufferLike {
  readonly length: number;
  getChannelData(channel: number): Float32Array;
}

/** A node that plays back an audio buffer. */
export interface AudioBufferSourceNodeLike extends NodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

/** A convolution reverb. */
export interface ConvolverNodeLike extends NodeLike {
  buffer: AudioBufferLike | null;
}

/** A dynamics compressor, used here as an output limiter. */
export interface DynamicsCompressorNodeLike extends NodeLike {
  readonly threshold: ParamLike;
  readonly ratio: ParamLike;
  readonly attack: ParamLike;
  readonly release: ParamLike;
}

/** A stereo panner. */
export interface StereoPannerNodeLike extends NodeLike {
  readonly pan: ParamLike;
}

/**
 * The audio context Siyo runs on.
 *
 * `createStereoPanner` and `close` are optional because some older engines
 * lack them (and an `OfflineAudioContext` has no `close`). Siyo copes: voices
 * stay centered without a panner, and `dispose()` skips closing.
 */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  /** `'running'`, `'suspended'`, `'closed'`, or an engine-specific value such as `'interrupted'`. */
  readonly state: string;
  readonly destination: NodeLike;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createConvolver(): ConvolverNodeLike;
  createDynamicsCompressor(): DynamicsCompressorNodeLike;
  createStereoPanner?(): StereoPannerNodeLike;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
  resume(): Promise<void>;
  close?(): Promise<void>;
}

/** The waveform names a `tone` voice accepts. */
export type ToneWave = 'sine' | 'square' | 'sawtooth' | 'triangle';

/** The filter shapes a `noise` voice accepts. */
export type NoiseFilter =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'allpass'
  | 'peaking'
  | 'lowshelf'
  | 'highshelf';
