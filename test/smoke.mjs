// Playwright smoke test: serve dist/, load the page, play every built-in preset, check the output
// meters show sound that isn't clipping, and no page errors. Also writes screenshots.
//   node build.mjs && node test/smoke.mjs [shots-dir]
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const dist = new URL('../dist/', import.meta.url);
const types = { html: 'text/html', js: 'text/javascript', json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png' };
const srv = createServer((req, res) => {
  const f = new URL('.' + (req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]), dist);
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[f.pathname.split('.').pop()] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const url = `http://localhost:${srv.address().port}/`;
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });

const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let fail = 0;
const errors = [];
for (const [w, hgt] of [[1440, 900], [1280, 800]]) {
  const p = await b.newPage({ viewport: { width: w, height: hgt } });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__fmdm);
  // nothing scrolls: the stage fits the window
  const fits = await p.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && document.documentElement.scrollHeight <= innerHeight; });
  console.log(`${fits ? 'ok  ' : 'FAIL'} ${w}x${hgt} fits without scrolling`);
  if (!fits) fail++;
  if (w === 1440) {
    await p.click('#play');
    await p.waitForFunction(() => window.__fmdm.S.status && window.__fmdm.S.status.playing, null, { timeout: 10000 });
    const n = await p.evaluate(() => window.__fmdm.BUILTIN_PRESETS.length);
    for (let i = 0; i < n; i++) {
      await p.evaluate((i) => { const f = window.__fmdm; f.S.playing = false; f.applyPreset(f.BUILTIN_PRESETS[i]); f.S.playing = true; }, i);
      // track the loudest master peak over ~2 s
      const r = await p.evaluate(() => new Promise((res) => {
        let pk = 0; const t0 = performance.now();
        const tick = () => { const st = window.__fmdm.S.status; if (st) pk = Math.max(pk, st.meters[6], st.meters[7]);
          if (performance.now() - t0 > 2000) res(pk); else requestAnimationFrame(tick); };
        tick();
      }));
      const name = await p.evaluate((i) => window.__fmdm.BUILTIN_PRESETS[i].name, i);
      const ok = r > 0.05 && r < 0.99;
      if (!ok) fail++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} preset ${name.padEnd(16)} peak ${r.toFixed(3)}`);
    }
  }
  if (shots) for (const pg of ['beat', 'voice', 'fx', 'mix', 'mstr', 'prst']) {
    await p.evaluate((pg) => window.__fmdm.showPage(pg), pg);
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${shots}/${pg}-${w}x${hgt}.png` });
  }
  await p.close();
}
if (errors.length) { fail++; console.log('FAIL page errors:\n' + errors.join('\n')); }
await b.close();
srv.close();
process.exit(fail ? 1 : 0);
