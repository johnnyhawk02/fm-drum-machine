// Makes presets/factory.json: built-in presets for fm dm, from the starting kit with seeded variations.
//   node tools/make-presets.mjs
import { writeFileSync } from 'node:fs';
import { PARAMS, MPARAMS, NP, P, toNorm, fromNorm, defaultMaster } from '../src/engine/params.js';
import { INIT_KIT, kitToArray } from '../src/engine/kits.js';
import { generate } from '../src/seq/patterngen.js';
import { MAX_STEPS } from '../src/seq/sequencer.js';
import { Rng } from '../src/engine/dsp.js';

const PERF = ['m.bpm', 'm.dkAmt', 'm.swDepth', 'gen.energy', 'v0.tune', 'v0.aDec', 'v0.pAmt', 'v0.fmLvl', 'v1.tune', 'v1.aDec', 'v2.tune', 'v2.aDec',
  'v3.tune', 'v3.nDec', 'v3.nCut', 'v3.fmLvl', 'v4.tune', 'v4.aDec', 'v5.tune', 'v5.aDec2', 'm.eFb', 'm.rDecay', 'm.mdDrive', 'm.mHp'];
const KEEP = new Set(['algo', 'fType', 'nType', 'clkType', 'lDest', 'lDest2', 'lShape', 'nBurst', 'fxA', 'fxB', 'fxC', 'fxD', 'level', 'pan', 'sEcho', 'sRev', 'sDist', 'sRing', 'aDec2']);
const r4 = (x) => +x.toPrecision(5);

// name, genre, bpm, beat, energy, fills, kit spread, voice overrides, master overrides, sends [echo, rev] per voice
const DEFS = [
  ['zorlix vexum', 'techno', 132, 0, 0.6, 0.3, 0.15, {}, { swDepth: 0, dkAmt: 0.3, rDecay: 2.5, mdMix: 0.25, mdDrive: 0.3 }, [[0, 0], [0.2, 0.3], [0.3, 0.2], [0.15, 0.35], [0, 0.4], [0.1, 0.1]]],
  ['quanak floop', 'house', 124, 1, 0.5, 0.3, 0.12, { 3: { nBurst: 4, nSpace: 9, nDec: 260, fmLvl: 0.2, nType: 1, nCut: 1600 } }, { swType: 0, swDepth: 0.35, dkAmt: 0.2, rDecay: 1.8 }, [[0, 0], [0.1, 0.2], [0.2, 0.3], [0, 0.45], [0, 0.2], [0.15, 0.1]]],
  ['mibron saa', 'electro', 118, 0, 0.7, 0.4, 0.2, { 0: { pAmt: 36, aDec: 900, fDrive: 0.4 } }, { eDiv: 3, eFb: 0.5, mdType: 3, mdMix: 0.3 }, [[0, 0], [0.4, 0.1], [0.3, 0.1], [0.25, 0.2], [0, 0.2], [0.2, 0]]],
  ['krydok ixa', 'breaks', 136, 1, 0.65, 0.5, 0.18, { 3: { aDec: 260, nDec: 380 } }, { swType: 1, swDepth: 0.25, rDecay: 1.2, rEarly: 0.7 }, [[0, 0.05], [0.1, 0.2], [0.2, 0.2], [0.1, 0.3], [0, 0.3], [0, 0.1]]],
  ['oonsel trumph', 'dnb', 172, 0, 0.7, 0.5, 0.15, { 3: { tune: 230, nCut: 5200 } }, { rushEvery: 2, rushLen: 6, rushVoice: 3, rushRate: 4, dkAmt: 0.25 }, [[0, 0], [0.2, 0.3], [0.2, 0.2], [0.1, 0.3], [0, 0.35], [0.1, 0.05]]],
  ['flavi gaaro', 'hiphop', 90, 1, 0.45, 0.25, 0.2, { 0: { aDec: 900, tune: 44 }, 3: { nBurst: 3, nSpace: 12 } }, { swType: 2, swDepth: 0.55, mdType: 0, mdMix: 0.35, mdDrive: 0.45 }, [[0, 0.05], [0.1, 0.3], [0.15, 0.2], [0.05, 0.25], [0, 0.3], [0, 0.1]]],
  ['griek pazee', 'garage', 132, 0, 0.55, 0.3, 0.15, {}, { swType: 0, swDepth: 0.6, eDiv: 4, eFb: 0.35, dkAmt: 0.4, dkSpace: 0.8 }, [[0, 0], [0.25, 0.2], [0.2, 0.2], [0.2, 0.3], [0, 0.3], [0.1, 0.1]]],
  ['xutub lumek', 'minimal', 126, 1, 0.4, 0.2, 0.25, { 2: { fb: 0.6, rD: 4.1, lD: 0.4 } }, { eDiv: 7, eFb: 0.55, rDecay: 4, dkAmt: 0.35 }, [[0, 0], [0.3, 0.3], [0.4, 0.2], [0.1, 0.3], [0, 0.4], [0.2, 0.1]]],
  ['draron pekfo', 'techno', 140, 1, 0.8, 0.6, 0.3, { 0: { fDrive: 0.6, clk: 0.7 } }, { mdType: 1, mdMix: 0.35, mdDrive: 0.5, cThr: -18, cRatio: 4, rushEvery: 1, rushLen: 4, rushVoice: 5, rushRate: 6 }, [[0, 0], [0.2, 0.3], [0.3, 0.2], [0.2, 0.3], [0.1, 0.4], [0.2, 0.2]]],
  ['yelvi spuquo', 'electro', 110, 1, 0.5, 0.35, 0.22, { 1: { sRing: 0.4 }, 4: { tune: 520 } }, { rmHz: 210, rmLvl: 0.5, xa01: 0.25, xt01: 0, xa53: 0.3, xt53: 1, ePing: 1 }, [[0, 0], [0.3, 0.2], [0.2, 0.2], [0.2, 0.3], [0, 0.3], [0.15, 0.05]]],
];

const presets = DEFS.map(([name, genre, bpm, beat, energy, fills, spread, vo, mo, sends], n) => {
  const rng = new Rng(1000 + n * 77);
  const arr = kitToArray(INIT_KIT);
  const voices = [];
  for (let v = 0; v < 6; v++) {
    const o = {};
    for (const p of PARAMS) {
      let x = arr[v * NP + p.i];
      if (!KEEP.has(p.id) && p.curve !== 'int') {
        const span = p.id === 'tune' ? spread * 0.4 : spread;
        x = fromNorm(p, Math.min(1, Math.max(0, toNorm(p, x) + rng.bi() * span)));
      }
      o[p.id] = r4(x);
    }
    Object.assign(o, vo[v] || {});
    o.sEcho = sends[v][0];
    o.sRev = sends[v][1];
    voices.push(o);
  }
  const md = defaultMaster();
  const master = {};
  MPARAMS.forEach((p, i) => (master[p.id] = md[i]));
  Object.assign(master, { bpm }, mo);
  const g = generate({ genre, beat, energy, fills, accent: master.accent, len: 16, seed: n + 1 });
  const pat = [];
  for (let t = 0; t < 6; t++) {
    const row = [];
    for (let k = 0; k < MAX_STEPS; k++) { const i = t * MAX_STEPS + k; row.push(g.vel[i] ? g.vel[i] + g.flag[i] * 128 : 0); }
    while (row.length && !row[row.length - 1]) row.pop();
    pat.push(row);
  }
  const lanes = [];
  if (n % 2 === 0) lanes.push({ key: 'v5.aDec', steps: [0, 0.3, -0.2, 0.6, 0, 0.2, -0.3, 0.9, 0, 0.3, -0.2, 0.5, 0, 0.1, -0.4, 1], len: 16, slew: 0, speed: 0, depth: 0.4, groove: true });
  if (n % 3 === 0) lanes.push({ key: 'v3.nCut', steps: Array.from({ length: 16 }, (_, i) => Math.sin((i / 16) * Math.PI * 2)), len: 16, slew: 0.5, speed: 2, depth: 0.25, groove: true });
  return { v: 1, name, ts: 0, voices, master, pat, lanes, gen: { genre, beat, energy, fills, density: [1, 1, 1, 1, 1, 1], seed: n + 1 }, perf: PERF };
});
writeFileSync(new URL('../presets/factory.json', import.meta.url), JSON.stringify({ app: 'fm dm', v: 1, presets }, null, 0));
console.log(`presets/factory.json: ${presets.length} presets`);
