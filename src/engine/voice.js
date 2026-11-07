// fm dm — one FM drum voice. 4 operators, pitch env, click, noise, filter,
// amp env, crush, LFO. Mono (retrigger chokes itself: closed hat chokes open).

import { P, NP } from './params.js';
import { sinc, softclip, Rng, decayCoef, Svf } from './dsp.js';

const V_CTRL = 16; // control-rate block
const lm = (d1, d2, d, l) => (d1 === d ? l : 0) + (d2 === d ? l : 0);

// algorithms: modulator bitmask per op [A,B,C,D] and carrier mask (bit0=A)
const ALG_MOD = [
  [0b0010, 0b0100, 0b1000, 0],
  [0b0010, 0b1100, 0, 0],
  [0b0010, 0, 0b1000, 0],
  [0b1110, 0, 0, 0],
  [0b1000, 0b1000, 0b1000, 0],
  [0b0110, 0, 0b1000, 0],
  [0, 0, 0b1000, 0],
  [0, 0, 0, 0],
];
const ALG_CAR = [0b0001, 0b0001, 0b0101, 0b0001, 0b0111, 0b0001, 0b0111, 0b1111];

export class Voice {
  constructor(sr, seed) {
    this.sr = sr;
    this.rng = new Rng(seed);
    this.ph = new Float64Array(4); // op phases (cycles)
    this.inc = new Float64Array(4);
    this.env = new Float32Array(4); // op env values
    this.atkInc = new Float32Array(4);
    this.decC = new Float32Array(4);
    this.stage = new Uint8Array(4); // 0 attack, 1 decay
    this.out = new Float32Array(4);
    this.fbz = 0;
    this.fbz2 = 0;
    this.filt = new Svf();
    this.nfilt = new Svf();
    this.lfoPh = 0;
    this.lfoVal = 0;
    this.lfoSH = 0;
    this.lPitch = this.lFm = this.lCut = this.lLvl = this.lPan = this.lNoise = this.lRatio = 0;
    this.velAmp = 1;
    this.fmIdx = 0;
    this.reset();
    // outputs for this block (post pan)
    this.L = 0;
    this.R = 0;
    this.mono = 0;
    this.meter = 0;
    // external modulation (crossfeed), set by engine each sample
    this.xFm = 0;
    this.xCut = 0;
    this.xRing = 0;
  }

  reset() {
    this.active = false;
    this.vel = 1;
    this.t = 0; // samples since trigger
    this.amp = 0;
    this.ampX = 0;
    this.ampStage = 3; // 0 atk 1 hold 2 dec 3 idle
    this.pEnv = 0;
    this.fEnv = 0;
    this.clkEnv = 0;
    this.nEnv = 0;
    this.nStage = 2;
    this.burst = 0;
    this.burstT = 0;
    this.crushHold = 0;
    this.crushN = 0;
    this.ctr = 0;
    this.filt.reset();
    this.nfilt.reset();
  }

  trigger(p, b, vel, alt) {
    const sr = this.sr;
    this.active = true;
    this.vel = vel;
    this.t = 0;
    for (let o = 0; o < 4; o++) {
      const base = P.rA + o * 5;
      this.ph[o] = 0;
      this.env[o] = 0;
      const atk = p[b + base + 2];
      this.atkInc[o] = atk <= 0.05 ? 2 : 1000 / (atk * sr);
      this.stage[o] = 0;
      this.decC[o] = decayCoef(p[b + base + 3], sr);
    }
    this.fbz = this.fbz2 = 0;
    // amp
    this.ampStartLvl = this.amp;
    this.ampStage = 0;
    this.ampX = 0;
    const aAtk = p[b + P.aAtk];
    this.ampAtkInc = aAtk <= 0.05 ? 2 : 1000 / (aAtk * sr);
    this.ampHoldN = (p[b + P.aHold] * sr) / 1000;
    const dec = alt ? p[b + P.aDec2] : p[b + P.aDec];
    this.ampDecInc = 1000 / (dec * sr);
    this.ampK = Math.pow(2, p[b + P.aCurve] * 4 - 1);
    // pitch, filter env, click
    this.pEnv = 1;
    this.pC = decayCoef(p[b + P.pDec], sr);
    this.fEnv = 1;
    this.fC = decayCoef(p[b + P.fEnvDec], sr);
    this.clkEnv = 1;
    this.clkC = decayCoef(p[b + P.clkDec], sr);
    this.clkPh = 0;
    // noise
    this.nStage = 0;
    this.nEnv = 0;
    const nAtk = p[b + P.nAtk];
    this.nAtkInc = nAtk <= 0.05 ? 2 : 1000 / (nAtk * sr);
    this.nC = decayCoef(p[b + P.nDec], sr);
    this.burst = 0;
    this.burstT = 0;
    this.nBursts = Math.round(p[b + P.nBurst]);
    this.burstN = (p[b + P.nSpace] * sr) / 1000;
    this.burstC = decayCoef(p[b + P.nSpace] * 0.8, sr);
    if (p[b + P.lRetrig] >= 0.5) this.lfoPh = 0;
    this.ctr = 0;
  }

  // control-rate update
  control(p, b) {
    const sr = this.sr;
    const dt = V_CTRL / sr;
    // lfo
    const rate = p[b + P.lRate];
    let ph = this.lfoPh + rate * dt;
    if (ph >= 1) {
      ph -= Math.floor(ph);
      this.lfoSH = this.rng.bi();
    }
    this.lfoPh = ph;
    const shape = p[b + P.lShape] | 0;
    let l;
    if (shape === 0) l = sinc(ph);
    else if (shape === 1) l = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    else if (shape === 2) l = 1 - 2 * ph;
    else if (shape === 3) l = ph < 0.5 ? 1 : -1;
    else l = this.lfoSH;
    l *= p[b + P.lDepth];
    this.lfoVal = l;
    const d1 = p[b + P.lDest] | 0;
    const d2 = p[b + P.lDest2] | 0;
    this.lPitch = lm(d1, d2, 1, l) * 12;
    this.lFm = lm(d1, d2, 2, l);
    this.lCut = lm(d1, d2, 3, l) * 4;
    this.lLvl = lm(d1, d2, 4, l);
    this.lPan = lm(d1, d2, 5, l);
    this.lNoise = lm(d1, d2, 6, l);
    this.lRatio = lm(d1, d2, 7, l);

    const vel = this.vel;
    // pitch
    const semis = this.pEnv * p[b + P.pAmt] * (1 - p[b + P.vPitch] * (1 - vel)) + this.lPitch;
    const f0 = p[b + P.tune] * Math.pow(2, semis / 12);
    const rmul = Math.pow(2, this.lRatio * 2);
    const car = ALG_CAR[p[b + P.algo] | 0];
    for (let o = 0; o < 4; o++) {
      const base = b + P.rA + o * 5;
      let f = p[base + 4] >= 0.5 ? p[base] * 1000 : p[base] * f0;
      if (!((car >> o) & 1)) f *= rmul;
      this.inc[o] = f / sr;
    }
    // filter
    const ft = p[b + P.fType] | 0;
    if (ft) {
      const oct = p[b + P.fEnv] * this.fEnv * 6 + this.lCut - p[b + P.vFilt] * (1 - vel) * 3 + this.xCut * 3;
      this.filt.set(p[b + P.fCut] * Math.pow(2, oct), p[b + P.fRes], sr);
    }
    this.nfilt.set(p[b + P.nCut], p[b + P.nRes], sr);
    // velocity scalars
    this.velAmp = 1 - p[b + P.vLvl] * (1 - vel);
    const fmv = p[b + P.fmLvl];
    this.fmIdx = fmv * fmv * 4 * (1 - p[b + P.vFm] * (1 - vel)) * (1 + this.lFm);
  }

  process(p, b) {
    if (!this.active) {
      this.L = this.R = this.mono = 0;
      return;
    }
    if (this.ctr === 0) this.control(p, b);
    this.ctr = (this.ctr + 1) % V_CTRL;

    // ---- operator envelopes
    const env = this.env;
    for (let o = 0; o < 4; o++) {
      if (this.stage[o] === 0) {
        env[o] += this.atkInc[o];
        if (env[o] >= 1) {
          env[o] = 1;
          this.stage[o] = 1;
        }
      } else env[o] *= this.decC[o];
    }

    // ---- FM operators, D down to A
    const algo = p[b + P.algo] | 0;
    const mods = ALG_MOD[algo];
    const car = ALG_CAR[algo];
    const out = this.out;
    const idx = this.fmIdx + this.xFm;
    let body = 0;
    let ncar = 0;
    for (let o = 3; o >= 0; o--) {
      let m = 0;
      const mask = mods[o];
      if (mask) {
        for (let j = o + 1; j < 4; j++) if ((mask >> j) & 1) m += out[j];
        m *= idx;
      }
      if (o === 3) m += (this.fbz + this.fbz2) * 0.5 * p[b + P.fb] * 1.2;
      let ph = this.ph[o] + this.inc[o];
      if (ph >= 1) ph -= 1;
      this.ph[o] = ph;
      const lvl = p[b + P.lA + o * 5];
      const y = sinc(ph + m) * env[o] * lvl;
      out[o] = y;
      if ((car >> o) & 1) {
        body += y;
        ncar++;
      }
    }
    this.fbz2 = this.fbz;
    this.fbz = out[3];
    if (ncar > 1) body *= 1 / Math.sqrt(ncar);

    // ---- amp env (applies to FM body)
    let a;
    if (this.ampStage === 0) {
      this.ampX += this.ampAtkInc;
      if (this.ampX >= 1) {
        this.ampX = 0;
        this.ampStage = this.ampHoldN > 0 ? 1 : 2;
        a = 1;
      } else a = this.ampStartLvl + (1 - this.ampStartLvl) * this.ampX;
    } else if (this.ampStage === 1) {
      a = 1;
      this.ampX += 1;
      if (this.ampX >= this.ampHoldN) {
        this.ampX = 0;
        this.ampStage = 2;
      }
    } else if (this.ampStage === 2) {
      this.ampX += this.ampDecInc;
      if (this.ampX >= 1) {
        this.ampStage = 3;
        a = 0;
      } else a = Math.pow(1 - this.ampX, this.ampK);
    } else a = 0;
    this.amp = a;
    body *= a;

    // ---- click
    let clk = 0;
    const ck = p[b + P.clk];
    if (ck > 0 && this.clkEnv > 1e-4) {
      const ct = p[b + P.clkType] | 0;
      if (ct === 0) clk = this.clkEnv;
      else if (ct === 1) clk = this.rng.bi() * this.clkEnv;
      else {
        this.clkPh += 3000 / this.sr;
        clk = sinc(this.clkPh) * this.clkEnv;
      }
      clk *= ck;
    }
    this.clkEnv *= this.clkC;

    // ---- noise
    let nz = 0;
    const nl = p[b + P.nLvl] * (1 + this.lNoise);
    if (this.nStage === 0) {
      this.nEnv += this.nAtkInc;
      if (this.nEnv >= 1) {
        this.nEnv = 1;
        this.nStage = 1;
      }
    } else if (this.nStage === 1) {
      // bursts: short decays retriggered every spacing, last burst uses full decay
      if (this.burst < this.nBursts - 1) {
        this.nEnv *= this.burstC;
        this.burstT += 1;
        if (this.burstT >= this.burstN) {
          this.burstT = 0;
          this.burst++;
          this.nEnv = 1;
        }
      } else this.nEnv *= this.nC;
    }
    if (nl > 0 && this.nEnv > 1e-5) {
      this.nfilt.tick(this.rng.bi());
      const nt = p[b + P.nType] | 0;
      nz = (nt === 0 ? this.nfilt.lp : nt === 1 ? this.nfilt.bp : this.nfilt.hp) * this.nEnv * nl;
    }

    // ---- sum, drive, filter
    let x = body + clk + nz;
    if (this.xRing !== 0) x *= 1 + this.xRing;
    const drv = p[b + P.fDrive];
    if (drv > 0) {
      const g = 1 + drv * 12;
      x = softclip(x * g) / Math.sqrt(g) * (1 + drv * 0.3);
    }
    const ft = p[b + P.fType] | 0;
    if (ft) {
      this.filt.tick(x);
      x = ft === 1 ? this.filt.lp : ft === 2 ? this.filt.bp * 1.5 : this.filt.hp;
    }

    // ---- crush
    const bits = p[b + P.bits];
    const div = p[b + P.srDiv];
    if (div > 1.01) {
      this.crushN += 1;
      if (this.crushN >= div) {
        this.crushN -= div;
        this.crushHold = x;
      }
      x = this.crushHold;
    }
    if (bits < 15.9) {
      const q = Math.pow(2, bits - 1);
      x = Math.round(x * q) / q;
    }

    // ---- level, pan
    const lv = p[b + P.level] * this.velAmp * (1 - Math.abs(this.lLvl) * 0.5 + this.lLvl * 0.5);
    x *= lv;
    this.mono = x;
    let pan = p[b + P.pan] + this.lPan;
    pan = pan < -1 ? -1 : pan > 1 ? 1 : pan;
    const pa = (pan + 1) * 0.125; // 0..0.25 cycles
    this.L = x * sinc(pa + 0.25);
    this.R = x * sinc(pa);
    const ax = x < 0 ? -x : x;
    this.meter = ax > this.meter ? ax : this.meter * 0.9995;

    // ---- envelopes advance
    this.pEnv *= this.pC;
    this.fEnv *= this.fC;
    this.t++;
    if (this.ampStage === 3 && this.nEnv < 1e-5 && this.clkEnv < 1e-4 && this.t > 64) {
      this.active = false;
      this.amp = 0;
    }
  }
}


