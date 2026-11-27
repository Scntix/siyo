/**
 * Siyo: interface sounds for desktop and web apps, synthesized live with the
 * Web Audio API. No audio files, no dependencies.
 *
 * This is the convenience entry point. It re-exports the headless core and
 * adds a ready-made `siyo` player loaded with every built-in sound.
 *
 * Bundle size matters? Import `createSiyo` from `siyo/core` and only the
 * sounds you use from `siyo/sounds`.
 *
 * @example
 * ```ts
 * import { siyo } from 'siyo';
 *
 * saveButton.addEventListener('click', () => {
 *   save();
 *   siyo.play('success');
 * });
 * ```
 *
 * @packageDocumentation
 */

import { createSiyo } from './engine.js';
import { SOUNDS } from './sounds.js';
import type { Siyo } from './types.js';

export * from './core.js';
export type { OnOptions, OpenOptions, PasteOptions, PitchOptions, SoundName, ZoomOptions } from './sounds.js';
export { SOUNDS } from './sounds.js';

/**
 * A ready-to-use player loaded with every built-in sound.
 *
 * Creating it costs nothing: the audio engine only starts on the first
 * `play()`. Bundlers drop it when you do not import it. For custom sounds,
 * tuning or a different volume, build your own player with `createSiyo`.
 */
export const siyo: Siyo<typeof SOUNDS> = /* @__PURE__ */ createSiyo(SOUNDS);
