// Node test: sequencer timing, genres, lanes, rush.
import { Engine } from '../src/engine/engine.js';
import { Sequencer, MAX_STEPS } from '../src/seq/sequencer.js';
import { generate, GENRE_NAMES } from '../src/seq/patterngen.js';
import { laneShape } from '../src/seq/modseq.js';
import { M, NP, P, NUM_VOICES } from '../src/engine/params.js';
import { writeWav } from './wav.mjs';
const SR = 48000, outDir = process.argv[2];
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail++; };

function run(genre, setup, bars = 4) {
  const e = new Engine(SR, 1), s = new Sequencer(e, 1);
  const g = generate({ genre, beat: 0, seed: 3, energy: 0.6, fills: 0.5 });
  s.vel.set(g.vel); s.flag.set(g.flag);
  setup && setup(s, e);
  // count kick triggers by wrapping trigger
  const hits = new Array(6).fill(0), times = [];
  const trig = e.trigger.bind(e);
  e.trigger = (v, vel, alt) => { hits[v]++; if (v === 0) times.push(s.clock); trig(v, vel, alt); };
  const n = Math.round(SR * 60 / e.master[M.bpm] * 4 * bars), L = new Float32Array(n), R = new Float32Array(n);
  s.start();
  for (let i = 0; i < n; i += 128) s.process(L.subarray(i, i + 128), R.subarray(i, i + 128), Math.min(128, n - i));
  return { L, R, hits, times, s, e, g };
}
const peak = (L) => L.reduce((a, x) => Math.max(a, Math.abs(x)), 0);

for (const genre of GENRE_NAMES) {
  const r = run(genre);
  const pk = peak(r.L);
  check(pk > 0.1 && pk < 0.95 && r.hits[0] > 0, `${genre.padEnd(8)} peak ${pk.toFixed(2)} hits ${r.hits.join(',')}`);
  if (outDir) writeWav(`${outDir}/seq-${genre}.wav`, r.L, r.R, SR);
}
// timing: four-on-the-floor kick lands exactly on 16th grid (techno, no swing)
{
  const r = run('techno', (s) => { s.vel.fill(0); for (let k = 0; k < 16; k += 4) s.vel[k] = 100; });
  const sl = SR * 60 / 120 / 4;
  const err = Math.max(...r.times.map((t, i) => Math.abs(t - i * 4 * sl)));
  check(r.times.length === 16 && err <= 1, `timing: ${r.times.length} kicks, max error ${err.toFixed(2)} samples`);
}
// swing moves odd steps late
{
  const r = run('techno', (s, e) => { s.vel.fill(0); s.vel[1] = 100; e.master[M.swDepth] = 1; s.setFlat(NUM_VOICES * NP + M.swDepth, 1); }, 1);
  const sl = SR * 60 / 120 / 4;
  check(Math.abs(r.times[0] - sl * 1.33) < 2, `swing: step 2 at ${(r.times[0] / sl).toFixed(2)} steps`);
}
// lane: ramp on kick tune changes the effective param, base untouched
{
  let seen = new Set();
  const r = run('techno', (s, e) => {
    s.lTarget[0] = 0 * NP + P.tune; s.lLen[0] = 16; s.lDepth[0] = 0.3; laneShape('ramp up', 16, s.lSteps.subarray(0, 16));
    const proc = e.process.bind(e); e.process = (...a) => { seen.add(Math.round(e.params[P.tune])); proc(...a); };
  }, 1);
  check(seen.size >= 8 && Math.abs(r.s.base[P.tune] - 48) < 1e-3, `lane: kick tune took ${seen.size} values, base kept`);
}
// rush: last 4 steps every bar, snare rolls, hp rises, others drop
{
  const r = run('techno', (s, e) => { for (const [k, x] of [['rushEvery', 1], ['rushLen', 4], ['rushVoice', 3], ['rushRate', 4]]) s.setFlat(NUM_VOICES * NP + M[k], x); }, 2);
  check(r.hits[3] >= 18 && r.hits[0] < 8, `rush: snare hits ${r.hits[3]}, kick ${r.hits[0]}`);
  if (outDir) writeWav(`${outDir}/seq-rush.wav`, r.L, r.R, SR);
}
process.exit(fail ? 1 : 0);
