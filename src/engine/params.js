// Elixir FM — voice parameter spec.
// Every voice uses the same flat block of NP parameters, stored as real values
// (Hz, ms, 0..1 amounts). The UI maps knob position 0..1 <-> value via `curve`.
// Layout is fixed so the block ports 1:1 to a C++ struct / float array.

export const NUM_VOICES = 6;
export const VOICE_NAMES = ['kick', 'drum 2', 'drum 3', 'snare', 'cymbal', 'hihat'];

// curve: 'lin' | 'exp' (min must be > 0) | 'int' (stepped) | 'bip' (bipolar lin)
// [id, min, max, default, curve, label]
const SPEC = [
  // ---- tone / fm
  ['algo', 0, 7, 0, 'int', 'algo'],
  ['tune', 20, 8000, 55, 'exp', 'tune'],
  ['fmLvl', 0, 1, 0.8, 'lin', 'fm lvl'],
  ['fb', 0, 1, 0, 'lin', 'fdbk'],
  // operator A..D: ratio, level, attack, decay, curve, fixed
  ...['A', 'B', 'C', 'D'].flatMap((o) => [
    [`r${o}`, 0.125, 16, 1, 'exp', `ratio ${o}`],
    [`l${o}`, 0, 1, o === 'A' ? 1 : 0, 'lin', `level ${o}`],
    [`a${o}`, 0, 200, 0, 'lin', `atk ${o}`],
    [`d${o}`, 1, 4000, 200, 'exp', `dec ${o}`],
    [`fx${o}`, 0, 1, 0, 'int', `fixed ${o}`],
  ]),
  // pitch envelope
  ['pAmt', 0, 48, 0, 'lin', 'p amt'],
  ['pDec', 1, 1000, 40, 'exp', 'p dec'],
  // click / transient
  ['clk', 0, 1, 0, 'lin', 'click'],
  ['clkType', 0, 2, 0, 'int', 'clk typ'],
  ['clkDec', 0.1, 30, 2, 'exp', 'clk dec'],
  // noise
  ['nLvl', 0, 1, 0, 'lin', 'noise'],
  ['nType', 0, 2, 2, 'int', 'n flt'],
  ['nCut', 40, 18000, 6000, 'exp', 'n cut'],
  ['nRes', 0, 1, 0.2, 'lin', 'n res'],
  ['nAtk', 0, 100, 0, 'lin', 'n atk'],
  ['nDec', 1, 3000, 150, 'exp', 'n dec'],
  ['nBurst', 1, 8, 1, 'int', 'bursts'],
  ['nSpace', 1, 40, 10, 'lin', 'spacing'],
  // main filter
  ['fType', 0, 3, 0, 'int', 'flt'], // 0 off, 1 lp, 2 bp, 3 hp
  ['fCut', 20, 20000, 12000, 'exp', 'cutoff'],
  ['fRes', 0, 1, 0.1, 'lin', 'reso'],
  ['fDrive', 0, 1, 0, 'lin', 'drive'],
  ['fEnv', -1, 1, 0, 'bip', 'f env'],
  ['fEnvDec', 1, 2000, 100, 'exp', 'f dec'],
  // amp
  ['aAtk', 0, 100, 0, 'lin', 'attack'],
  ['aHold', 0, 500, 0, 'lin', 'hold'],
  ['aDec', 5, 6000, 300, 'exp', 'decay'],
  ['aCurve', 0, 1, 0.5, 'lin', 'curve'],
  ['aDec2', 5, 6000, 600, 'exp', 'open dec'], // hihat open decay
  ['level', 0, 1, 0.8, 'lin', 'level'],
  ['pan', -1, 1, 0, 'bip', 'pan'],
  // crush
  ['bits', 1, 16, 16, 'lin', 'bits'],
  ['srDiv', 1, 64, 1, 'exp', 'rate'],
  // lfo
  ['lShape', 0, 4, 0, 'int', 'lfo shp'],
  ['lRate', 0.05, 40, 2, 'exp', 'lfo rate'],
  ['lDepth', 0, 1, 0, 'lin', 'lfo amt'],
  ['lDest', 0, 7, 0, 'int', 'lfo dst'],
  ['lDest2', 0, 7, 0, 'int', 'lfo dst2'],
  ['lRetrig', 0, 1, 1, 'int', 'retrig'],
  // velocity
  ['vLvl', 0, 1, 0.6, 'lin', 'v lvl'],
  ['vPitch', 0, 1, 0, 'lin', 'v pitch'],
  ['vFm', 0, 1, 0.3, 'lin', 'v fm'],
  ['vFilt', 0, 1, 0, 'lin', 'v flt'],
  // sends
  ['sEcho', 0, 1, 0, 'lin', 'echo'],
  ['sRev', 0, 1, 0, 'lin', 'reverb'],
  ['sDist', 0, 1, 0, 'lin', 'dist'],
  ['sRing', 0, 1, 0, 'lin', 'ring'],
];

export const LFO_DESTS = ['off', 'pitch', 'fm', 'cutoff', 'level', 'pan', 'noise', 'ratio'];
export const LFO_SHAPES = ['sine', 'tri', 'saw', 'square', 's&h'];
export const ALGOS = ['D>C>B>A', 'C+D>B>A', 'D>C B>A', 'B+C+D>A', 'D>ABC', 'D>C>A B>A', 'D>C A B', 'A B C D'];
export const FILTER_TYPES = ['off', 'lp', 'bp', 'hp'];
export const NOISE_TYPES = ['lp', 'bp', 'hp'];
export const CLICK_TYPES = ['pulse', 'tick', 'blip'];

export const PARAMS = SPEC.map(([id, min, max, def, curve, label], i) => ({ id, i, min, max, def, curve, label }));
export const NP = PARAMS.length;
export const P = Object.fromEntries(PARAMS.map((p) => [p.id, p.i]));

export function toNorm(p, v) {
  if (p.curve === 'exp') return Math.log(v / p.min) / Math.log(p.max / p.min);
  return (v - p.min) / (p.max - p.min);
}
export function fromNorm(p, n) {
  n = n < 0 ? 0 : n > 1 ? 1 : n;
  if (p.curve === 'exp') return p.min * Math.pow(p.max / p.min, n);
  const v = p.min + n * (p.max - p.min);
  return p.curve === 'int' ? Math.round(v) : v;
}

export function defaultVoice() {
  return PARAMS.map((p) => p.def);
}
