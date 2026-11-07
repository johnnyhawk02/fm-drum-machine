// fm dm — pattern generator. Pure function of its options (seeded).
// Templates: one 16-step string per drum, digit = chance in tenths,
// 'o' = open hat (chance 0.9), '.' = 0.

import { Rng } from '../engine/dsp.js';
import { MAX_STEPS, F_OPEN, F_ACCENT } from './sequencer.js';

// tracks: kick, drum 2, drum 3, snare/clap, cymbal, hihat
export const GENRES = {
  techno: [
    ['9...9...9...9...', '..2...2...2..3..', '.....2....3....2', '....6.......6...', '9...............', '3.o.3.o.3.o.3.o3'],
    ['9...9...9...9.3.', '...3......3.....', '..3...3...3...3.', '....8.......8...', '5...............', '7.o77.o77.o77.o7'],
  ],
  house: [
    ['9...9...9...9...', '...3.......3..2.', '......3.......3.', '....9.......9...', '7...............', '..o...o...o...o.'],
    ['9...9...9...9...', '.2.....2.2......', '...3.......3....', '....9.......9..2', '5...............', '4.o.4.o.4.o.4.o4'],
  ],
  electro: [
    ['9......9..9.....', '.......3.....3..', '..3.......3.....', '....9.......9...', '5...............', '8686868686868686'],
    ['9.....9...9..3..', '...3.......3....', '.3....3.........', '....9.......9..3', '3...............', '9.9.9.9.9.9.9.9o'],
  ],
  breaks: [
    ['9.....9.9.3.....', '..........3.....', '.......3.......3', '....9.......9..3', '7...............', '9.8.9.8.9.8.9.8.'],
    ['9.9.......9..3..', '.....3.........3', '...3......3.....', '....9..3.3..9...', '5...............', '9.89.89.9.89.8o.'],
  ],
  dnb: [
    ['9.........9.....', '.......3.....3..', '..3.........3...', '....9.......9..2', '7...............', '9.8.9.8.9.8.9.8.'],
    ['9.........93....', '...3......3.....', '.....3.......3..', '....9..3....9...', '5...............', '8989898989898989'],
  ],
  hiphop: [
    ['9......9.39.....', '.........3......', '...3........3...', '....9.......9...', '3...............', '8.8.8.8.8.8.8.8.'],
    ['9.3....9..9.....', '.......3.......3', '..3.......3.....', '....9..2....9...', '3...............', '8.8.8.8o8.8.8.8.'],
  ],
  garage: [
    ['9.....9...9.....', '...3.......3....', '.......3.......3', '....9.......9...', '5...............', '..o.3.o...o.3.o.'],
    ['9........9..9...', '..3.......3.....', '.....3.......3..', '....9.......9..3', '3...............', '6.o.6.o.6.o.6.o6'],
  ],
  minimal: [
    ['9...9...9...9...', '......3.......3.', '.3.......3......', '............6...', '3...............', '..6...6...6...6.'],
    ['9...9...9...9...', '...2...2...2....', '.......3........', '....5.......5...', '3...............', '.3o..3o..3o..3o.'],
  ],
};
export const GENRE_NAMES = Object.keys(GENRES);

function chance(c) {
  if (c === '.') return 0;
  if (c === 'o') return 0.9;
  return (+c) / 9;
}

// opts: { genre, beat, energy 0..1, fills 0..1, accent 0..1, density[6] 0..2, len, seed }
export function generate(opts, out) {
  const o = Object.assign({ genre: 'techno', beat: 0, energy: 0.5, fills: 0.3, accent: 0.5, len: 16, seed: 1 }, opts);
  const dens = o.density || [1, 1, 1, 1, 1, 1];
  const vel = out ? out.vel : new Uint8Array(6 * MAX_STEPS);
  const flag = out ? out.flag : new Uint8Array(6 * MAX_STEPS);
  vel.fill(0);
  flag.fill(0);
  const variants = GENRES[o.genre] || GENRES.techno;
  const rng = new Rng((o.seed * 2654435761 + o.beat * 40503 + 17) >>> 0);
  const tpl = variants[o.beat % variants.length];
  const alt = variants[(o.beat + 1) % variants.length];
  const len = Math.max(1, Math.min(MAX_STEPS, o.len | 0));
  const e = o.energy;
  for (let t = 0; t < 6; t++) {
    for (let k = 0; k < len; k++) {
      const s = k & 15;
      // mostly the main template, sometimes borrow from the other variant
      const src = rng.uni() < 0.15 + 0.15 * e ? alt : tpl;
      const ch = src[t][s];
      let p = chance(ch);
      const strong = p >= 0.99;
      // energy: busier and more ghost notes; strong hits stay
      if (!strong) p *= 0.5 + e;
      if (p === 0 && (t === 1 || t === 2 || t === 5)) p = e * e * 0.18;
      p *= dens[t];
      // cymbal only on the first bar of a phrase unless dense
      if (t === 4 && k >= 16 && dens[t] <= 1) p *= 0.3;
      if (rng.uni() < p) {
        const onBeat = (s & 3) === 0;
        let v = (onBeat ? 112 : 92) + Math.round(rng.bi() * 14) - (p < 0.3 ? 25 : 0);
        v = Math.max(20, Math.min(127, v));
        const i = t * MAX_STEPS + k;
        vel[i] = v;
        if (ch === 'o' && t === 5) flag[i] |= F_OPEN;
        if ((onBeat && rng.uni() < o.accent) || rng.uni() < o.accent * 0.15) flag[i] |= F_ACCENT;
      }
    }
  }
  // fills: last 4 steps of the pattern (or of the last bar for long patterns)
  if (o.fills > 0) {
    const fl = len >= 16 ? 4 + Math.round(o.fills * 4) : 2;
    for (let k = Math.max(0, len - fl); k < len; k++) {
      const frac = (k - (len - fl)) / fl;
      for (const t of [3, 1, 2]) {
        if (rng.uni() < o.fills * (0.35 + 0.5 * frac) * (t === 3 ? 1 : 0.6)) {
          const i = t * MAX_STEPS + k;
          vel[i] = Math.min(127, 70 + Math.round(frac * 50 + rng.bi() * 10));
          if (frac > 0.6) flag[i] |= F_ACCENT;
        }
      }
      // thin the hats under the fill
      if (rng.uni() < o.fills * 0.5) vel[5 * MAX_STEPS + k] = 0;
    }
  }
  return { vel, flag, len };
}
