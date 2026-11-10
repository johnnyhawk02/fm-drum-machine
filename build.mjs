// Builds dist/index.html (one self-contained page) from src/.
//   node build.mjs
// The engine and sequencer modules are stripped of import/export and joined into one classic script,
// used both by the page and (as text) by the AudioWorklet.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';

// LF only: a Windows checkout may have CRLF, which the import/export stripping below wouldn't match
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (src) => src
  .replace(/^import[\s\S]*?from\s+'[^']+';\n/gm, '')
  .replace(/^export \{[^}]*\};?\n/gm, '')
  .replace(/^export (const|function|class|let) /gm, '$1 ');

const ENGINE = ['engine/dsp', 'engine/params', 'engine/voice', 'engine/kits', 'engine/fx', 'engine/engine', 'seq/sequencer', 'seq/patterngen', 'seq/modseq'];
const engine = ENGINE.map((f) => `// ---- ${f}.js\n` + strip(read(`src/${f}.js`))).join('\n');
const worklet = engine + '\n' + read('src/worklet.js');

const UI = ['host', 'ir', 'core', 'widgets', 'perf', 'mutes', 'pages/beat', 'pages/voice', 'pages/fx', 'pages/mix', 'pages/mstr', 'pages/prst',
  'names', 'randomise', 'autolevel', 'colourpicker', 'quick', 'recorder', 'midi', 'keys', 'vis', 'main'];
const ui = UI.filter((f) => existsSync(new URL(`src/ui/${f}.js`, import.meta.url))).map((f) => `// ---- ui/${f}.js\n` + read(`src/ui/${f}.js`)).join('\n');

// built-in presets: presets/*.json, each { presets: [...] }
const presetDir = new URL('presets/', import.meta.url);
const presets = existsSync(presetDir) ? readdirSync(presetDir).filter((f) => f.endsWith('.json')).sort()
  .flatMap((f) => JSON.parse(readFileSync(new URL(f, presetDir), 'utf8')).presets || []) : [];

// built-in visualiser presets: presets/vis/*.json, each { presets: [...] } as the visualiser's export presets writes it
const visDir = new URL('presets/vis/', import.meta.url);
const visPresets = existsSync(visDir) ? readdirSync(visDir).filter((f) => f.endsWith('.json')).sort()
  .flatMap((f) => JSON.parse(readFileSync(new URL(f, visDir), 'utf8')).presets || []) : [];

// build version: date + commit, shown in options; the service worker's cache name changes with it
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
const ver = new Date().toISOString().slice(0, 16).replace('T', ' ') + (commit ? ' ' + commit : '');
const logo = readFileSync(new URL('src/static/logo.png', import.meta.url)).toString('base64');
const img2 = readFileSync(new URL('src/static/image2.png', import.meta.url)).toString('base64');
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
const app = `(() => {\n'use strict';\n${engine}\nconst WORKLET_SRC = ${JSON.stringify(worklet)};\nconst BUILTIN_PRESETS = ${JSON.stringify(presets)};\nconst BUILTIN_VIS = ${JSON.stringify(visPresets)};\nconst LOGO_URL = ${JSON.stringify('data:image/png;base64,' + logo)};\nconst IMG2_URL = ${JSON.stringify('data:image/png;base64,' + img2)};\nconst APP_VER = ${JSON.stringify(ver)};\n${ui}\n})();`;
const font = readFileSync(new URL('src/static/vt323-latin.woff2', import.meta.url)).toString('base64');
const fontCss = `@font-face { font-family: 'VT323'; font-style: normal; font-weight: 400; font-display: block; src: url(data:font/woff2;base64,${font}) format('woff2'); }\n`;
const page = read('src/index.src.html')
  .replace('/*@CSS@*/', () => fontCss + read('src/ui/style.css').replaceAll('url(logo.png)', `url(data:image/png;base64,${logo})`))
  .replace('/*@APP@*/', () => esc(app));

mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('dist/index.html', import.meta.url), page);
// impulse responses (fetched when picked) and their credits
mkdirSync(new URL('dist/ir/', import.meta.url), { recursive: true });
for (const f of readdirSync(new URL('src/static/ir/', import.meta.url))) copyFileSync(new URL(`src/static/ir/${f}`, import.meta.url), new URL(`dist/ir/${f}`, import.meta.url));
for (const f of ['manifest.webmanifest', 'icon.svg', 'icon-512.png']) copyFileSync(new URL(`src/static/${f}`, import.meta.url), new URL(`dist/${f}`, import.meta.url));
writeFileSync(new URL('dist/sw.js', import.meta.url), read('src/static/sw.js').replace('@VER@', ver));
// Cloudflare Pages: always revalidate the page and the service worker, so updates show at startup
writeFileSync(new URL('dist/_headers', import.meta.url), '/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n');
// help page: the same help as the ? dialog, in the LCD look
const HELP = new Function(`return ${/const HELP = (\[[\s\S]*?\n\]);/.exec(read('src/ui/keys.js'))[1]}`)();
writeFileSync(new URL('dist/help.html', import.meta.url), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>fm/dm help</title>
<style>${fontCss}body{margin:0;background:#0b0c0a;padding:16px;font-family:VT323,monospace;color:#17200e}main{max-width:900px;margin:0 auto;background:#d1c7ac;border-radius:10px;padding:20px 28px;font-size:22px}h1{font-weight:normal;letter-spacing:.1em}h2{font-weight:normal;letter-spacing:.14em;text-transform:uppercase;border-top:2px solid #17200e;padding-top:8px;margin:18px 0 4px;font-size:22px}a{color:inherit}</style>
<main><h1>FM DM · HELP</h1><p><a href="./">back to the drum machine</a></p>${HELP.map(([a, b]) => `<h2>${a}</h2><p>${b}</p>`).join('')}</main>`);
console.log(`dist/index.html: ${(page.length / 1024).toFixed(1)} KB, ${presets.length} built-in presets, ${visPresets.length} visualiser presets`);
