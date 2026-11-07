// fm/dm — effects. Echo, reverb (FDN), waveshaper, compressor.
// All buffers allocated in constructors.

import { softclip, OnePole, sinc } from './dsp.js';

// fractional read from a circular buffer
function readFrac(buf, mask, w, d) {
  let r = w - d;
  const ri = Math.floor(r);
  const fr = r - ri;
  const a = buf[ri & mask];
  const b = buf[(ri + 1) & mask];
  return a + (b - a) * fr;
}

export class Echo {
  constructor(sr) {
    this.sr = sr;
    let n = 1;
    while (n < sr * 4.2) n <<= 1;
    this.mask = n - 1;
    this.bL = new Float32Array(n);
    this.bR = new Float32Array(n);
    this.w = 0;
    this.d = sr * 0.3; // smoothed delay (samples)
    this.lpL = new OnePole();
    this.lpR = new OnePole();
    this.hpL = new OnePole();
    this.hpR = new OnePole();
    this.hpL.set(60, sr);
    this.hpR.set(60, sr);
    this.L = 0;
    this.R = 0;
  }
  // target delay in samples
  set(target, tone) {
    this.target = Math.min(target, this.mask - 4);
    this.lpL.set(tone, this.sr);
    this.lpR.set(tone, this.sr);
  }
  tick(inL, inR, fb, width, ping) {
    this.d += (this.target - this.d) * 0.0005;
    const yL = readFrac(this.bL, this.mask, this.w, this.d);
    const yR = readFrac(this.bR, this.mask, this.w, this.d);
    const fL = this.hpL.hp(this.lpL.lp(yL)) * fb;
    const fR = this.hpR.hp(this.lpR.lp(yR)) * fb;
    const w = this.w & this.mask;
    if (ping) {
      this.bL[w] = softclip((inL + inR) * 0.7 + fR);
      this.bR[w] = softclip(fL);
    } else {
      this.bL[w] = softclip(inL + fL);
      this.bR[w] = softclip(inR + fR);
    }
    this.w++;
    // width: 0 = mono, 1 = full stereo
    const m = (yL + yR) * 0.5;
    this.L = m + (yL - m) * width;
    this.R = m + (yR - m) * width;
  }
}

const FDN_LEN = [1031, 1327, 1523, 1801, 2053, 2311, 2633, 2953];
const ER_TAPS = [0.0043, 0.0071, 0.0113, 0.0157, 0.0199, 0.0241, 0.0293, 0.0347];
const ER_GAIN = [0.84, -0.71, 0.62, -0.55, 0.47, -0.41, 0.36, -0.3];

export class Reverb {
  constructor(sr) {
    this.sr = sr;
    const k = sr / 48000;
    this.len = new Int32Array(8);
    this.lines = [];
    this.pos = new Int32Array(8);
    this.damp = [];
    this.g = new Float32Array(8);
    this.y = new Float32Array(8);
    for (let i = 0; i < 8; i++) {
      this.len[i] = Math.round(FDN_LEN[i] * k);
      this.lines.push(new Float32Array(this.len[i]));
      this.damp.push(new OnePole());
    }
    let n = 1;
    while (n < sr * 0.35) n <<= 1;
    this.preMask = n - 1;
    this.pre = new Float32Array(n);
    this.pw = 0;
    this.preN = 0;
    this.erN = new Float32Array(8);
    this.hp = new OnePole();
    this.hp.set(80, sr);
    this.L = 0;
    this.R = 0;
  }
  set(preMs, decay, tone, early) {
    const sr = this.sr;
    this.preN = (preMs * sr) / 1000;
    for (let i = 0; i < 8; i++) {
      this.g[i] = Math.pow(10, (-3 * this.len[i]) / (decay * sr));
      this.damp[i].set(tone, sr);
      this.erN[i] = this.preN + ER_TAPS[i] * sr;
    }
    this.early = early;
  }
  tick(inL, inR) {
    const x = this.hp.hp((inL + inR) * 0.5);
    const pm = this.preMask;
    this.pre[this.pw & pm] = x;
    const xin = readFrac(this.pre, pm, this.pw, this.preN);
    // early reflections
    let eL = 0;
    let eR = 0;
    for (let i = 0; i < 8; i++) {
      const t = readFrac(this.pre, pm, this.pw, this.erN[i]) * ER_GAIN[i];
      if (i & 1) eR += t;
      else eL += t;
    }
    this.pw++;
    // FDN with Householder feedback matrix
    const y = this.y;
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      y[i] = this.lines[i][this.pos[i]];
      sum += y[i];
    }
    sum *= 0.25; // 2/N
    for (let i = 0; i < 8; i++) {
      const fb = (y[i] - sum) * this.g[i];
      const v = this.damp[i].lp(fb) + xin * (i & 1 ? -0.35 : 0.35);
      this.lines[i][this.pos[i]] = v;
      if (++this.pos[i] >= this.len[i]) this.pos[i] = 0;
    }
    const lateL = y[0] + y[2] + y[4] + y[6];
    const lateR = y[1] + y[3] + y[5] + y[7];
    const e = this.early * 0.6;
    this.L = lateL * 0.35 + eL * e;
    this.R = lateR * 0.35 + eR * e;
  }
}

// waveshaper types: 0 tube, 1 fold, 2 hard clip, 3 tape
export function shape(type, x, colour) {
  if (type === 0) {
    const b = colour * 0.3; // asymmetry
    return softclip(x + b) - softclip(b);
  }
  if (type === 1) return sinc(x * 0.25 * (1 + colour * 0.5));
  if (type === 2) {
    const c = 1 - Math.max(0, colour) * 0.5;
    return x > c ? c : x < -c ? -c : x;
  }
  // tape: soft knee, gentle
  const y = x / (1 + Math.abs(x) * (1 + colour * 0.5));
  return y * 1.4;
}

export class Distortion {
  constructor(sr) {
    this.sr = sr;
    this.toneL = new OnePole();
    this.toneR = new OnePole();
    this.preL = new OnePole();
    this.preR = new OnePole();
    this.preL.set(800, sr);
    this.preR.set(800, sr);
    this.dcL = new OnePole();
    this.dcR = new OnePole();
    this.dcL.set(15, sr);
    this.dcR.set(15, sr);
    this.L = 0;
    this.R = 0;
  }
  set(tone) {
    this.toneL.set(tone, this.sr);
    this.toneR.set(tone, this.sr);
  }
  // colour < 0 darker in, > 0 brighter in (tilt before the shaper)
  tick(inL, inR, type, drive, colour, mix, vol) {
    const g = 1 + drive * drive * 30;
    const tilt = colour * 0.8;
    const lL = this.preL.lp(inL);
    const lR = this.preR.lp(inR);
    const xL = inL + (inL - lL) * tilt - lL * tilt * 0.3;
    const xR = inR + (inR - lR) * tilt - lR * tilt * 0.3;
    let yL = shape(type, xL * g, colour) / Math.sqrt(g);
    let yR = shape(type, xR * g, colour) / Math.sqrt(g);
    yL = this.dcL.hp(this.toneL.lp(yL));
    yR = this.dcR.hp(this.toneR.lp(yR));
    this.L = (inL + (yL * 1.5 - inL) * mix) * vol;
    this.R = (inR + (yR * 1.5 - inR) * mix) * vol;
  }
}

export class Compressor {
  constructor(sr) {
    this.sr = sr;
    this.env = 0; // dB over threshold, smoothed gain reduction
    this.gr = 0; // gain reduction in dB (positive)
    this.L = 0;
    this.R = 0;
  }
  set(atkMs, relMs) {
    this.aC = Math.exp(-1000 / (atkMs * this.sr));
    this.rC = Math.exp(-1000 / (relMs * this.sr));
  }
  tick(inL, inR, thr, ratio, make, mix) {
    const pk = Math.max(Math.abs(inL), Math.abs(inR));
    const db = pk > 1e-6 ? 20 * Math.log10(pk) : -120;
    const over = db - thr;
    const want = over > 0 ? over * (1 - 1 / ratio) : 0;
    const c = want > this.gr ? this.aC : this.rC;
    this.gr = want + (this.gr - want) * c;
    const g = Math.pow(10, (make - this.gr) / 20);
    this.L = inL + (inL * g - inL) * mix;
    this.R = inR + (inR * g - inR) * mix;
  }
}
