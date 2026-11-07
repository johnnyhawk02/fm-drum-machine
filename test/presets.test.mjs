// Node test: every built-in preset renders 4 bars, not silent, not clipping.
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { Sequencer, MAX_STEPS } from '../src/seq/sequencer.js';
import { PARAMS, MPARAMS, NP, NUM_VOICES, M } from '../src/engine/params.js';
import { writeWav } from './wav.mjs';
const SR = 48000, outDir = process.argv[2];
const { presets } = JSON.parse(readFileSync(new URL('../presets/factory.json', import.meta.url)));
const NV = NUM_VOICES * NP;
const keyG = (k) => k.startsWith('m.') ? NV + MPARAMS.find((p) => p.id === k.slice(2)).i : +k[1] * NP + PARAMS.find((p) => p.id === k.slice(3)).i;
let fail = 0;
for (const pr of presets) {
  const e = new Engine(SR, 1), s = new Sequencer(e, 1);
  for (let v = 0; v < 6; v++) for (const p of PARAMS) s.setFlat(v * NP + p.i, pr.voices[v][p.id] ?? p.def);
  for (const p of MPARAMS) s.setFlat(NV + p.i, pr.master[p.id] ?? p.def);
  pr.pat.forEach((row, t) => row.forEach((x, k) => { s.vel[t * MAX_STEPS + k] = x & 127; s.flag[t * MAX_STEPS + k] = x >> 7; }));
  pr.lanes.forEach((ln, l) => { s.lTarget[l] = keyG(ln.key); s.lSteps.set(ln.steps, l * MAX_STEPS); s.lLen[l] = ln.len; s.lSlew[l] = ln.slew; s.lSpeed[l] = ln.speed; s.lDepth[l] = ln.depth; s.lGroove[l] = ln.groove ? 1 : 0; });
  const n = Math.round(SR * 60 / pr.master.bpm * 16), L = new Float32Array(n), R = new Float32Array(n);
  s.start();
  for (let i = 0; i < n; i += 128) s.process(L.subarray(i, i + 128), R.subarray(i, i + 128), Math.min(128, n - i));
  let pk = 0, ss = 0; for (let i = 0; i < n; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); ss += L[i] * L[i]; }
  const rms = Math.sqrt(ss / n), ok = pk > 0.1 && pk < 0.95 && rms > 0.01 && L.every(Number.isFinite);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${pr.name.padEnd(16)} ${pr.gen.genre.padEnd(8)} peak ${pk.toFixed(3)} rms ${rms.toFixed(4)}`);
  if (outDir) writeWav(`${outDir}/preset-${pr.name.replace(' ', '-')}.wav`, L, R, SR);
}
process.exit(fail ? 1 : 0);
