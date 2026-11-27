/**
 * A minimal fake of the Web Audio API, just rich enough to run Siyo.
 *
 * It records what the engine does (nodes created, connections, scheduled
 * ramps) and enforces the rules real browsers enforce, such as exponential
 * ramps needing positive targets, so tests catch errors that would throw in
 * a browser.
 */

/** Throw the way a browser does for a non-finite number. */
function finite(n: number, what: string): void {
  if (!Number.isFinite(n)) throw new TypeError(`${what} must be a finite number, got ${n}`);
}

/** Throw the way a browser does for a negative or non-finite time. */
function time(t: number, what: string): void {
  finite(t, what);
  if (t < 0) throw new RangeError(`${what} must not be negative, got ${t}`);
}

import type { AudioContextLike } from '../src/core.js';

export class FakeParam {
  private current = 0;
  readonly events: Array<{ kind: string; value: number; time: number }> = [];
  /** Event times that went backwards: an inverted envelope (e.g. attack longer than duration). */
  invertedEvents = 0;

  get value(): number {
    return this.current;
  }
  set value(v: number) {
    finite(v, 'AudioParam.value');
    this.current = v;
  }

  private push(kind: string, value: number, t: number): this {
    finite(value, `${kind} value`);
    time(t, `${kind} time`);
    const last = this.events.at(-1);
    if (last && t < last.time) this.invertedEvents++;
    this.events.push({ kind, value, time: t });
    return this;
  }
  setValueAtTime(value: number, t: number): this {
    return this.push('set', value, t);
  }
  linearRampToValueAtTime(value: number, t: number): this {
    return this.push('linear', value, t);
  }
  exponentialRampToValueAtTime(value: number, t: number): this {
    if (!(value > 0)) throw new RangeError(`exponential ramp target must be > 0, got ${value}`);
    return this.push('exp', value, t);
  }
}

export class FakeNode {
  readonly connections: FakeNode[] = [];
  disconnected = false;
  constructor(readonly kind: string) {}

  connect(target: FakeNode): FakeNode {
    this.connections.push(target);
    return target;
  }
  disconnect(): void {
    this.disconnected = true;
    this.connections.length = 0;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
  constructor() {
    super('gain');
  }
}

export class FakeOsc extends FakeNode {
  type = 'sine';
  readonly frequency = new FakeParam();
  started: number | null = null;
  stopped: number | null = null;
  constructor() {
    super('osc');
  }
  start(t: number): void {
    if (this.started !== null) throw new Error('InvalidStateError: start() called twice');
    time(t, 'start time');
    this.started = t;
  }
  stop(t: number): void {
    if (this.started === null) throw new Error('InvalidStateError: stop() before start()');
    time(t, 'stop time');
    this.stopped = t;
  }
}

export class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  constructor() {
    super('filter');
  }
}

export class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  started: number | null = null;
  stopped: number | null = null;
  constructor() {
    super('buffersource');
  }
  start(t: number, offset = 0): void {
    if (this.started !== null) throw new Error('InvalidStateError: start() called twice');
    time(t, 'start time');
    time(offset, 'start offset');
    this.started = t;
  }
  stop(t: number): void {
    if (this.started === null) throw new Error('InvalidStateError: stop() before start()');
    time(t, 'stop time');
    this.stopped = t;
  }
}

export class FakeContext {
  sampleRate = 48000;
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly destination = new FakeNode('destination');
  readonly created: FakeNode[] = [];
  resumeCalls = 0;
  closeCalls = 0;

  private track<T extends FakeNode>(n: T): T {
    this.created.push(n);
    return n;
  }

  createGain(): FakeGain {
    return this.track(new FakeGain());
  }
  createOscillator(): FakeOsc {
    return this.track(new FakeOsc());
  }
  createBiquadFilter(): FakeFilter {
    return this.track(new FakeFilter());
  }
  createBufferSource(): FakeBufferSource {
    return this.track(new FakeBufferSource());
  }
  createDynamicsCompressor(): FakeNode & Record<string, FakeParam> {
    const n = this.track(new FakeNode('compressor')) as FakeNode & Record<string, FakeParam>;
    for (const k of ['threshold', 'ratio', 'attack', 'release']) n[k] = new FakeParam();
    return n;
  }
  createConvolver(): FakeNode & { buffer: unknown } {
    const n = this.track(new FakeNode('convolver')) as FakeNode & { buffer: unknown };
    n.buffer = null;
    return n;
  }
  createStereoPanner(): FakeNode & { pan: FakeParam } {
    const n = this.track(new FakeNode('panner')) as FakeNode & { pan: FakeParam };
    n.pan = new FakeParam();
    return n;
  }
  createBuffer(channels: number, length: number): { getChannelData: (c: number) => Float32Array } {
    if (!(length >= 1)) throw new Error('NotSupportedError: buffer length must be at least 1');
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (c) => data[c] as Float32Array };
  }

  resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closeCalls++;
    this.state = 'closed';
    return Promise.resolve();
  }

  /** Total automation events that went backwards in time, across every node. */
  invertedEvents(): number {
    let total = 0;
    for (const node of this.created) {
      for (const key of ['gain', 'frequency', 'Q', 'pan']) {
        const param = (node as unknown as Record<string, unknown>)[key];
        if (param instanceof FakeParam) total += param.invertedEvents;
      }
    }
    return total;
  }

  /** All nodes of one kind created so far. */
  all<T extends FakeNode>(kind: string): T[] {
    return this.created.filter((n) => n.kind === kind) as T[];
  }
}

/** Create a fake context plus the factory to hand to `createSiyo`. */
export function fakeAudio(sampleRate = 48000): {
  ctx: FakeContext;
  createContext: () => AudioContextLike;
  created: () => number;
} {
  const ctx = new FakeContext();
  ctx.sampleRate = sampleRate;
  let calls = 0;
  return {
    ctx,
    createContext: () => {
      calls++;
      return ctx as unknown as AudioContextLike;
    },
    created: () => calls,
  };
}
