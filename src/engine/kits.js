// Elixir FM — starting kit. Each voice lists only the values that differ from
// the parameter defaults.

import { PARAMS, P, NUM_VOICES, NP } from './params.js';

export const INIT_KIT = [
  // kick: B>A with a quick index drop for the knock, big pitch sweep, click
  { algo: 2, tune: 48, rA: 1, lA: 1, dA: 2500, rB: 1, lB: 0.7, dB: 45, fmLvl: 0.55,
    pAmt: 30, pDec: 45, clk: 0.45, clkType: 0, clkDec: 1.2, aDec: 600, aCurve: 0.4,
    fType: 1, fCut: 7000, fRes: 0.05, level: 0.9, vFm: 0.5 },
  // drum 2: low perc / tom, three ops into A
  { algo: 3, tune: 105, lA: 1, dA: 1500, rB: 1.5, lB: 0.45, dB: 90, rC: 2, lC: 0.25, dC: 50,
    fmLvl: 0.5, pAmt: 12, pDec: 60, clk: 0.2, clkDec: 0.8, aDec: 420, level: 0.75, pan: -0.25 },
  // drum 3: wood / metal perc
  { algo: 3, tune: 230, lA: 1, dA: 1000, rB: 1.41, lB: 0.5, dB: 120, rC: 2.76, lC: 0.35, dC: 60,
    rD: 3.5, lD: 0.2, dD: 30, fb: 0.3, fmLvl: 0.55, pAmt: 7, pDec: 30, aDec: 300, level: 0.7, pan: 0.3 },
  // snare: FM body + band-passed noise
  { algo: 2, tune: 190, lA: 1, dA: 600, rB: 1.6, lB: 0.5, dB: 60, fmLvl: 0.5, pAmt: 10, pDec: 25,
    nLvl: 0.75, nType: 1, nCut: 4200, nRes: 0.25, nDec: 320, clk: 0.3, clkType: 1, clkDec: 2,
    aDec: 220, fType: 3, fCut: 140, level: 0.75 },
  // cymbal: inharmonic stack, high-passed, plus noise
  { algo: 1, tune: 700, rA: 1, lA: 1, dA: 6000, rB: 1.483, lB: 0.9, dB: 4000, rC: 1.932, lC: 0.8, dC: 3500,
    rD: 2.546, lD: 0.8, dD: 3000, fb: 0.25, fmLvl: 0.4, fType: 3, fCut: 3800, fRes: 0.15,
    nLvl: 0.3, nType: 1, nCut: 9000, nRes: 0.1, nDec: 1600, aDec: 2200, aCurve: 0.45, level: 0.45, pan: 0.2 },
  // hihat: metallic stack, closed / open decay (closed chokes open)
  { algo: 1, tune: 900, rA: 1, lA: 1, dA: 3000, rB: 1.48, lB: 0.9, dB: 2500, rC: 2.11, lC: 0.8, dC: 2000,
    rD: 3.07, lD: 0.7, dD: 2000, fb: 0.25, fmLvl: 0.4, fType: 3, fCut: 6000, fRes: 0.3,
    nLvl: 0.5, nType: 2, nCut: 7000, nDec: 70, aDec: 70, aDec2: 600, aCurve: 0.45, level: 0.5, pan: -0.2 },
];

// expand a kit (array of partial objects) into a flat Float32Array NUM_VOICES*NP
export function kitToArray(kit, out = new Float32Array(NUM_VOICES * NP)) {
  for (let v = 0; v < NUM_VOICES; v++) {
    for (const p of PARAMS) out[v * NP + p.i] = p.def;
    const k = kit[v] || {};
    for (const id in k) if (id in P) out[v * NP + P[id]] = k[id];
  }
  return out;
}

export function arrayToKit(arr) {
  const kit = [];
  for (let v = 0; v < NUM_VOICES; v++) {
    const o = {};
    for (const p of PARAMS) {
      const x = arr[v * NP + p.i];
      if (Math.abs(x - p.def) > 1e-6) o[p.id] = +x.toPrecision(5);
    }
    kit.push(o);
  }
  return kit;
}
