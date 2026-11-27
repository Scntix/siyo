/**
 * Compile-time proof that browser audio classes are accepted by Siyo.
 * It is only typechecked (against the DOM lib), never executed.
 */
import { type AudioContextLike, createSiyo } from '../src/core.js';
import { back } from '../src/sounds.js';

// A real AudioContext satisfies the headless interface...
export const fromContext: AudioContextLike = new AudioContext();
// ...so does an OfflineAudioContext (it has no `close`, which is optional).
export const fromOffline: AudioContextLike = new OfflineAudioContext(2, 44100, 44100);

// And the factory option takes either.
createSiyo({ back }, { createContext: () => new AudioContext() });
createSiyo({ back }, { createContext: () => new webkitAudioContext() });

declare class webkitAudioContext extends AudioContext {}
