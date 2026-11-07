// fm/dm — sample-accurate step sequencer, groove, rush and knob step
// sequencers ("lanes"). Wraps an Engine. No allocation in process().

import { NUM_VOICES, NP, PARAMS, MPARAMS, MP, M, RUSH_EVERY, SPEEDS } from '../engine/params.js';
import { Rng } from '../engine/dsp.js';

export const MAX_STEPS = 128; // 8 bars of 16ths
export const NUM_LANES = 32;
export const F_OPEN = 1; // hat step plays open
export const F_ACCENT = 2;

// flat spec tables over voice block (NUM_VOICES*NP) then master (MP)
const NV = NUM_VOICES * NP;
const SPEC_MIN = new Float32Array(NV + MP);
const SPEC_MAX = new Float32Array(NV + MP);
const SPEC_K = new Uint8Array(NV + MP); // 0 lin, 1 exp, 2 int
for (let v = 0; v < NUM_VOICES; v++)
  for (const p of PARAMS) {
    SPEC_MIN[v * NP + p.i] = p.min;
    SPEC_MAX[v * NP + p.i] = p.max;
    SPEC_K[v * NP + p.i] = p.curve === 'exp' ? 1 : p.curve === 'int' ? 2 : 0;
  }
for (const p of MPARAMS) {
  SPEC_MIN[NV + p.i] = p.min;
  SPEC_MAX[NV + p.i] = p.max;
  SPEC_K[NV + p.i] = p.curve === 'exp' ? 1 : p.curve === 'int' ? 2 : 0;
}
function norm(g, x) {
  const lo = SPEC_MIN[g];
  const hi = SPEC_MAX[g];
  return SPEC_K[g] === 1 ? Math.log(x / lo) / Math.log(hi / lo) : (x - lo) / (hi - lo);
}
function denorm(g, n) {
  n = n < 0 ? 0 : n > 1 ? 1 : n;
  const lo = SPEC_MIN[g];
  const hi = SPEC_MAX[g];
  if (SPEC_K[g] === 1) return lo * Math.pow(hi / lo, n);
  const x = lo + n * (hi - lo);
  return SPEC_K[g] === 2 ? Math.round(x) : x;
}

export class Sequencer {
  constructor(engine, seed = 1) {
    this.e = engine;
    this.sr = engine.sr;
    this.rng = new Rng(seed ^ 0x5bd1e995);
    // patterns
    this.vel = new Uint8Array(NUM_VOICES * MAX_STEPS);
    this.flag = new Uint8Array(NUM_VOICES * MAX_STEPS);
    // base (unmodulated) values; engine arrays hold the effective values
    this.base = new Float32Array(NV + MP);
    this.base.set(engine.params, 0);
    this.base.set(engine.master, NV);
    // lanes
    this.lTarget = new Int32Array(NUM_LANES).fill(-1); // flat index or -1
    this.lSteps = new Float32Array(NUM_LANES * MAX_STEPS);
    this.lLen = new Uint8Array(NUM_LANES).fill(16);
    this.lSlew = new Float32Array(NUM_LANES);
    this.lSpeed = new Uint8Array(NUM_LANES); // index into SPEEDS
    this.lDepth = new Float32Array(NUM_LANES).fill(0.5);
    this.lGroove = new Uint8Array(NUM_LANES).fill(1);
    this.lMode = new Uint8Array(NUM_LANES); // 0 slider steps, 1 envelope per step
    this.lShape = new Uint8Array(NUM_LANES * MAX_STEPS); // envelope shape per step
    this.lCur = new Float32Array(NUM_LANES); // smoothed step value -1..1
    this.lPos = new Int16Array(NUM_LANES); // current lane step
    this.lOut = new Float32Array(NUM_LANES); // applied offset (norm), for UI arcs
    this.speedN = Uint8Array.from(SPEEDS.map((s) => s[1]));
    // transport
    this.playing = false;
    this.clock = 0; // samples since play
    this.stepIdx = 0; // absolute 16th count
    this.nextStep = 0;
    this.nominal = 0;
    this.curStep = -1;
    this.bars = 0; // incremented at every bar start (worklet watches it)
    this.inRush = false;
    this.rushC = 0;
    this.ratT = new Float64Array(8);
    this.ratN = 0;
    this.ratI = 0;
    this.ratVel = 1;
    this.barOff = -1;
  }

  // ---- parameter access (g = flat index: voice v*NP+i, or NV+masterIndex)
  setFlat(g, x) {
    this.base[g] = x;
    if (g < NV) this.e.params[g] = x;
    else this.e.master[g - NV] = x;
  }
  getFlat(g) {
    return this.base[g];
  }

  stepLen() {
    return (this.sr * 60) / this.e.master[M.bpm] / 4;
  }

  start() {
    this.playing = true;
    this.clock = 0;
    this.stepIdx = 0;
    this.nominal = 0;
    this.nextStep = 0;
    this.ratN = this.ratI = 0;
    for (let l = 0; l < NUM_LANES; l++) this.lCur[l] = this.lSteps[l * MAX_STEPS];
  }
  stop() {
    this.playing = false;
    this.curStep = -1;
    this.endRush();
    // restore modulated targets to base
    for (let l = 0; l < NUM_LANES; l++) {
      const g = this.lTarget[l];
      if (g >= 0) this.setFlat(g, this.base[g]);
      this.lOut[l] = 0;
    }
  }

  swingOffset(k) {
    const m = this.e.master;
    const d = m[M.swDepth];
    if (d <= 0) return 0;
    const sl = this.stepLen();
    const t = m[M.swType] | 0;
    const q = k & 3;
    if (t === 0) return k & 1 ? d * 0.33 * sl : 0;
    if (t === 1) return q >= 2 ? d * 0.66 * sl : 0;
    if (t === 2) return k & 1 ? d * 0.5 * sl : 0;
    return this.rng.bi() * d * 0.15 * sl + d * 0.15 * sl;
  }

  endRush() {
    if (this.inRush) {
      this.inRush = false;
      this.e.master[M.mHp] = this.base[NV + M.mHp];
    }
  }

  fireStep() {
    const e = this.e;
    const m = e.master;
    const len = m[M.patLen] | 0 || 16;
    const k = this.stepIdx % len;
    this.curStep = k;
    if (this.stepIdx % 16 === 0) this.bars++;
    // rush window
    const every = RUSH_EVERY[m[M.rushEvery] | 0] | 0;
    let rush = false;
    if (every > 0) {
      const cyc = every * 16;
      const rl = m[M.rushLen] | 0;
      const pos = this.stepIdx % cyc;
      const ws = cyc - rl;
      if (pos >= ws) {
        rush = true;
        const ci = Math.min(15, Math.floor(((pos - ws) / rl) * 16));
        const c = m[M.rc0 + ci];
        this.rushC = c;
        this.inRush = true;
        m[M.mHp] = 20 * Math.pow(m[M.rushHp] / 20, c);
        const rv = m[M.rushVoice] | 0;
        const rate = 1 + Math.round(c * ((m[M.rushRate] | 0) - 1));
        const vel = 0.5 + 0.5 * c;
        e.trigger(rv, vel, 0);
        const sl = this.stepLen();
        this.ratN = 0;
        this.ratI = 0;
        for (let j = 1; j < rate && j < 8; j++) this.ratT[this.ratN++] = this.nextStep + (j * sl) / rate;
        this.ratVel = vel;
        this.ratVoice = rv;
      }
    }
    if (!rush) {
      this.endRush();
      const acc = m[M.accent];
      for (let v = 0; v < NUM_VOICES; v++) {
        const i = v * MAX_STEPS + k;
        const vl = this.vel[i];
        if (vl) {
          const f = this.flag[i];
          const vel = (vl / 127) * (f & F_ACCENT ? 1 : 1 - 0.4 * acc);
          e.trigger(v, vel, f & F_OPEN ? 1 : 0);
        }
      }
    }
    // schedule next step
    this.stepIdx++;
    this.nominal += this.stepLen();
    this.nextStep = this.nominal + this.swingOffset(this.stepIdx % 16);
    if (this.nextStep <= this.clock) this.nextStep = this.clock + 1;
  }

  updateLanes(dt) {
    const sl = this.stepLen();
    const straight = this.clock / sl; // 16ths, unswung
    for (let l = 0; l < NUM_LANES; l++) {
      const g = this.lTarget[l];
      if (g < 0) continue;
      const dur = this.speedN[this.lSpeed[l]];
      const len = this.lLen[l] || 1;
      let pos, tgt;
      if (this.lMode[l]) {
        // envelope: the step's shape runs over the step's length, scaled by its depth
        const f = straight / dur, k = Math.floor(f);
        pos = k % len;
        tgt = this.lSteps[l * MAX_STEPS + pos] * envShape(this.lShape[l * MAX_STEPS + pos], f - k);
      } else {
        const p16 = this.lGroove[l] ? Math.max(0, this.stepIdx - 1) : straight;
        pos = Math.floor(p16 / dur) % len;
        tgt = this.lSteps[l * MAX_STEPS + pos];
      }
      this.lPos[l] = pos;
      const slew = this.lSlew[l];
      if (slew <= 0.001) this.lCur[l] = tgt;
      else {
        const tau = slew * dur * sl * 0.35 + 1;
        this.lCur[l] += (tgt - this.lCur[l]) * (1 - Math.exp(-dt / tau));
      }
      const off = this.lCur[l] * this.lDepth[l];
      this.lOut[l] = off;
      const x = denorm(g, norm(g, this.base[g]) + off);
      if (g < NV) this.e.params[g] = x;
      else this.e.master[g - NV] = x;
    }
  }

  process(outL, outR, n) {
    let off = 0;
    this.barOff = -1; // sample offset in this block where a bar started, or -1
    while (off < n) {
      let chunk = n - off;
      if (chunk > 32) chunk = 32;
      if (this.playing) {
        let next = this.nextStep;
        if (this.ratI < this.ratN && this.ratT[this.ratI] < next) next = this.ratT[this.ratI];
        const until = Math.ceil(next - this.clock);
        if (until <= 0) {
          if (this.ratI < this.ratN && this.ratT[this.ratI] <= this.nextStep) {
            this.e.trigger(this.ratVoice, this.ratVel, 0);
            this.ratI++;
          } else {
            this.ratN = this.ratI = 0;
            if (this.stepIdx % 16 === 0 && this.barOff < 0) this.barOff = off;
            this.fireStep();
          }
          continue;
        }
        if (until < chunk) chunk = until;
        this.updateLanes(chunk);
      }
      this.e.process(outL, outR, chunk, off);
      off += chunk;
      if (this.playing) this.clock += chunk;
    }
  }
}

export { norm, denorm };
export { NV };
