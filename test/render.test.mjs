// Node test: render each voice, check not silent / not clipping / deterministic.
import { Engine } from '../src/engine/engine.js';
import { VOICE_NAMES } from '../src/engine/params.js';
import { writeWav } from './wav.mjs';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SR = 48000;
const outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });
let fail = 0;

function render(v, alt = 0, seed = 1, secs = 1.5) {
  const e = new Engine(SR, seed);
  const n = SR * secs, L = new Float32Array(n), R = new Float32Array(n);
  e.trigger(v, 1, alt);
  e.process(L, R, n);
  return { L, R };
}
const stats = (L) => { let pk = 0, ss = 0; for (const x of L) { pk = Math.max(pk, Math.abs(x)); ss += x * x; } return { pk, rms: Math.sqrt(ss / L.length) }; };
const hash = (a) => createHash('sha1').update(Buffer.from(a.buffer)).digest('hex').slice(0, 10);

for (let v = 0; v < 6; v++) {
  for (const alt of v === 5 ? [0, 1] : [0]) {
    const { L, R } = render(v, alt);
    const s = stats(L), name = VOICE_NAMES[v] + (alt ? ' open' : '');
    const again = render(v, alt);
    const det = hash(L) === hash(again.L);
    const ok = s.pk > 0.05 && s.pk < 1 && det && L.every(Number.isFinite);
    if (!ok) fail++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(12)} peak ${s.pk.toFixed(3)} rms ${s.rms.toFixed(4)} det ${det}`);
    if (outDir) writeWav(`${outDir}/${name.replace(' ', '-')}.wav`, L, R, SR);
  }
}

// beat: 2 bars at 120 bpm
{
  const e = new Engine(SR, 1), step = SR * 60 / 120 / 4, n = step * 32;
  const L = new Float32Array(n), R = new Float32Array(n);
  const pat = [[0, [0, 6, 10, 16, 22, 26]], [3, [4, 12, 20, 28]], [5, [0, 2, 4, 6, 8, 10, 12, 16, 18, 20, 22, 24, 26, 28]],
    [1, [14, 30]], [2, [11, 27]], [4, [0]]];
  const ev = []; for (const [v, steps] of pat) for (const s of steps) ev.push([s * step, v]);
  ev.push([14 * step, 5, 1]); ev.push([30 * step, 5, 1]);
  ev.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [t, v, alt] of ev) { e.process(L, R, t - pos, pos); pos = t; e.trigger(v, 0.85 + 0.15 * ((t / step) % 4 === 0), alt || 0); }
  e.process(L, R, n - pos, pos);
  const s = stats(L);
  console.log(`beat         peak ${s.pk.toFixed(3)} rms ${s.rms.toFixed(4)}`);
  if (s.pk >= 1) { fail++; console.log('FAIL beat clips'); }
  if (outDir) writeWav(`${outDir}/beat.wav`, L, R, SR);
}
// speed
{
  const e = new Engine(SR, 1), n = SR * 10, L = new Float32Array(n), R = new Float32Array(n);
  const t0 = performance.now();
  for (let i = 0; i < n; i += 4800) { for (let v = 0; v < 6; v++) e.trigger(v, 1); e.process(L, R, 4800, i); }
  console.log(`speed: 10 s, all voices busy, in ${(performance.now() - t0).toFixed(0)} ms`);
}
process.exit(fail ? 1 : 0);
