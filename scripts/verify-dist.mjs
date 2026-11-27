// Checks the built package the way people load it: as ES modules, through
// require(), and as a classic browser script. Also fails on any file or folder
// in dist/ that is not meant to ship. Runs after the build, before publishing.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dist = new URL('../dist/', import.meta.url);
const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const MODULES = ['context', 'core', 'defaults', 'engine', 'index', 'sounds', 'tune', 'types'];
const layout = {
  esm: MODULES.flatMap((name) => [`${name}.js`, `${name}.d.ts`]),
  cjs: MODULES.flatMap((name) => [`${name}.cjs`, `${name}.d.cts`]),
  browser: ['siyo.js', 'siyo.min.js'],
};
const expected = new Set(Object.entries(layout).flatMap(([folder, files]) => files.map((file) => `${folder}/${file}`)));

// 1. Nothing stray, nothing missing: exactly the three folders and their files.
const present = new Set();
for (const entry of await readdir(dist, { withFileTypes: true })) {
  assert.ok(entry.isDirectory() && entry.name in layout, `unexpected entry in dist/: ${entry.name}`);
  for (const file of await readdir(new URL(`${entry.name}/`, dist))) present.add(`${entry.name}/${file}`);
}
assert.deepEqual(
  [...present].filter((f) => !expected.has(f)),
  [],
  'unexpected files in dist/',
);
assert.deepEqual(
  [...expected].filter((f) => !present.has(f)),
  [],
  'missing files in dist/',
);

// 2. Every path the package.json points at exists.
const targets = [];
const collect = (value) => {
  if (typeof value === 'string') targets.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
};
collect(pkg.exports);
collect(pkg.typesVersions);
collect([pkg.main, pkg.module, pkg.types, pkg.unpkg, pkg.jsdelivr]);
for (const target of targets) {
  if (target === './package.json') continue;
  assert.ok(present.has(target.replace(/^(\.\/)?dist\//, '')), `package.json points at a missing file: ${target}`);
}

/** The public API every format must expose. */
const checkApi = (api, label) => {
  assert.equal(typeof api.siyo?.play, 'function', `${label}: siyo player`);
  assert.equal(typeof api.createSiyo, 'function', `${label}: createSiyo`);
  assert.equal(typeof api.tuned, 'function', `${label}: tuned`);
  assert.equal(Object.keys(api.SOUNDS ?? {}).length, 45, `${label}: 45 built-in sounds`);
  // No audio context outside a browser: playing is a silent no-op, never an error.
  assert.doesNotThrow(() => api.siyo.play('tap'), `${label}: play() outside a browser`);
};

// 3. ES modules.
const esm = await import(new URL('esm/index.js', dist).href);
const esmSounds = await import(new URL('esm/sounds.js', dist).href);
const esmCore = await import(new URL('esm/core.js', dist).href);
checkApi(esm, 'ESM');
assert.equal(esm.SOUNDS.tap, esmSounds.tap, 'ESM: one copy of each sound across entry points');
assert.equal(esm.createSiyo, esmCore.createSiyo, 'ESM: one engine across entry points');

// 4. CommonJS.
const cjs = require(fileURLToPath(new URL('cjs/index.cjs', dist)));
const cjsSounds = require(fileURLToPath(new URL('cjs/sounds.cjs', dist)));
checkApi(cjs, 'CommonJS');
assert.equal(cjs.SOUNDS.tap, cjsSounds.tap, 'CommonJS: one copy of each sound across entry points');

// 5. The classic browser script, run in a bare global scope like a page's.
for (const file of layout.browser) {
  const code = await readFile(new URL(`browser/${file}`, dist), 'utf8');
  assert.ok(code.startsWith(`/*! ${pkg.name} ${pkg.version} | MIT License`), `browser/${file}: license banner`);
  const page = vm.createContext({});
  vm.runInContext(code, page);
  checkApi(page.Siyo, `browser/${file}`);
}

console.log(`dist ok: esm/, cjs/ and browser/ hold ${present.size} files, and every format loads`);
