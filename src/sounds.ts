/**
 * The built-in sound library.
 *
 * Each sound is a small recipe that layers `noise`, `tone` and `bell` voices.
 * Because sounds are synthesized, the whole library weighs a few kilobytes and
 * every sound can be retuned (see `tuned`) or replaced.
 *
 * Every sound is its own named export, so a bundler keeps only the ones you
 * import:
 *
 * ```ts
 * import { createSiyo } from 'siyo/core';
 * import { tap, success } from 'siyo/sounds';
 *
 * const player = createSiyo({ tap, success });
 * ```
 *
 * Sounds that have two states take an options object, for example
 * `player.play('menu', { open: false })`. Every option is optional.
 *
 * Some names (`window`, `type`, `copy`, `error`) shadow familiar identifiers
 * when imported directly. Rename them on import, or use `SOUNDS`:
 * `import { window as windowSound } from 'siyo/sounds'`.
 *
 * More sounds are available as copy-and-paste recipes in the Siyo web app.
 * They use the same recipe shape, so pass them to `createSiyo` alongside
 * these.
 *
 * @module
 */

import type { Recipes, Voices } from './types.js';

/** Options for sounds with an opening and a closing variant. */
export interface OpenOptions {
  /** `true` plays the opening sound, `false` the closing one. @defaultValue `true` */
  open?: boolean | undefined;
}

/** Options for sounds with an on and an off variant. */
export interface OnOptions {
  /** `true` plays the "on" sound, `false` the "off" one. @defaultValue `true` */
  on?: boolean | undefined;
}

/** Options for sounds whose pitch follows a value, such as a slider position. */
export interface PitchOptions {
  /** Pitch multiplier. `1` is the sound's natural pitch. @defaultValue `1` */
  pitch?: number | undefined;
}

/** Options for the `copy` sound. */
export interface PasteOptions {
  /** `true` plays the lower "paste" variant. @defaultValue `false` */
  paste?: boolean | undefined;
}

/** Options for the `zoom` sound. */
export interface ZoomOptions {
  /** `true` rises for zoom in, `false` falls for zoom out. @defaultValue `true` */
  in?: boolean | undefined;
}

// Navigation

/**
 * Back. A short downward tick that feels like stepping one place behind you.
 *
 * Use it for: back buttons, previous page, leaving a panel.
 *
 * Built from: click and falling sweep. Lasts about 60 ms, plus any reverb tail.
 */
export const back = ({ tone, noise }: Voices): void => {
  noise({ f: 3000, q: 3, dur: 0.006, vol: 0.1 });
  tone({ f: 880, to: 520, dur: 0.06, type: 'triangle', vol: 0.16, lp: 2600 });
  tone({ f: 260, to: 200, dur: 0.05, vol: 0.1 });
};

/**
 * Forward. The mirror of Back: a short upward tick that moves you ahead.
 *
 * Use it for: forward buttons, next item, redo navigation.
 *
 * Built from: click and rising sweep. Lasts about 60 ms, plus any reverb tail.
 */
export const forward = ({ tone, noise }: Voices): void => {
  noise({ f: 3600, q: 3, dur: 0.006, vol: 0.1 });
  tone({ f: 520, to: 960, dur: 0.06, type: 'triangle', vol: 0.16, lp: 3200 });
  tone({ f: 300, to: 380, dur: 0.05, vol: 0.1 });
};

/**
 * Search. A light airy sweep ending in a clear two-tone chime.
 *
 * Use it for: opening search, command palettes, focusing the search field.
 *
 * Built from: air sweep and 2 soft tones. Lasts about 270 ms, plus any reverb tail.
 */
export const search = ({ tone, noise }: Voices): void => {
  noise({ f: 900, to: 4500, q: 1.5, dur: 0.12, attack: 0.03, vol: 0.07, rev: 0.1 });
  tone({ f: 1320, dur: 0.18, at: 0.05, vol: 0.09, attack: 0.01, rev: 0.3 });
  tone({ f: 1980, dur: 0.2, at: 0.07, vol: 0.04, attack: 0.01, rev: 0.35 });
};

/**
 * Tab. A dry wooden knock for switching between views.
 *
 * Use it for: tab bars, sidebar items, view switchers.
 *
 * Built from: click and body. Lasts about 40 ms, plus any reverb tail.
 */
export const tab = ({ tone, noise }: Voices): void => {
  noise({ f: 2600, q: 4, dur: 0.008, vol: 0.14 });
  tone({ f: 360, to: 300, dur: 0.04, type: 'triangle', vol: 0.2, lp: 1200 });
  tone({ f: 1200, dur: 0.03, at: 0.004, vol: 0.05 });
};

/**
 * Menu. A soft puff that rises when a menu opens and falls when it closes.
 *
 * Use it for: dropdowns, context menus, popovers.
 *
 * Built from: air puff and sweep. Lasts about 80 ms, plus any reverb tail.
 */
export const menu = ({ tone, noise }: Voices, { open = true }: OpenOptions = {}): void => {
  noise({ f: open ? 800 : 2400, to: open ? 2400 : 700, q: 1, dur: 0.08, attack: 0.02, vol: 0.07 });
  tone({ f: open ? 520 : 700, to: open ? 780 : 430, dur: 0.07, vol: 0.14, lp: 3000, rev: 0.1 });
};

// Controls

/**
 * Option. A crisp, bright click for choosing one item from a list.
 *
 * Use it for: dropdown items, radio buttons, list rows.
 *
 * Built from: click and 2 tones. Lasts about 35 ms, plus any reverb tail.
 */
export const option = ({ tone, noise }: Voices): void => {
  noise({ f: 4200, q: 3, dur: 0.005, vol: 0.08 });
  tone({ f: 1100, to: 1250, dur: 0.035, type: 'triangle', vol: 0.13 });
  tone({ f: 2200, dur: 0.025, at: 0.008, vol: 0.03 });
};

/**
 * Sidebar. A low air slide with a soft thud as the panel settles.
 *
 * Use it for: collapsing sidebars, drawers, inspector panels.
 *
 * Built from: air slide and sub thud. Lasts about 200 ms, plus any reverb tail.
 */
export const sidebar = ({ tone, noise }: Voices, { open = true }: OpenOptions = {}): void => {
  noise({ f: open ? 300 : 1600, to: open ? 1600 : 300, q: 0.8, dur: 0.16, attack: 0.05, vol: 0.09, rev: 0.08 });
  tone({
    f: open ? 110 : 140,
    to: open ? 80 : 70,
    at: open ? 0.11 : 0,
    dur: 0.09,
    type: 'triangle',
    vol: 0.28,
    lp: 350,
  });
};

/**
 * Type. A soft keystroke with natural variation on every press.
 *
 * Use it for: editors, chat inputs, terminals.
 *
 * Built from: click and body, randomized. Lasts about 30 ms, plus any reverb tail.
 */
export const type = ({ tone, noise }: Voices): void => {
  noise({ f: 2000 + Math.random() * 900, q: 2.5, dur: 0.01, vol: 0.14 });
  tone({ f: 240 + Math.random() * 60, to: 170, dur: 0.03, type: 'triangle', vol: 0.16, lp: 900 });
};

/**
 * Hover. Almost silent. Use it sparingly for pointer feedback.
 *
 * Use it for: toolbar buttons, list rows, menu items.
 *
 * Built from: air tick. Lasts about 12 ms, plus any reverb tail.
 */
export const hover = ({ tone, noise }: Voices): void => {
  noise({ f: 5200, type: 'highpass', dur: 0.004, vol: 0.03 });
  tone({ f: 2000, dur: 0.012, vol: 0.025 });
};

/**
 * Tooltip. A faint high shimmer for help that appears after a short pause.
 *
 * Use it for: tooltips, hints, hover cards.
 *
 * Built from: 1 soft tone. Lasts about 30 ms, plus any reverb tail.
 */
export const tooltip = ({ tone }: Voices): void => {
  tone({ f: 1800, to: 2100, dur: 0.03, vol: 0.04, attack: 0.004, rev: 0.1 });
};

/**
 * Record. Two rising beeps to start and a falling pair to stop.
 *
 * Use it for: mic on and off, screen recording.
 *
 * Built from: 2 soft tones. Lasts about 210 ms, plus any reverb tail.
 */
export const record = ({ tone }: Voices, { on = true }: OnOptions = {}): void => {
  tone({ f: on ? 880 : 740, dur: 0.08, type: 'triangle', vol: 0.12, lp: 3500 });
  tone({ f: on ? 1318 : 554, at: 0.09, dur: 0.12, type: 'triangle', vol: 0.12, lp: 3500, rev: 0.15 });
};

/**
 * Lock. A heavy latch on lock and a lighter release on unlock.
 *
 * Use it for: vaults, passcodes, read-only mode.
 *
 * Built from: latch, body and ring. Lasts about 130 ms, plus any reverb tail.
 */
export const lock = ({ tone, noise }: Voices, { on = true }: OnOptions = {}): void => {
  noise({ f: on ? 2400 : 3200, q: 6, dur: 0.008, vol: 0.2 });
  tone({ f: on ? 150 : 200, to: on ? 90 : 260, dur: 0.07, type: 'triangle', vol: 0.28, lp: 700 });
  tone({ f: on ? 900 : 1500, at: 0.05, dur: 0.08, vol: 0.05, rev: 0.2 });
};

/**
 * Expand. A short puff that opens upward and closes back down.
 *
 * Use it for: accordions, tree rows, show more.
 *
 * Built from: air puff and sweep. Lasts about 80 ms, plus any reverb tail.
 */
export const expand = ({ tone, noise }: Voices, { open = true }: OpenOptions = {}): void => {
  noise({ f: open ? 1000 : 2200, to: open ? 2200 : 900, q: 1, dur: 0.08, attack: 0.02, vol: 0.06 });
  tone({ f: open ? 440 : 620, to: open ? 620 : 440, dur: 0.06, type: 'triangle', vol: 0.1, lp: 2800 });
};

/**
 * Toggle. A damped wooden click. It pitches up when switched on and down when off.
 *
 * Use it for: switches, settings, mode changes.
 *
 * Built from: click, body and overtone. Lasts about 102 ms, plus any reverb tail.
 */
export const toggle = ({ tone, noise }: Voices, { on = true }: OnOptions = {}): void => {
  noise({ f: on ? 3000 : 2100, q: 5, dur: 0.01, vol: 0.22 });
  tone({ f: on ? 190 : 150, to: on ? 120 : 80, dur: 0.05, type: 'triangle', vol: 0.3, lp: 900 });
  tone({ f: on ? 1560 : 1040, dur: 0.09, at: 0.012, vol: 0.05, rev: 0.15 });
};

/**
 * Tick. A tiny crisp notch, like a haptic detent under your finger.
 *
 * Use it for: checkboxes, list selection, steppers.
 *
 * Built from: air puff, metal tick and body. Lasts about 20 ms, plus any reverb tail.
 */
export const tick = ({ tone, noise }: Voices, { pitch = 1 }: PitchOptions = {}): void => {
  noise({ f: 7000, type: 'highpass', dur: 0.005, vol: 0.08 });
  tone({ f: 2600 * pitch, to: 1800 * pitch, dur: 0.018, vol: 0.1 });
  tone({ f: 700 * pitch, dur: 0.02, type: 'triangle', vol: 0.1 });
};

// Windows

/**
 * Dialog. A gentle swell when a dialog opens and a drop when it closes.
 *
 * Use it for: modals, sheets, confirmation prompts.
 *
 * Built from: air sweep and 2 chimes. Lasts about 260 ms, plus any reverb tail.
 */
export const dialog = ({ tone, noise }: Voices, { open = true }: OpenOptions = {}): void => {
  noise({ f: open ? 600 : 1800, to: open ? 2200 : 500, q: 0.9, dur: 0.14, attack: 0.04, vol: 0.07, rev: 0.12 });
  tone({ f: open ? 392 : 523, to: open ? 523 : 330, dur: 0.18, at: 0.03, vol: 0.1, attack: 0.01, lp: 2500, rev: 0.3 });
  tone({ f: open ? 784 : 1046, dur: 0.2, at: 0.06, vol: 0.04, attack: 0.01, rev: 0.35 });
};

/**
 * Popover. A glassy puff that opens upward and settles back when it closes.
 *
 * Use it for: popovers, filter panels, date pickers.
 *
 * Built from: air puff and 2 sweeps. Lasts about 90 ms, plus any reverb tail.
 */
export const popover = ({ tone, noise }: Voices, { open = true }: OpenOptions = {}): void => {
  noise({ f: open ? 1400 : 3000, to: open ? 3600 : 900, q: 1.2, dur: 0.09, attack: 0.02, vol: 0.06, rev: 0.12 });
  tone({ f: open ? 880 : 1175, to: open ? 1175 : 740, dur: 0.09, type: 'triangle', vol: 0.1, lp: 3500, rev: 0.2 });
};

/**
 * Context menu. A tight click with a short upward tone, like a menu snapping into place.
 *
 * Use it for: right-click menus, quick actions.
 *
 * Built from: click and 2 tones. Lasts about 80 ms, plus any reverb tail.
 */
export const context = ({ tone, noise }: Voices): void => {
  noise({ f: 2400, q: 2, dur: 0.012, vol: 0.12 });
  tone({ f: 300, to: 420, dur: 0.06, type: 'triangle', vol: 0.16, lp: 1600 });
  tone({ f: 1500, dur: 0.05, at: 0.03, vol: 0.05, rev: 0.15 });
};

/**
 * Window. A soft sweep that rises on restore and drops as a window minimizes.
 *
 * Use it for: minimize, maximize, restore.
 *
 * Built from: air sweep and body. Lasts about 180 ms, plus any reverb tail.
 */
export const window = ({ tone, noise }: Voices, { open = true }: OpenOptions = {}): void => {
  noise({ f: open ? 500 : 3000, to: open ? 3000 : 500, q: 0.9, dur: 0.18, attack: 0.05, vol: 0.08, rev: 0.1 });
  tone({ f: open ? 220 : 260, to: open ? 330 : 140, at: 0.04, dur: 0.12, type: 'triangle', vol: 0.16, lp: 1200 });
};

/**
 * Dismiss. A fast downward swipe that clears something out of the way.
 *
 * Use it for: closing toasts, swiping away banners, clearing notifications.
 *
 * Built from: air fall and tone. Lasts about 120 ms, plus any reverb tail.
 */
export const dismiss = ({ tone, noise }: Voices): void => {
  noise({ f: 4000, to: 900, q: 1.4, dur: 0.12, attack: 0.01, vol: 0.07 });
  tone({ f: 540, to: 300, dur: 0.1, type: 'triangle', vol: 0.11, lp: 2400 });
};

// Actions

/**
 * Copy. Two quick ticks. The second pair is lower when you paste.
 *
 * Use it for: copy and paste, duplicate, copy link.
 *
 * Built from: 2 ticks. Lasts about 85 ms, plus any reverb tail.
 */
export const copy = ({ tone, noise }: Voices, { paste = false }: PasteOptions = {}): void => {
  noise({ f: 3800, q: 3, dur: 0.006, vol: 0.1 });
  tone({ f: paste ? 700 : 880, dur: 0.03, type: 'triangle', vol: 0.12 });
  tone({ f: paste ? 980 : 1240, dur: 0.04, at: 0.045, type: 'triangle', vol: 0.12, rev: 0.1 });
};

/**
 * Remove. Crumpling air that falls away, ending in a muffled thud.
 *
 * Use it for: delete file, clear list, empty trash.
 *
 * Built from: noise fall and thud. Lasts about 140 ms, plus any reverb tail.
 */
export const remove = ({ tone, noise }: Voices): void => {
  noise({ f: 3500, to: 500, q: 0.7, dur: 0.14, attack: 0.01, vol: 0.14 });
  tone({ f: 200, to: 90, dur: 0.1, at: 0.03, type: 'triangle', vol: 0.22, lp: 600 });
};

/**
 * Send. An upward whoosh with a small glass sparkle as it leaves.
 *
 * Use it for: send message, submit form, publish.
 *
 * Built from: air sweep, sweep and chime. Lasts about 300 ms, plus any reverb tail.
 */
export const send = ({ tone, noise }: Voices): void => {
  noise({ f: 800, to: 5000, q: 1, dur: 0.14, attack: 0.03, vol: 0.08, rev: 0.15 });
  tone({ f: 660, to: 1320, dur: 0.12, type: 'triangle', vol: 0.12, lp: 4000 });
  tone({ f: 1760, dur: 0.2, at: 0.1, vol: 0.05, rev: 0.4 });
};

/**
 * Favorite. Two bright bells when you star something and a soft tick when you remove it.
 *
 * Use it for: stars, pins, likes, bookmarks.
 *
 * Built from: 2 bells, or 1 tick. Lasts about 560 ms, plus any reverb tail.
 */
export const favorite = ({ bell, tone }: Voices, { on = true }: OnOptions = {}): void => {
  if (on) {
    bell({ f: 1760, vol: 0.1, dur: 0.5, rev: 0.4 });
    bell({ f: 2349, at: 0.06, vol: 0.08, dur: 0.5, rev: 0.4 });
  } else tone({ f: 700, to: 500, dur: 0.06, type: 'triangle', vol: 0.12, lp: 2000 });
};

/**
 * Refresh. A rising sweep that finishes on a clear tone.
 *
 * Use it for: reload, sync, pull to refresh.
 *
 * Built from: air sweep and 2 tones. Lasts about 320 ms, plus any reverb tail.
 */
export const refresh = ({ tone, noise }: Voices): void => {
  noise({ f: 600, to: 4200, q: 1.2, dur: 0.22, attack: 0.06, vol: 0.07, rev: 0.1 });
  tone({ f: 660, to: 990, dur: 0.2, vol: 0.07, attack: 0.05, type: 'triangle', lp: 3000 });
  tone({ f: 1320, at: 0.2, dur: 0.12, vol: 0.08, rev: 0.25 });
};

/**
 * Tap. A soft bubble pop that confirms a press without drawing attention.
 *
 * Use it for: buttons, send, delete, undo.
 *
 * Built from: noise click and two pitch sweeps. Lasts about 80 ms, plus any reverb tail.
 */
export const tap = ({ tone, noise }: Voices): void => {
  noise({ f: 2200, q: 0.8, dur: 0.012, vol: 0.16 });
  tone({ f: 260, to: 880, glide: 0.03, dur: 0.08, vol: 0.3, rev: 0.08 });
  tone({ f: 880, to: 180, dur: 0.05, at: 0.025, vol: 0.1 });
};

/**
 * Snap. A magnetic click with a low thud as an item docks into place.
 *
 * Use it for: drag and drop, grid snapping, window tiling.
 *
 * Built from: click, sweep and sub thud. Lasts about 74 ms, plus any reverb tail.
 */
export const snap = ({ tone, noise }: Voices): void => {
  noise({ f: 5200, type: 'highpass', dur: 0.008, vol: 0.2 });
  tone({ f: 1200, to: 260, dur: 0.03, vol: 0.22 });
  tone({ f: 130, to: 70, dur: 0.07, at: 0.004, vol: 0.3, type: 'triangle', lp: 400 });
};

/**
 * Grab. A soft pinch and lift, like picking an item up off the surface.
 *
 * Use it for: starting a drag, picking up cards, reordering lists.
 *
 * Built from: air tick and rising tone. Lasts about 70 ms, plus any reverb tail.
 */
export const grab = ({ tone, noise }: Voices): void => {
  noise({ f: 2400, to: 1400, q: 2, dur: 0.03, vol: 0.08 });
  tone({ f: 420, to: 560, dur: 0.07, type: 'triangle', vol: 0.12, lp: 2200 });
};

/**
 * Drop. A small landing thud with a light click as the item settles.
 *
 * Use it for: dropping files, placing cards, ending a drag.
 *
 * Built from: click, thud and tone. Lasts about 90 ms, plus any reverb tail.
 */
export const drop = ({ tone, noise }: Voices): void => {
  noise({ f: 1800, q: 2.5, dur: 0.008, vol: 0.1 });
  tone({ f: 180, to: 110, dur: 0.09, vol: 0.2 });
  tone({ f: 640, to: 400, dur: 0.05, at: 0.01, type: 'triangle', vol: 0.08, lp: 2000 });
};

/**
 * Undo. A quick falling sweep with two soft steps backward.
 *
 * Use it for: undo, revert, discard changes.
 *
 * Built from: air fall and 2 tones. Lasts about 140 ms, plus any reverb tail.
 */
export const undo = ({ tone, noise }: Voices): void => {
  noise({ f: 3200, to: 1200, q: 1.5, dur: 0.1, attack: 0.01, vol: 0.06 });
  tone({ f: 760, to: 420, dur: 0.09, type: 'triangle', vol: 0.14, lp: 2800 });
  tone({ f: 420, to: 300, dur: 0.07, at: 0.07, vol: 0.1 });
};

// Feedback

/**
 * Warning. Two falling bells that get attention without sounding alarmed.
 *
 * Use it for: unsaved changes, low storage, risky actions.
 *
 * Built from: 2 bells. Lasts about 810 ms, plus any reverb tail.
 */
export const warning = ({ bell }: Voices): void => {
  [622.25, 466.16].forEach((f, i) => {
    bell({ f, at: i * 0.11, vol: 0.12, dur: 0.7, rev: 0.3 });
  });
};

/**
 * Error. Two clashing low tones that fall. Clearly wrong, never shrill.
 *
 * Use it for: failed saves, crashes, rejected uploads.
 *
 * Built from: 2 detuned tones and thud. Lasts about 200 ms, plus any reverb tail.
 */
export const error = ({ tone, noise }: Voices): void => {
  tone({ f: 330, to: 247, dur: 0.2, type: 'triangle', vol: 0.2, lp: 1400, rev: 0.15 });
  tone({ f: 349, to: 262, dur: 0.2, type: 'triangle', vol: 0.13, lp: 1400, rev: 0.15 });
  noise({ f: 600, type: 'lowpass', q: 1, dur: 0.05, vol: 0.08 });
};

/**
 * Success. Four glass bells rising through an E major chord, with a room tail.
 *
 * Use it for: payments, saves, completed flows.
 *
 * Built from: 4 bells, warm bass and reverb. Lasts about 1310 ms, plus any reverb tail.
 */
export const success = ({ tone, bell }: Voices): void => {
  [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => {
    bell({ f, at: i * 0.07, vol: 0.13, dur: 1.1, rev: 0.5, pan: (i - 1.5) * 0.15 });
  });
  tone({ f: 329.6, dur: 0.9, vol: 0.08, attack: 0.01, type: 'triangle', lp: 1200, rev: 0.4 });
};

/**
 * Deny. Two muffled knocks. It says no without a harsh buzzer.
 *
 * Use it for: wrong PIN, blocked actions, errors.
 *
 * Built from: 2 lowpassed knocks and thumps. Lasts about 170 ms, plus any reverb tail.
 */
export const deny = ({ tone, noise }: Voices): void => {
  [0, 0.09].forEach((at, i) => {
    tone({ f: i ? 170 : 200, to: i ? 95 : 110, dur: 0.08, at, type: 'triangle', vol: 0.34, lp: 500 });
    noise({ f: 400, type: 'lowpass', q: 1, dur: 0.02, at, vol: 0.12 });
  });
};

/**
 * Reward. Six rising bells with a shimmer of air above them.
 *
 * Use it for: level ups, streaks, achievements.
 *
 * Built from: 6 bells, air shimmer and reverb. Lasts about 1175 ms, plus any reverb tail.
 */
export const reward = ({ noise, bell }: Voices): void => {
  [783.99, 987.77, 1174.66, 1567.98, 1975.53, 2349.32].forEach((f, i) => {
    bell({ f, at: i * 0.055, vol: 0.1, dur: 0.9, rev: 0.55, pan: Math.sin(i) * 0.4 });
  });
  noise({ f: 3000, to: 9000, type: 'highpass', q: 0.5, dur: 0.5, attack: 0.15, vol: 0.04, rev: 0.4 });
};

/**
 * Save. Two warm rising notes. Quieter and shorter than Success.
 *
 * Use it for: autosave, saving a draft, small confirmations.
 *
 * Built from: 2 soft tones. Lasts about 270 ms, plus any reverb tail.
 */
export const save = ({ tone }: Voices): void => {
  tone({ f: 660, dur: 0.14, vol: 0.12, attack: 0.005, rev: 0.2 });
  tone({ f: 990, dur: 0.2, at: 0.07, vol: 0.1, attack: 0.005, rev: 0.3 });
};

// Notifications

/**
 * Notify. A two-note chime built from inharmonic glass partials.
 *
 * Use it for: incoming messages, alerts, reminders.
 *
 * Built from: 2 bells, 4 partials each. Lasts about 1630 ms, plus any reverb tail.
 */
export const notify = ({ bell }: Voices): void => {
  bell({ f: 1568, vol: 0.16, dur: 1.2, rev: 0.45 });
  bell({ f: 1174.7, at: 0.13, vol: 0.14, dur: 1.5, rev: 0.5 });
};

/**
 * Mention. One clear glass bell. Short enough to repeat without annoying.
 *
 * Use it for: @mentions, replies, assigned tasks.
 *
 * Built from: 1 bell. Lasts about 700 ms, plus any reverb tail.
 */
export const mention = ({ bell }: Voices): void => {
  bell({ f: 1318, vol: 0.13, dur: 0.7, rev: 0.3 });
};

// System

/**
 * Connect. A rising pair when you come online and a falling pair when you drop off.
 *
 * Use it for: network, device pairing, sync status.
 *
 * Built from: 2 soft tones. Lasts about 220 ms, plus any reverb tail.
 */
export const connect = ({ tone }: Voices, { on = true }: OnOptions = {}): void => {
  [on ? 660 : 880, on ? 990 : 660].forEach((f, i) => {
    tone({ f, at: i * 0.08, dur: 0.14, type: 'triangle', vol: 0.11, lp: 3000, rev: 0.2 });
  });
};

/**
 * Shutter. Two curtain clicks, each with its own mechanical thump.
 *
 * Use it for: camera capture, screenshots.
 *
 * Built from: 2 clicks and 2 thumps. Lasts about 130 ms, plus any reverb tail.
 */
export const shutter = ({ tone, noise }: Voices): void => {
  noise({ f: 2400, q: 2, dur: 0.018, vol: 0.28 });
  tone({ f: 190, to: 110, dur: 0.05, type: 'triangle', vol: 0.28, lp: 700 });
  noise({ f: 1500, q: 2, dur: 0.025, at: 0.07, vol: 0.22 });
  tone({ f: 140, to: 80, dur: 0.06, at: 0.07, type: 'triangle', vol: 0.22, lp: 600 });
};

/**
 * Startup. A slow, warm chord that opens up as a filter sweeps across it.
 *
 * Use it for: app launch, power on, welcome screens.
 *
 * Built from: 4 saws, sub bass and a sparkle. Lasts about 1720 ms, plus any reverb tail.
 */
export const startup = ({ tone }: Voices): void => {
  [130.8, 196, 329.6, 493.9].forEach((f, i) => {
    tone({
      f,
      at: i * 0.04,
      dur: 1.6,
      attack: 0.35,
      type: 'sawtooth',
      vol: 0.06,
      lp: [300, 1800],
      rev: 0.5,
      pan: (i - 1.5) * 0.25,
    });
  });
  tone({ f: 65.4, dur: 1.4, attack: 0.2, vol: 0.18, lp: 200 });
  tone({ f: 987.77, at: 0.5, dur: 1, vol: 0.05, attack: 0.01, rev: 0.6 });
};

/**
 * Download. A falling note that lands with a thud, then a small bell.
 *
 * Use it for: finished downloads, exports, file saved to disk.
 *
 * Built from: 2 tones and bell. Lasts about 650 ms, plus any reverb tail.
 */
export const download = ({ tone, bell }: Voices): void => {
  tone({ f: 1180, to: 640, dur: 0.18, vol: 0.1, attack: 0.01, rev: 0.2 });
  tone({ f: 150, to: 90, dur: 0.16, at: 0.17, vol: 0.2 });
  bell({ f: 1568, vol: 0.07, dur: 0.45, at: 0.2, rev: 0.3 });
};

// Movement

/**
 * Scrub. A fine ratchet click that rises in pitch along a slider.
 *
 * Use it for: sliders, dials, timelines.
 *
 * Built from: click and short sweep. Lasts about 12 ms, plus any reverb tail.
 */
export const scrub = ({ tone, noise }: Voices, { pitch = 1 }: PitchOptions = {}): void => {
  noise({ f: 3800, q: 4, dur: 0.007, vol: 0.1 });
  tone({ f: 1500 * pitch, to: 900 * pitch, dur: 0.012, type: 'triangle', vol: 0.08 });
};

/**
 * Swipe. A breath of filtered air that sweeps upward and lands on a soft tone.
 *
 * Use it for: tabs, segmented controls, page changes.
 *
 * Built from: noise sweep and landing tone. Lasts about 200 ms, plus any reverb tail.
 */
export const swipe = ({ tone, noise }: Voices): void => {
  noise({ f: 500, to: 3200, q: 1.2, dur: 0.16, attack: 0.04, vol: 0.1, rev: 0.1 });
  tone({ f: 700, to: 1100, dur: 0.08, at: 0.12, vol: 0.05, attack: 0.01 });
};

/**
 * Zoom. A light air sweep that rises on zoom in and falls on zoom out.
 *
 * Use it for: canvas zoom, image preview, map controls.
 *
 * Built from: air sweep and tone. Lasts about 160 ms, plus any reverb tail.
 */
export const zoom = ({ tone, noise }: Voices, { in: zoomIn = true }: ZoomOptions = {}): void => {
  const up = zoomIn;
  noise({ f: up ? 900 : 3200, to: up ? 3600 : 800, q: 1.2, dur: 0.16, attack: 0.04, vol: 0.07, rev: 0.1 });
  tone({ f: up ? 520 : 780, to: up ? 780 : 520, dur: 0.14, vol: 0.09, attack: 0.02, lp: 3000 });
};

/**
 * Every built-in sound, keyed by name.
 *
 * Handy for `createSiyo({ ...SOUNDS })` or for building a settings screen.
 * Referencing this object keeps **all** sounds in your bundle; import the
 * individual sounds instead when bundle size matters.
 */
export const SOUNDS = {
  back,
  forward,
  search,
  tab,
  menu,
  option,
  sidebar,
  type,
  hover,
  tooltip,
  record,
  lock,
  expand,
  toggle,
  tick,
  dialog,
  popover,
  context,
  window,
  dismiss,
  copy,
  remove,
  send,
  favorite,
  refresh,
  tap,
  snap,
  grab,
  drop,
  undo,
  warning,
  error,
  success,
  deny,
  reward,
  save,
  notify,
  mention,
  connect,
  shutter,
  startup,
  download,
  scrub,
  swipe,
  zoom,
} satisfies Recipes;

/** The name of any built-in sound. */
export type SoundName = keyof typeof SOUNDS;
