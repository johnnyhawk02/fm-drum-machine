// fm/dm — one FM drum voice. 4 operators, pitch env, click, noise, filter,
// amp env, crush, LFO. Mono (retrigger chokes itself: closed hat chokes open).

import { P, NP } from './params.js';
import { sinc, softclip, Rng, decayCoef, Svf, OnePole } from './dsp.js';

const V_CTRL = 16; // control-rate block
const FADE_N = 64; // retrigger fade, samples
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
    this.fade = 0;
    this.pendVel = 1;
    this.pendAlt = 0;
    this.incBase = new Float64Array(4);
    this.aa = new Float32Array(4).fill(1);
    this.wob = new OnePole();
    this.wobAmt = 0;
    this.hPitch = 1;
    this.hIdx = 1;
    this.driftInc = 0;
    this.trimG = 1;
    this.fixedMask = 0;
    this.pSemis = 0;
    this.burstGap = 0;
    this.reset();
    // outputs for this block (post pan)
    this.L = 0;
    this.R = 0;
    this.mono = 0;
    this.meter = 0;
    // external modulation (crossfeed), set by engine each sample
    this.xPm = 0;
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

  // A new hit on a sounding voice first fades the old note out over FADE_N samples (no click),
  // then starts. A silent voice starts at once.
  trigger(p, b, vel, alt) {
    if (this.active && (this.amp > 1e-3 || this.nEnv > 1e-3 || this.clkEnv > 1e-3)) {
      this.fade = FADE_N;
      this.pendVel = vel;
      this.pendAlt = alt;
      return;
    }
    this.start(p, b, vel, alt);
  }

  start(p, b, vel, alt) {
    const sr = this.sr;
    this.fade = 0;
    this.active = true;
    this.vel = vel;
    this.t = 0;
    const car0 = ALG_CAR[p[b + P.algo] | 0];
    const ninety = p[b + P.phase] >= 0.5;
    for (let o = 0; o < 4; o++) {
      const base = P.rA + o * 5;
      this.ph[o] = ninety ? ((car0 >> o) & 1 ? 0.25 : 0.5) : 0;
      this.env[o] = 0;
      const atk = p[b + base + 2];
      this.atkInc[o] = atk <= 0.05 ? 2 : 1000 / (atk * sr);
      this.stage[o] = 0;
      this.decC[o] = decayCoef(p[b + base + 3], sr);
    }
    this.fbz = this.fbz2 = 0;
    // amp
    this.ampStartLvl = 0;
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
    this.burstGap = (p[b + P.nSpace] * sr) / 1000;
    this.burstN = this.burstGap * (1 + this.rng.bi() * 0.12);
    this.burstC = decayCoef(p[b + P.nSpace] * 0.8, sr);
    if (p[b + P.lRetrig] >= 0.5) this.lfoPh = 0;
    // humanise: a fresh random pitch and index offset for each hit
    const hum = p[b + P.hum];
    this.hPitch = Math.pow(2, (this.rng.bi() * hum * 25) / 1200);
    this.hIdx = 1 + this.rng.bi() * hum * 0.2;
    this.wob.z = 0;
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
    // the pitch envelope itself runs per sample (see process); here the rest of the pitch
    this.pSemis = p[b + P.pAmt] * (1 - p[b + P.vPitch] * (1 - vel));
    const f0 = p[b + P.tune] * Math.pow(2, this.lPitch / 12);
    const rmul = Math.pow(2, this.lRatio * 2);
    const car = ALG_CAR[p[b + P.algo] | 0];
    let fixed = 0;
    for (let o = 0; o < 4; o++) {
      const base = b + P.rA + o * 5;
      const fx = p[base + 4] >= 0.5;
      let f = fx ? p[base] * 1000 : p[base] * f0;
      if (fx) fixed |= 1 << o;
      if (!((car >> o) & 1)) f *= rmul;
      this.incBase[o] = (fx ? f : f * this.hPitch) / sr;
    }
    this.driftInc = (p[b + P.drift] * 40) / sr;
    // fm noise: the wobble is low-passed at a few times the pitch, scaled to the operator's own frequency
    this.wobAmt = p[b + P.fmNoise] * 2;
    if (this.wobAmt > 0) this.wob.set(Math.min(9000, f0 * 8), sr);
    this.fixedMask = fixed;
    // FM index into each operator shrinks as that operator's pitch rises, so sidebands stay below
    // Nyquist (cheap anti-aliasing): 20 * (0.5 - f/sr)^4, capped at 1
    for (let o = 0; o < 4; o++) {
      const fr = this.incBase[o] * (this.fixedMask >> o & 1 ? 1 : Math.pow(2, (this.pEnv * this.pSemis) / 12));
      const q = 0.5 - (fr > 0.5 ? 0.5 : fr);
      const a = 20 * q * q * q * q;
      this.aa[o] = a > 1 ? 1 : a;
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
    this.trimG = Math.pow(10, p[b + P.trim] / 20);
    const fmv = p[b + P.fmLvl];
    this.fmIdx = fmv * fmv * 4 * (1 - p[b + P.vFm] * (1 - vel)) * (1 + this.lFm) * this.hIdx;
  }

  process(p, b) {
    if (!this.active) {
      this.L = this.R = this.mono = 0;
      return;
    }
    if (this.ctr === 0) this.control(p, b);
    this.ctr = (this.ctr + 1) % V_CTRL;

    // ---- pitch envelope, per sample
    const pm = this.pSemis !== 0 ? Math.pow(2, (this.pEnv * this.pSemis) / 12) : 1;
    for (let o = 0; o < 4; o++) this.inc[o] = (this.fixedMask >> o) & 1 ? this.incBase[o] : this.incBase[o] * pm;
    {
      const car = ALG_CAR[p[b + P.algo] | 0];
      let w = 0;
      if (this.wobAmt > 0) w = this.wob.lp(this.rng.bi()) * this.wobAmt * this.nEnv;
      if (w !== 0 || this.driftInc !== 0) {
        // carriers wobble less (a fifth as much), and less again when the FM index is high
        const cw = w * 0.2 * (1 - Math.min(0.5, this.fmIdx * 2.5));
        for (let o = 0; o < 4; o++) {
          if ((car >> o) & 1) this.inc[o] *= 1 + cw;
          else this.inc[o] = this.inc[o] * (1 + w) + this.driftInc;
        }
      }
    }

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
    const fmEnd = p[b + P.fmEnd];
    const out = this.out;
    const idx = this.fmIdx;
    let body = 0;
    let ncar = 0;
    for (let o = 3; o >= 0; o--) {
      let m = 0;
      const mask = mods[o];
      if (mask) {
        for (let j = o + 1; j < 4; j++) if ((mask >> j) & 1) m += out[j];
        m *= idx * this.aa[o];
      }
      // crossfeed: other voices' base oscillators phase-modulate the base operator A
      if (o === 0) m += this.xPm;
      if (o === 3) {
        // feedback follows D's own envelope, so the grit fades with the attack;
        // negative feedback uses the squared signal (asymmetric, rougher)
        const fb = p[b + P.fb];
        if (fb !== 0) {
          const z = (this.fbz + this.fbz2) * 0.5;
          m += (fb > 0 ? z : z * z * 2 - 0.5) * fb * 1.2 * env[3] * this.aa[3];
        }
      }
      let ph = this.ph[o] + this.inc[o];
      if (ph >= 1) ph -= 1;
      this.ph[o] = ph;
      const lvl = p[b + P.lA + o * 5];
      const e = (car >> o) & 1 ? env[o] : fmEnd + (1 - fmEnd) * env[o];
      const y = sinc(ph + m) * e * lvl;
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
          // uneven gaps: x1, then x1.4 for later bursts, each with a little jitter (an even buzz sounds fake)
          this.burstT = 0;
          this.burst++;
          this.nEnv = 0.8 + 0.2 * this.rng.uni();
          this.burstN = this.burstGap * 1.4 * (1 + this.rng.bi() * 0.12);
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
    const lv = p[b + P.level] * this.trimG * this.velAmp * (1 - Math.abs(this.lLvl) * 0.5 + this.lLvl * 0.5);
    x *= lv;
    if (this.fade > 0) x *= this.fade / FADE_N;
    this.mono = x;
    let pan = p[b + P.pan] + this.lPan;
    pan = pan < -1 ? -1 : pan > 1 ? 1 : pan;
    const pa = (pan + 1) * 0.125; // 0..0.25 cycles
    this.L = x * sinc(pa + 0.25);
    this.R = x * sinc(pa);
    const ax = x < 0 ? -x : x;
    this.meter = ax > this.meter ? ax : this.meter * 0.9995;

    // ---- retrigger fade done: start the new note
    if (this.fade > 0 && --this.fade === 0) {
      this.start(p, b, this.pendVel, this.pendAlt);
      return;
    }

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


