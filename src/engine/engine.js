// fm dm — top-level engine: six voices, crossfeed, sends, FX, master chain.
// process() allocates nothing. Parameters live in two flat Float32Arrays:
//   params  NUM_VOICES * NP  (voice blocks)
//   master  MP               (fx, mixer, crossfeed)

import { NUM_VOICES, NP, P, M, MP, ECHO_DIVS, defaultMaster } from './params.js';
import { Voice } from './voice.js';
import { kitToArray, INIT_KIT } from './kits.js';
import { Echo, Reverb, Distortion, Compressor } from './fx.js';
import { Svf, OnePole, sinc, softclip } from './dsp.js';

const E_CTRL = 32;

export class Engine {
  constructor(sr = 48000, seed = 1) {
    this.sr = sr;
    this.params = kitToArray(INIT_KIT);
    this.master = Float32Array.from(defaultMaster());
    this.voices = [];
    for (let v = 0; v < NUM_VOICES; v++) this.voices.push(new Voice(sr, (seed * 7919 + v * 104729) >>> 0));
    this.echo = new Echo(sr);
    this.reverb = new Reverb(sr);
    this.sendDist = new Distortion(sr);
    this.mdist = new Distortion(sr);
    this.comp = new Compressor(sr);
    this.hpL = new Svf();
    this.hpR = new Svf();
    this.ringPh = 0;
    this.duck = 0;
    this.ctr = 0;
    this.prevMono = new Float32Array(NUM_VOICES);
    this.peakL = 0;
    this.peakR = 0;
    this.gr = 0;
    this.anySolo = false;
  }

  setParam(v, i, x) {
    this.params[v * NP + i] = x;
  }
  setMaster(i, x) {
    this.master[i] = x;
  }

  // vel 0..1, alt=1 for open hat. Mutes act on notes, so tails ring on.
  trigger(v, vel = 1, alt = 0) {
    if (this.master[M.mute0 + v * 4] >= 0.5) return;
    this.voices[v].trigger(this.params, v * NP, vel, alt);
    if (v === 0) this.duck = 1;
  }

  control() {
    const m = this.master;
    const sr = this.sr;
    const beat = 60 / m[M.bpm];
    let dSec = m[M.eSync] >= 0.5 ? ECHO_DIVS[m[M.eDiv] | 0][1] * beat : m[M.eMs] / 1000;
    dSec *= 1 + m[M.eFine] * 0.01;
    this.echo.set(dSec * sr, m[M.eTone]);
    this.reverb.set(m[M.rPre], m[M.rDecay], m[M.rTone], m[M.rEarly]);
    this.sendDist.set(m[M.sdTone]);
    this.mdist.set(m[M.mdTone]);
    this.comp.set(m[M.cAtk], m[M.cRel]);
    const hp = m[M.mHp];
    this.hpOn = hp > 21;
    if (this.hpOn) {
      this.hpL.set(hp, 0.1, sr);
      this.hpR.set(hp, 0.1, sr);
    }
    this.duckC = Math.exp(-6.9 / ((m[M.dkRel] * sr) / 1000));
    let s = false;
    for (let v = 0; v < NUM_VOICES; v++) if (m[M.solo0 + v * 4] >= 0.5) s = true;
    this.anySolo = s;
  }

  // render n samples into outL/outR starting at offset
  process(outL, outR, n, off = 0) {
    const p = this.params;
    const m = this.master;
    const vs = this.voices;
    const pm = this.prevMono;
    for (let s = 0; s < n; s++) {
      if (this.ctr === 0) this.control();
      this.ctr = (this.ctr + 1) % E_CTRL;

      // crossfeed from previous sample's voice outputs
      for (let d = 0; d < NUM_VOICES; d++) {
        let xf = 0;
        let xc = 0;
        let xr = 0;
        for (let src = 0; src < NUM_VOICES; src++) {
          const k = M.xa00 + (src * NUM_VOICES + d) * 2;
          const a = m[k];
          if (a > 0) {
            const t = m[k + 1] | 0;
            const x = pm[src] * a;
            if (t === 0) xf += x;
            else if (t === 1) xc += x;
            else xr += x;
          }
        }
        const vo = vs[d];
        vo.xFm = xf * 2;
        vo.xCut = xc * 2;
        vo.xRing = xr * 2;
      }

      const duckE = this.duck;
      this.duck *= this.duckC;
      const dAmt = m[M.dkAmt];
      const gDry = 1 - dAmt * duckE;
      const gFx = 1 - dAmt * m[M.dkSpace] * duckE;

      let l = 0;
      let r = 0;
      let eL = 0;
      let eR = 0;
      let rL = 0;
      let rR = 0;
      let dL = 0;
      let dR = 0;
      let ring = 0;
      for (let v = 0; v < NUM_VOICES; v++) {
        const vo = vs[v];
        const b = v * NP;
        vo.process(p, b);
        pm[v] = vo.mono;
        if (!vo.active && vo.L === 0) continue;
        if (this.anySolo && m[M.solo0 + v * 4] < 0.5) continue;
        const g = v === 0 ? 1 : gDry;
        const vl = vo.L;
        const vr = vo.R;
        l += vl * g;
        r += vr * g;
        if (m[M.eMute0 + v * 4] < 0.5) {
          const se = p[b + P.sEcho];
          eL += vl * se;
          eR += vr * se;
        }
        if (m[M.rMute0 + v * 4] < 0.5) {
          const sv = p[b + P.sRev];
          rL += vl * sv;
          rR += vr * sv;
        }
        const sd = p[b + P.sDist];
        dL += vl * sd;
        dR += vr * sd;
        ring += vo.mono * p[b + P.sRing];
      }

      // echo feeds a little into the reverb
      this.echo.tick(eL, eR, m[M.eFb], m[M.eWidth], m[M.ePing] >= 0.5);
      const echoL = this.echo.L * m[M.eLvl];
      const echoR = this.echo.R * m[M.eLvl];
      this.reverb.tick(rL + echoL * 0.2, rR + echoR * 0.2);
      this.sendDist.tick(dL, dR, 0, m[M.sdDrive], 0.2, 1, 1);
      this.ringPh += m[M.rmHz] / this.sr;
      if (this.ringPh >= 1) this.ringPh -= 1;
      const rm = ring * sinc(this.ringPh) * m[M.rmLvl];

      l += (echoL + this.reverb.L * m[M.rLvl] + this.sendDist.L * m[M.sdLvl] + rm) * gFx;
      r += (echoR + this.reverb.R * m[M.rLvl] + this.sendDist.R * m[M.sdLvl] + rm) * gFx;

      // master: hp, distortion, compressor, volume, safety clip
      if (this.hpOn) {
        this.hpL.tick(l);
        this.hpR.tick(r);
        l = this.hpL.hp;
        r = this.hpR.hp;
      }
      if (m[M.mdMix] > 0 || m[M.mdVol] !== 1) {
        this.mdist.tick(l, r, m[M.mdType] | 0, m[M.mdDrive], m[M.mdColour], m[M.mdMix], m[M.mdVol]);
        l = this.mdist.L;
        r = this.mdist.R;
      }
      this.comp.tick(l, r, m[M.cThr], m[M.cRatio], m[M.cMake], m[M.cMix]);
      const mv = m[M.mVol];
      l = this.comp.L * mv;
      r = this.comp.R * mv;
      // gentle safety: transparent below ~0.9
      if (l > 0.9 || l < -0.9) l = Math.sign(l) * (0.9 + 0.1 * softclip((Math.abs(l) - 0.9) * 10));
      if (r > 0.9 || r < -0.9) r = Math.sign(r) * (0.9 + 0.1 * softclip((Math.abs(r) - 0.9) * 10));
      outL[off + s] = l;
      outR[off + s] = r;
      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      this.peakL = al > this.peakL ? al : this.peakL * 0.9998;
      this.peakR = ar > this.peakR ? ar : this.peakR * 0.9998;
    }
    this.gr = this.comp.gr;
  }
}


