// fm/dm — step-sequencer lane shapes and random fills. Values -1..1.
import { Rng } from '../engine/dsp.js';

export const LANE_SHAPES = ['ramp up', 'ramp dn', 'tri', 'square', 'sine'];
export const LANE_RANDOMS = ['rnd', 'drunk', 'hold', 'sparse', 'smooth'];
// envelope mode: each step fires one of these over the step's length, scaled by the step's depth
export const ENV_SHAPES = ['perc', 'pluck', 'long', 'swell', 'rise', 'fall', 'tri', 'gate', 'bounce'];
export function envShape(k, t) {
  switch (k) {
    case 0: return t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) * 7); // perc
    case 1: return t < 0.01 ? t / 0.01 : Math.exp(-(t - 0.01) * 18); // pluck
    case 2: return t < 0.04 ? t / 0.04 : Math.exp(-(t - 0.04) * 2.5); // long
    case 3: return (Math.exp(4 * t) - 1) / 53.598; // swell (reverse exponential)
    case 4: return t; // rise
    case 5: return 1 - t; // fall
    case 6: return t < 0.5 ? t * 2 : 2 - t * 2; // tri
    case 7: return t < 0.02 ? t / 0.02 : t < 0.7 ? 1 : t < 0.74 ? (0.74 - t) / 0.04 : 0; // gate
    default: return t < 0.5 ? Math.exp(-t * 14) : 0.6 * Math.exp(-(t - 0.5) * 14); // bounce
  }
}
// random envelope steps: some steps fire, each with its own shape and depth
export function envRandom(len, steps, shapes, seed = Date.now()) {
  const r = new Rng(seed >>> 0);
  const dens = 0.3 + r.uni() * 0.4;
  const pal = Array.from({ length: 1 + (r.next() % 3) }, () => r.next() % ENV_SHAPES.length);
  const sign = r.uni() < 0.75 ? 1 : -1;
  for (let i = 0; i < len; i++) {
    const on = i === 0 || r.uni() < dens;
    steps[i] = on ? sign * (0.3 + r.uni() * 0.7) : 0;
    shapes[i] = pal[r.next() % pal.length];
  }
}

export function laneShape(kind, len, out) {
  for (let i = 0; i < len; i++) {
    const x = len > 1 ? i / (len - 1) : 0;
    const ph = i / len;
    let y;
    if (kind === 'ramp up') y = x * 2 - 1;
    else if (kind === 'ramp dn') y = 1 - x * 2;
    else if (kind === 'tri') y = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
    else if (kind === 'square') y = ph < 0.5 ? 1 : -1;
    else y = Math.sin(2 * Math.PI * ph);
    out[i] = y;
  }
  return out;
}

export function laneRandom(kind, len, out, seed = Date.now()) {
  const r = new Rng(seed >>> 0);
  let v = r.bi();
  for (let i = 0; i < len; i++) {
    if (kind === 'rnd') v = r.bi();
    else if (kind === 'drunk') v = Math.max(-1, Math.min(1, v + r.bi() * 0.35));
    else if (kind === 'hold') { if (i % 4 === 0) v = r.bi(); }
    else if (kind === 'sparse') v = r.uni() < 0.25 ? r.bi() : 0;
    out[i] = v;
  }
  if (kind === 'smooth') {
    // a few random points, cosine-interpolated
    const pts = Math.max(2, Math.round(len / 4));
    const a = Array.from({ length: pts + 1 }, () => r.bi());
    for (let i = 0; i < len; i++) {
      const f = (i / len) * pts, j = Math.floor(f), t = (1 - Math.cos((f - j) * Math.PI)) / 2;
      out[i] = a[j] + (a[j + 1] - a[j]) * t;
    }
  }
  return out;
}
