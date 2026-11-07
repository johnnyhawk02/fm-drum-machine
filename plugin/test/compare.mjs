// Compares the C++ engine's renders (plugin/test/render.cpp) with the JS engine on the same scenes.
//   node plugin/test/compare.mjs <dir with .f32 files>
import { readFileSync } from 'node:fs';
import { Engine } from '../../src/engine/engine.js';
import { Sequencer, MAX_STEPS, F_OPEN, F_ACCENT, NV } from '../../src/seq/sequencer.js';
import { P, M, NP } from '../../src/engine/params.js';

const dir = process.argv[2] || '.';
const SR = 48000;
let fail = 0;
function cmp(name, L, R) {
  const raw = new Float32Array(readFileSync(`${dir}/${name}.f32`).buffer.slice(0));
  let err = 0, sig = 0, pk = 0;
  for (let i = 0; i < L.length; i++) {
    const a = raw[2 * i], b = raw[2 * i + 1];
    err += (a - L[i]) ** 2 + (b - R[i]) ** 2;
    sig += L[i] ** 2 + R[i] ** 2;
    pk = Math.max(pk, Math.abs(a - L[i]), Math.abs(b - R[i]));
  }
  const snr = 10 * Math.log10(sig / Math.max(err, 1e-30));
  const ok = raw.length === L.length * 2 && snr > 60;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} match ${snr.toFixed(1)} dB, max diff ${pk.toExponential(2)}`);
}
for (let v = 0; v < 6; v++) for (const alt of v === 5 ? [0, 1] : [0]) {
  const e = new Engine(SR, 1), n = SR * 1.5, L = new Float32Array(n), R = new Float32Array(n);
  e.trigger(v, 1, alt);
  e.process(L, R, n);
  cmp(`voice${v}${alt ? 'o' : ''}`, L, R);
}
{
  const e = new Engine(SR, 1), s = new Sequencer(e, 1);
  const pat = ['1000100010001010', '0000000000000010', '0001000000010000', '0000100000001000', '1000000000000000', '1111111111111111'];
  pat.forEach((row, v) => [...row].forEach((c, k) => { if (c === '1') s.vel[v * MAX_STEPS + k] = k % 4 ? 90 : 127; }));
  s.flag[5 * MAX_STEPS + 14] = F_OPEN;
  s.flag[12] = F_ACCENT;
  s.setFlat(3 * NP + P.sEcho, 0.4); s.setFlat(3 * NP + P.sRev, 0.5); s.setFlat(NP + P.sDist, 0.5); s.setFlat(2 * NP + P.sRing, 0.5);
  s.setFlat(NV + M.dkAmt, 0.6); s.setFlat(NV + M.mdMix, 0.4); s.setFlat(NV + M.swDepth, 0.5); s.setFlat(NV + M.xa01, 0.3);
  s.setFlat(NV + M.rushEvery, 1);
  s.lTarget[0] = 5 * NP + P.aDec;
  for (let k = 0; k < 16; k++) s.lSteps[k] = Math.fround((k % 4) / 3 - 0.5);
  s.lDepth[0] = 0.4;
  s.start();
  const n = SR * 4, L = new Float32Array(n), R = new Float32Array(n);
  for (let o = 0; o < n; o += 128) s.process(L.subarray(o, o + 128), R.subarray(o, o + 128), 128);
  cmp('beat', L, R);
}
process.exit(fail ? 1 : 0);
