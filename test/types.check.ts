/**
 * Compile-time assertions. This file has no runtime behavior: `npm run
 * typecheck` fails if any `@ts-expect-error` below stops being an error, or
 * any plain call stops compiling.
 */

import { createSiyo as coreCreate, type Siyo } from '../src/core.js';
import { createSiyo, SOUNDS, type SoundName, siyo, tuned, type Voices } from '../src/index.js';
// A few names shadow familiar identifiers; importing them directly must compile.
import { back, copy, error, tap, type, window as windowSound } from '../src/sounds.js';

// Built-in sounds: names are checked.
siyo.play('back');
siyo.play('success');
// @ts-expect-error unknown sound name
siyo.play('does-not-exist');

// Option shapes are checked per sound.
siyo.play('menu');
siyo.play('menu', { open: false });
siyo.play('toggle', { on: true });
siyo.play('tick', { pitch: 1.2 });
siyo.play('copy', { paste: true });
siyo.play('zoom', { in: false });
// @ts-expect-error wrong option name for this sound
siyo.play('menu', { on: true });
// @ts-expect-error wrong option value type
siyo.play('menu', { open: 'yes' });
// @ts-expect-error sounds without options of their own take only { tune }
siyo.play('back', { open: true });

// Custom recipes flow into the player's types.
const custom = createSiyo({
  ...SOUNDS,
  ping: ({ tone }: Voices): void => tone({ f: 880 }),
  level: ({ tone }: Voices, o: { amount: number }): void => tone({ f: o.amount }),
  blip: ({ tone }: Voices, { hi = false }: { hi?: boolean } = {}): void => tone({ f: hi ? 2000 : 1000 }),
});
custom.play('ping');
custom.play('back');
custom.play('level', { amount: 3 });
custom.play('blip');
custom.play('blip', { hi: true });
// @ts-expect-error a required option cannot be omitted
custom.play('level');
// @ts-expect-error required option has the wrong type
custom.play('level', { amount: 'x' });

// Tree-shakeable usage: import only the sounds you need.
const small: Siyo<{ back: typeof back; tap: typeof tap }> = coreCreate({ back, tap });
small.play('back');
// @ts-expect-error `success` was not included in this player
small.play('success');
coreCreate({ copy, error, type, window: windowSound }).play('window', { open: false });

// Voice parameters are checked.
createSiyo({
  // @ts-expect-error `f` is required on a tone
  bad: ({ tone }: Voices): void => tone({ dur: 1 }),
});
// The mallet takes a note and the shared timing, level, pan and reverb fields.
createSiyo({
  ok: ({ mallet }: Voices): void => mallet({ f: 523.25, at: 0.09, dur: 0.6, vol: 0.13, rev: 0.3, pan: -0.15 }),
});
createSiyo({
  // @ts-expect-error `f` is required on a mallet
  bad: ({ mallet }: Voices): void => mallet({ dur: 1 }),
});
createSiyo({
  // @ts-expect-error a mallet has no waveform
  bad: ({ mallet }: Voices): void => mallet({ f: 440, type: 'square' }),
});
createSiyo({
  ok: ({ tone }: Voices): void => tone({ f: 1, lp: [300, 1800], type: 'triangle', pan: -0.3 }),
});
createSiyo({
  // @ts-expect-error not a waveform
  bad: ({ tone }: Voices): void => tone({ f: 1, type: 'custom' }),
});
// Explicit `undefined` is accepted for optional fields, even with exactOptionalPropertyTypes.
createSiyo({ ok: ({ tone }: Voices): void => tone({ f: 1, to: undefined, lp: undefined }) });
siyo.play('tick', { pitch: undefined });

// tuned() keeps the original recipe's option type.
const retuned = createSiyo({ menu: tuned(SOUNDS.menu, { pitch: 1.1 }) });
retuned.play('menu', { open: false });
// @ts-expect-error still rejects bad options after tuning
retuned.play('menu', { open: 1 });

// SoundName is the union of built-in names.
const name: SoundName = 'notify';
siyo.play(name);

// Every sound takes a per-play tune, next to its own options.
siyo.play('tap', { tune: { pitch: 1.2, attack: 2 } });
siyo.play('menu', { open: false, tune: { volume: 0.5 } });
custom.play('level', { amount: 3, tune: { length: 2 } });
// @ts-expect-error a knob takes a number
siyo.play('tap', { tune: { pitch: 'high' } });
// @ts-expect-error not a knob
siyo.play('tap', { tune: { speed: 2 } });

// Player-wide options.
createSiyo(SOUNDS, { tune: { volume: 0.8, brightness: 0.9 }, requireGesture: false });
// @ts-expect-error requireGesture is a boolean
createSiyo(SOUNDS, { requireGesture: 'yes' });

// The raw escape hatch builds its own graph and returns when it ends.
createSiyo({
  sample: ({ raw }: Voices): void =>
    raw(
      (ctx, output, start) => {
        const osc = ctx.createOscillator();
        osc.connect(output);
        osc.start(start);
        osc.stop(start + 0.5);
        return start + 0.5;
      },
      { rev: 0.2 },
    ),
});
createSiyo({
  bad: ({ raw }: Voices): void =>
    // @ts-expect-error the build function must return the end time
    raw((ctx, output) => {
      ctx.createGain().connect(output);
    }),
});
