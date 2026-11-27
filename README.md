# siyo

Interface sounds for web and desktop apps, synthesized live with the Web Audio API.

- **No audio files.** 45 built-in sounds are generated as they play, so the whole library is about 5 kB gzipped.
- **Works everywhere.** No dependencies and no framework: ES modules, CommonJS and a plain `<script>` build.
- **Typed.** Sound names and their options are checked at compile time.
- **Tree-shakeable.** Every sound is its own export, so you only ship the ones you use.
- **Polite by default.** Nothing plays before the visitor's first click, tap or key press, and `play()` never throws.
- **SSR-safe.** Nothing touches `window` or the audio API until the first sound plays.

## Install

```sh
npm install siyo
pnpm add siyo
yarn add siyo
bun add siyo
deno add npm:siyo
```

## Quick start

```ts
import { siyo } from 'siyo';

saveButton.addEventListener('click', () => {
  save();
  siyo.play('success');
});
```

Call `play()` in the same handler as the action it belongs to. Browsers only allow audio after a user gesture, so siyo plays nothing until the page has had its first click, tap or key press: a hover sound can never fire on page load or play late. Desktop apps that need sound before any interaction can turn this off (see [Electron and Tauri](#electron-and-tauri)).

Some sounds take options, and TypeScript checks them:

```ts
siyo.play('menu', { open: true }); // rising puff
siyo.play('menu', { open: false }); // falling puff
siyo.play('toggle', { on: false });
siyo.play('scrub', { pitch: 1.2 });
siyo.play('nope'); // error: not a sound
siyo.play('back', { open: true }); // error: 'back' has no open option
```

Events that fire many times a second, such as slider input or key repeat, pile sounds up into a buzz. Play at most one every 30 to 40 ms for those:

```ts
let last = 0;

slider.addEventListener('input', (event) => {
  if (event.timeStamp - last < 35) return;
  last = event.timeStamp;
  siyo.play('scrub', { pitch: 0.8 + (slider.valueAsNumber / 100) * 0.6 });
});
```

## Use it with your framework

siyo needs no adapter: call `siyo.play()` from any event handler. Importing it is always safe, including in server-rendered code.

### React

```tsx
import { siyo } from 'siyo';

export function SaveButton({ onSave }: { onSave: () => void }) {
  return (
    <button
      onClick={() => {
        onSave();
        siyo.play('success');
      }}
    >
      Save
    </button>
  );
}
```

In the Next.js App Router, event handlers live in client components, so add `'use client'` at the top of that file.

### Vue

```vue
<script setup lang="ts">
import { siyo } from 'siyo';
</script>

<template>
  <button @click="siyo.play('success')">Save</button>
</template>
```

### Svelte

```svelte
<script lang="ts">
  import { siyo } from 'siyo';
</script>

<button onclick={() => siyo.play('success')}>Save</button>
```

### Solid

```tsx
import { siyo } from 'siyo';

export function SaveButton() {
  return <button onClick={() => siyo.play('success')}>Save</button>;
}
```

### Angular

```ts
import { Component } from '@angular/core';
import { siyo } from 'siyo';

@Component({
  selector: 'app-save-button',
  template: `<button (click)="save()">Save</button>`,
})
export class SaveButton {
  save(): void {
    siyo.play('success');
  }
}
```

### Astro

```astro
<button id="save">Save</button>

<script>
  import { siyo } from 'siyo';

  document.getElementById('save')?.addEventListener('click', () => siyo.play('success'));
</script>
```

### Server-side rendering

Next.js, Nuxt, SvelteKit, Remix and Astro can import siyo on the server. It reads no `window` or `document` and creates no `AudioContext` until the first `play()`, and `play()` on the server does nothing.

### Plain HTML, from a CDN

As an ES module:

```html
<button id="save">Save</button>

<script type="module">
  import { siyo } from 'https://cdn.jsdelivr.net/npm/siyo@0.1/+esm';

  document.getElementById('save').addEventListener('click', () => siyo.play('success'));
</script>
```

Or as a classic script, which defines a `Siyo` global. To host it yourself, the file is `dist/browser/siyo.min.js` in the package:

```html
<button id="save">Save</button>

<script src="https://unpkg.com/siyo@0.1"></script>
<script>
  const { siyo } = Siyo;

  document.getElementById('save').addEventListener('click', () => siyo.play('success'));
</script>
```

### CommonJS

`require('siyo')` loads a CommonJS build, for older tools and test runners. Node has no Web Audio API, so `play()` does nothing there.

```js
const { siyo } = require('siyo');

siyo.play('tap'); // silent in Node, and never an error
```

### Electron and Tauri

Use siyo in the app window (Electron's renderer process). A desktop app may want sound before the first click, such as a startup sound, so turn off `requireGesture` for it:

```ts
import { createSiyo, SOUNDS } from 'siyo';

const sounds = createSiyo(SOUNDS, { requireGesture: false });

sounds.play('startup');
```

## Customize

### Tune any sound

Six knobs reshape every sound, built in or your own:

| Knob         | Default | What it does                                                                   |
| ------------ | ------- | ------------------------------------------------------------------------------ |
| `pitch`      | `1`     | Multiplies every pitch. `2` is an octave up, `0.5` an octave down.             |
| `length`     | `1`     | Multiplies every delay and duration. `2` is twice as long.                     |
| `attack`     | `1`     | Multiplies how fast tones and noise swell in. Bells and mallets always strike. |
| `volume`     | `1`     | Multiplies every volume.                                                       |
| `reverb`     | `0`     | Added to every voice's reverb send, `0` to `1`.                                |
| `brightness` | `1`     | Multiplies filter frequencies. Higher is brighter, lower is darker.            |

Apply them to one sound, to a whole player, or to a single play. They stack: multipliers multiply and `reverb` adds.

```ts
import { createSiyo, SOUNDS, tuned } from 'siyo';

const player = createSiyo(
  {
    ...SOUNDS,
    // One sound: a higher, shorter, airier success
    success: tuned(SOUNDS.success, { pitch: 1.2, length: 0.7, reverb: 0.2 }),
  },
  // Every sound of this player: a little softer and darker
  { tune: { volume: 0.8, brightness: 0.9 } },
);

// Just this once
player.play('tap', { tune: { pitch: 1.5 } });
player.play('menu', { open: false, tune: { length: 1.5 } });
```

### Write your own sounds

A sound is a function that layers voices. Spread `SOUNDS` to keep the built-in ones:

```ts
import { createSiyo, SOUNDS, type Voices } from 'siyo';

const player = createSiyo({
  ...SOUNDS,
  ping({ tone }: Voices): void {
    tone({ f: 880, dur: 0.2, vol: 0.2, rev: 0.3 });
  },
  // Options are typed too. Give them defaults so callers can leave them out.
  blip({ tone }: Voices, { high = false }: { high?: boolean } = {}): void {
    tone({ f: high ? 1800 : 900, dur: 0.05 });
  },
  join({ mallet }: Voices): void {
    [523.25, 783.99].forEach((f, i) => mallet({ f, at: i * 0.09, vol: 0.13, dur: 0.6, rev: 0.3 }));
  },
});

player.play('ping');
player.play('blip', { high: true });
player.play('join');
```

| Voice    | Required | What it makes                                                                                                                                                                                                     |
| -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tone`   | `f` (Hz) | A pitched oscillator. `to` and `glide` slide the pitch, `type` picks the waveform (`'sine'`, `'triangle'`, `'square'` or `'sawtooth'`), and `lp` adds a lowpass filter (a number, or `[start, end]` to sweep it). |
| `noise`  | `f` (Hz) | A burst of filtered noise: the texture of a sound. `to` sweeps the filter, `q` sets resonance, and `type` picks `'bandpass'` (the default), `'lowpass'` or `'highpass'`.                                          |
| `bell`   | `f` (Hz) | A struck-glass bell from four inharmonic partials.                                                                                                                                                                |
| `mallet` | `f` (Hz) | A soft struck note, like a marimba bar: the note, a bright overtone two octaves up and a quiet sub an octave down.                                                                                                |

Every voice also takes `at` (start delay), `dur`, `vol`, `pan` (`-1` to `1`) and `rev` (reverb send, `0` to `1`); `tone` and `noise` take `attack` too. Times are in seconds and volumes are linear. A bad value, such as a negative time or a zero duration, is reported and that voice is skipped.

More ready-made recipes are in the siyo web app. They use exactly this shape: paste one into the object above and it plays.

### Go low-level

The `raw` voice hands you the audio context to build any Web Audio graph yourself, and plays it through the player's volume, mute, limiter, reverb and `stop()`. For example, a recorded file:

```ts
import { createSiyo, type Voices } from 'siyo';

const audio = new AudioContext();
const file = await fetch('/sounds/chime.mp3');
const chime = await audio.decodeAudioData(await file.arrayBuffer());

const player = createSiyo(
  {
    chime({ raw }: Voices): void {
      raw((ctx, output, start) => {
        const source = ctx.createBufferSource();
        source.buffer = chime;
        source.connect(output);
        source.start(start);
        return start + chime.duration;
      });
    },
  },
  { createContext: () => audio },
);

player.play('chime');
```

Connect your graph to `output`, schedule it from `start`, and return the time it ends, so the player knows when to release it. `ctx` is typed with the parts of Web Audio siyo itself uses; cast it to `AudioContext` for the rest. Tuning does not reach inside a raw voice.

## Volume, mute and stop

```ts
siyo.volume(0.6); // 0 to 1
siyo.mute(true); // play() does nothing until mute(false)
siyo.stop(); // cut everything that is playing, reverb tail included
```

## Accessibility

- **Sound is never the only feedback.** Pair every sound with a visible change: a state, a message or a moving part. People who can't hear it, or who turned it off, must lose nothing.
- **Let people turn it off.** Offer a sound switch and remember the choice:

  ```ts
  soundSwitch.checked = localStorage.getItem('sounds') !== 'off';
  siyo.mute(!soundSwitch.checked);

  soundSwitch.addEventListener('change', () => {
    siyo.mute(!soundSwitch.checked);
    localStorage.setItem('sounds', soundSwitch.checked ? 'on' : 'off');
  });
  ```

- **Nothing plays uninvited.** Sounds wait for the first click, tap or key press, and a muted player creates no audio context at all.
- **Short and quiet.** 35 of the 45 built-in sounds last under 300 ms, their notes sit between 65 Hz and 2.6 kHz, the default volume is 0.8, and every sound passes through a limiter.
- **Reduced motion.** siyo does not read `prefers-reduced-motion`, because that setting is about motion, not sound, and muting everyone who asked for less motion would take away feedback they may rely on. If your product treats it as a request for less sound, it is one line: `createSiyo(SOUNDS, { muted: matchMedia('(prefers-reduced-motion: reduce)').matches })`.

## Bundle size

| Import        | Contains                                                     |
| ------------- | ------------------------------------------------------------ |
| `siyo/core`   | The engine, `tuned()` and every type. No sounds.             |
| `siyo/sounds` | Every built-in sound as its own named export, plus `SOUNDS`. |
| `siyo`        | Everything above, plus the ready-made `siyo` player.         |

Import only the sounds you use and your bundler drops the rest:

```ts
import { createSiyo } from 'siyo/core';
import { tap, success, menu } from 'siyo/sounds';

const player = createSiyo({ tap, success, menu });

player.play('tap');
```

Measured with esbuild, minified: the engine alone is 7.4 kB (3.1 kB gzipped), each sound adds about 0.1 to 0.2 kB, and the full `siyo` player with all 45 sounds is 15.1 kB (5.3 kB gzipped). `SOUNDS` and the `siyo` player keep every sound.

A few sound names (`window`, `type`, `copy`, `error`) shadow familiar names when imported directly. Rename them on import: `import { window as windowSound } from 'siyo/sounds'`.

## Browser support

Any browser with the Web Audio API: Chrome and Edge 80+, Firefox 74+ and Safari 14.1+, on desktop and mobile, plus Electron and Tauri. Older Safari falls back to `webkitAudioContext`. Holding sounds until the first gesture uses `navigator.userActivation` (Chrome 72+, Firefox 120+, Safari 16.4+); where a browser lacks it, the browser's own autoplay rules decide.

## Errors

`play()` never throws. An unknown sound name, an invalid voice value or `tune` knob, a recipe that throws, or an audio context that cannot be created goes to `onError`, which logs to `console.error` by default:

```ts
import { createSiyo, SOUNDS } from 'siyo';

const player = createSiyo(SOUNDS, {
  onError: (error) => console.warn('siyo:', error),
});
```

A context that cannot be created is reported once, then retried quietly on later sounds. A context that was closed behind the player's back is replaced on the next sound. `tuned()` and the `tune` option of `createSiyo()` are checked as you call them, and throw a `RangeError` for a bad knob.

## API

| Export                          | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `siyo`                          | A ready-made player with every built-in sound. |
| `createSiyo(recipes, options?)` | Build a player from your own recipes.          |
| `SOUNDS`                        | The built-in recipes, keyed by name.           |
| `tuned(recipe, knobs)`          | A retuned copy of a recipe.                    |

`createSiyo` options, all optional:

| Option           | Default              | Description                                                  |
| ---------------- | -------------------- | ------------------------------------------------------------ |
| `volume`         | `0.8`                | Master volume, `0` to `1`.                                   |
| `muted`          | `false`              | Start muted.                                                 |
| `tune`           | none                 | Knobs applied to every sound of the player.                  |
| `requireGesture` | `true`               | Play nothing until the page's first click, tap or key press. |
| `createContext`  | a new `AudioContext` | Supply your own context, for example to share your app's.    |
| `onError`        | `console.error`      | Receives every problem `play()` reports.                     |

A player has these methods, which also work when destructured:

| Method                 | Description                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `play(name, options?)` | Play a sound. `options` holds the sound's own options and `tune`.                                                                                        |
| `stop()`               | Silence everything currently playing.                                                                                                                    |
| `volume(level)`        | Set the master volume, clamped to `0` to `1`.                                                                                                            |
| `mute(muted)`          | Mute or unmute. Muting does not cut sounds already playing; `stop()` does.                                                                               |
| `dispose()`            | Release the player's audio graph. It closes a context the player created, and only disconnects one from `createContext`. The next `play()` starts fresh. |

Create a player once, at module scope rather than inside a component that re-renders: each player opens its own audio context on its first sound.

Types: `SoundName`, `Siyo`, `SiyoOptions`, `PlayOptions`, `PlayArgs`, `Recipe`, `Recipes`, `Voices`, `ToneParams`, `NoiseParams`, `BellParams`, `MalletParams`, `RawParams`, `RawBuild`, `CommonVoiceParams`, `LowpassSpec`, `ToneWave`, `NoiseFilter` and `TuneKnobs`; the sound option types `OpenOptions`, `OnOptions`, `PitchOptions`, `PasteOptions` and `ZoomOptions`; and `AudioContextLike` with the node interfaces it uses.

## Built-in sounds

45 sounds ship in the package.

**Navigation**

| Name      | Sounds like                                                          | Use it for                                                  | Options |
| --------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | ------- |
| `back`    | A short downward tick that feels like stepping one place behind you. | Back buttons, previous page, leaving a panel                |         |
| `forward` | The mirror of Back: a short upward tick that moves you ahead.        | Forward buttons, next item, redo navigation                 |         |
| `search`  | A light airy sweep ending in a clear two-tone chime.                 | Opening search, command palettes, focusing the search field |         |
| `tab`     | A dry wooden knock for switching between views.                      | Tab bars, sidebar items, view switchers                     |         |
| `menu`    | A soft puff that rises when a menu opens and falls when it closes.   | Dropdowns, context menus, popovers                          | `open`  |

**Controls**

| Name      | Sounds like                                                              | Use it for                                     | Options |
| --------- | ------------------------------------------------------------------------ | ---------------------------------------------- | ------- |
| `option`  | A crisp, bright click for choosing one item from a list.                 | Dropdown items, radio buttons, list rows       |         |
| `sidebar` | A low air slide with a soft thud as the panel settles.                   | Collapsing sidebars, drawers, inspector panels | `open`  |
| `type`    | A soft keystroke with natural variation on every press.                  | Editors, chat inputs, terminals                |         |
| `hover`   | Almost silent. Use it sparingly for pointer feedback.                    | Toolbar buttons, list rows, menu items         |         |
| `tooltip` | A faint high shimmer for help that appears after a short pause.          | Tooltips, hints, hover cards                   |         |
| `record`  | Two rising beeps to start and a falling pair to stop.                    | Mic on and off, screen recording               | `on`    |
| `lock`    | A heavy latch on lock and a lighter release on unlock.                   | Vaults, passcodes, read-only mode              | `on`    |
| `expand`  | A short puff that opens upward and closes back down.                     | Accordions, tree rows, show more               | `open`  |
| `toggle`  | A damped wooden click. It pitches up when switched on and down when off. | Switches, settings, mode changes               | `on`    |
| `tick`    | A tiny crisp notch, like a haptic detent under your finger.              | Checkboxes, list selection, steppers           | `pitch` |

**Windows**

| Name      | Sounds like                                                              | Use it for                                                   | Options |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ | ------- |
| `dialog`  | A gentle swell when a dialog opens and a drop when it closes.            | Modals, sheets, confirmation prompts                         | `open`  |
| `popover` | A glassy puff that opens upward and settles back when it closes.         | Popovers, filter panels, date pickers                        | `open`  |
| `context` | A tight click with a short upward tone, like a menu snapping into place. | Right-click menus, quick actions                             |         |
| `window`  | A soft sweep that rises on restore and drops as a window minimizes.      | Minimize, maximize, restore                                  | `open`  |
| `dismiss` | A fast downward swipe that clears something out of the way.              | Closing toasts, swiping away banners, clearing notifications |         |

**Actions**

| Name       | Sounds like                                                                  | Use it for                                          | Options |
| ---------- | ---------------------------------------------------------------------------- | --------------------------------------------------- | ------- |
| `copy`     | Two quick ticks. The second pair is lower when you paste.                    | Copy and paste, duplicate, copy link                | `paste` |
| `remove`   | Crumpling air that falls away, ending in a muffled thud.                     | Delete file, clear list, empty trash                |         |
| `send`     | An upward whoosh with a small glass sparkle as it leaves.                    | Send message, submit form, publish                  |         |
| `favorite` | Two bright bells when you star something and a soft tick when you remove it. | Stars, pins, likes, bookmarks                       | `on`    |
| `refresh`  | A rising sweep that finishes on a clear tone.                                | Reload, sync, pull to refresh                       |         |
| `tap`      | A soft bubble pop that confirms a press without drawing attention.           | Buttons, send, delete, undo                         |         |
| `snap`     | A magnetic click with a low thud as an item docks into place.                | Drag and drop, grid snapping, window tiling         |         |
| `grab`     | A soft pinch and lift, like picking an item up off the surface.              | Starting a drag, picking up cards, reordering lists |         |
| `drop`     | A small landing thud with a light click as the item settles.                 | Dropping files, placing cards, ending a drag        |         |
| `undo`     | A quick falling sweep with two soft steps backward.                          | Undo, revert, discard changes                       |         |

**Feedback**

| Name      | Sounds like                                                         | Use it for                                    | Options |
| --------- | ------------------------------------------------------------------- | --------------------------------------------- | ------- |
| `warning` | Two falling bells that get attention without sounding alarmed.      | Unsaved changes, low storage, risky actions   |         |
| `error`   | Two clashing low tones that fall. Clearly wrong, never shrill.      | Failed saves, crashes, rejected uploads       |         |
| `success` | Four glass bells rising through an E major chord, with a room tail. | Payments, saves, completed flows              |         |
| `deny`    | Two muffled knocks. It says no without a harsh buzzer.              | Wrong PIN, blocked actions, errors            |         |
| `reward`  | Six rising bells with a shimmer of air above them.                  | Level ups, streaks, achievements              |         |
| `save`    | Two warm rising notes. Quieter and shorter than Success.            | Autosave, saving a draft, small confirmations |         |

**Notifications**

| Name      | Sounds like                                                    | Use it for                           | Options |
| --------- | -------------------------------------------------------------- | ------------------------------------ | ------- |
| `notify`  | A two-note chime built from inharmonic glass partials.         | Incoming messages, alerts, reminders |         |
| `mention` | One clear glass bell. Short enough to repeat without annoying. | @mentions, replies, assigned tasks   |         |

**System**

| Name       | Sounds like                                                              | Use it for                                      | Options |
| ---------- | ------------------------------------------------------------------------ | ----------------------------------------------- | ------- |
| `connect`  | A rising pair when you come online and a falling pair when you drop off. | Network, device pairing, sync status            | `on`    |
| `shutter`  | Two curtain clicks, each with its own mechanical thump.                  | Camera capture, screenshots                     |         |
| `startup`  | A slow, warm chord that opens up as a filter sweeps across it.           | App launch, power on, welcome screens           |         |
| `download` | A falling note that lands with a thud, then a small bell.                | Finished downloads, exports, file saved to disk |         |

**Movement**

| Name    | Sounds like                                                           | Use it for                               | Options |
| ------- | --------------------------------------------------------------------- | ---------------------------------------- | ------- |
| `scrub` | A fine ratchet click that rises in pitch along a slider.              | Sliders, dials, timelines                | `pitch` |
| `swipe` | A breath of filtered air that sweeps upward and lands on a soft tone. | Tabs, segmented controls, page changes   |         |
| `zoom`  | A light air sweep that rises on zoom in and falls on zoom out.        | Canvas zoom, image preview, map controls | `in`    |

## Development

```sh
npm install
npm run check    # typecheck and tests
npm run build    # dist/esm, dist/cjs and dist/browser
npm run verify   # load every built format the way users do
```

## License

MIT. Copyright (c) 2026 Scntix (Disruptions Lab Solutions LLC). The full text is in the `LICENSE` file.
