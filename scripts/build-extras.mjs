// Builds the CommonJS fallback and the browser script from the ES modules that
// tsc has written to dist/esm/, so every format ships the same compiled code.
//
//   dist/esm/       ES modules and their types (written by tsc)
//   dist/cjs/       CommonJS, one .cjs file and one .d.cts file per module, for require()
//   dist/browser/   siyo.js, a classic <script> build that defines `Siyo`, and siyo.min.js

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';

const esm = new URL('../dist/esm/', import.meta.url);
const cjs = new URL('../dist/cjs/', import.meta.url);
const browser = new URL('../dist/browser/', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

/** Point relative module specifiers at the CommonJS files: './engine.js' becomes './engine.cjs'. */
const toCommonJsSpecifiers = (code) => code.replace(/(['"])(\.{1,2}\/[^'"\n]+?)\.js\1/g, '$1$2.cjs$1');

await mkdir(cjs, { recursive: true });
const files = await readdir(esm);

for (const file of files.filter((name) => name.endsWith('.js'))) {
  const source = await readFile(new URL(file, esm), 'utf8');
  const { code } = await transform(source, { format: 'cjs', loader: 'js', platform: 'node' });
  await writeFile(new URL(file.replace(/\.js$/, '.cjs'), cjs), toCommonJsSpecifiers(code));
}

for (const file of files.filter((name) => name.endsWith('.d.ts'))) {
  const source = await readFile(new URL(file, esm), 'utf8');
  await writeFile(new URL(file.replace(/\.d\.ts$/, '.d.cts'), cjs), toCommonJsSpecifiers(source));
}

const banner = `/*! ${pkg.name} ${pkg.version} | ${pkg.license} License | Copyright (c) 2026 Scntix (Disruptions Lab Solutions LLC) */`;

for (const minify of [false, true]) {
  await build({
    entryPoints: [fileURLToPath(new URL('index.js', esm))],
    outfile: fileURLToPath(new URL(minify ? 'siyo.min.js' : 'siyo.js', browser)),
    bundle: true,
    format: 'iife',
    globalName: 'Siyo',
    target: 'es2020',
    minify,
    legalComments: 'none',
    banner: { js: banner },
    logLevel: 'warning',
  });
}
