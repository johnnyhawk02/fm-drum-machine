// Builds dist/index.html (one self-contained page) from src/.
//   node build.mjs
// The engine and sequencer modules are stripped of import/export and joined into one classic script,
// used both by the page and (as text) by the AudioWorklet.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const strip = (src) => src
  .replace(/^import[\s\S]*?from\s+'[^']+';\n/gm, '')
  .replace(/^export \{[^}]*\};?\n/gm, '')
  .replace(/^export (const|function|class|let) /gm, '$1 ');

const ENGINE = ['engine/dsp', 'engine/params', 'engine/voice', 'engine/kits', 'engine/fx', 'engine/engine', 'seq/sequencer', 'seq/patterngen', 'seq/modseq'];
const engine = ENGINE.map((f) => `// ---- ${f}.js\n` + strip(read(`src/${f}.js`))).join('\n');
const worklet = engine + '\n' + read('src/worklet.js');

const UI = ['core', 'widgets', 'perf', 'mutes', 'pages/beat', 'pages/voice', 'pages/fx', 'pages/mix', 'pages/mstr', 'pages/prst',
  'randomise', 'recorder', 'midi', 'keys', 'main'];
const ui = UI.filter((f) => existsSync(new URL(`src/ui/${f}.js`, import.meta.url))).map((f) => `// ---- ui/${f}.js\n` + read(`src/ui/${f}.js`)).join('\n');

// built-in presets: presets/*.json, each { presets: [...] }
const presetDir = new URL('presets/', import.meta.url);
const presets = existsSync(presetDir) ? readdirSync(presetDir).filter((f) => f.endsWith('.json')).sort()
  .flatMap((f) => JSON.parse(readFileSync(new URL(f, presetDir), 'utf8')).presets || []) : [];

const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
const app = `(() => {\n'use strict';\n${engine}\nconst WORKLET_SRC = ${JSON.stringify(worklet)};\nconst BUILTIN_PRESETS = ${JSON.stringify(presets)};\n${ui}\n})();`;
const font = readFileSync(new URL('src/static/vt323-latin.woff2', import.meta.url)).toString('base64');
const fontCss = `@font-face { font-family: 'VT323'; font-style: normal; font-weight: 400; font-display: block; src: url(data:font/woff2;base64,${font}) format('woff2'); }\n`;
const page = read('src/index.src.html')
  .replace('/*@CSS@*/', () => fontCss + read('src/ui/style.css'))
  .replace('/*@APP@*/', () => esc(app));

mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('dist/index.html', import.meta.url), page);
for (const f of ['manifest.webmanifest', 'icon.svg', 'sw.js', 'help.html']) {
  const src = new URL(`src/static/${f}`, import.meta.url);
  if (existsSync(src)) copyFileSync(src, new URL(`dist/${f}`, import.meta.url));
}
console.log(`dist/index.html: ${(page.length / 1024).toFixed(1)} KB, ${presets.length} built-in presets`);
