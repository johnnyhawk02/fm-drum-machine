// fm/dm — step-sequencer lane shapes and random fills. Values -1..1.
import { Rng } from '../engine/dsp.js';

export const LANE_SHAPES = ['ramp up', 'ramp dn', 'tri', 'square', 'sine'];
export const LANE_RANDOMS = ['rnd', 'drunk', 'hold', 'sparse', 'smooth'];

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
