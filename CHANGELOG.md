# Changelog

The built-in sounds are part of the API. A change to how one of them sounds ships in a minor release and is listed here.

## 0.1.0

First release.

- 45 built-in interface sounds, each its own tree-shakeable export from `siyo/sounds`, plus `SOUNDS` and the ready-made `siyo` player.
- `createSiyo()` with sound names and options checked at compile time.
- Six tuning knobs (pitch, length, attack, volume, reverb and brightness) for one sound with `tuned()`, for a whole player with the `tune` option, and for a single play with `play(name, { tune })`.
- Voices for your own sounds: `tone`, `noise`, `bell` and `mallet`, plus `raw` for any Web Audio graph you build yourself.
- Nothing plays before the page's first click, tap or key press (`requireGesture`, on by default).
- ES modules, a CommonJS build for `require()`, and a browser script build that defines a `Siyo` global.
- A headless engine with no dependencies, safe during server-side rendering. `play()` reports problems through `onError` instead of throwing.
