// fm dm — voice parameter spec.
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

// ---- master / fx block (one flat array, MP entries)
export const ECHO_DIVS = [
  ['1/32', 0.125], ['1/16t', 1 / 6], ['1/16', 0.25], ['1/8t', 1 / 3], ['1/16d', 0.375], ['1/8', 0.5],
  ['1/4t', 2 / 3], ['1/8d', 0.75], ['1/4', 1], ['1/2t', 4 / 3], ['1/4d', 1.5], ['1/2', 2], ['1 bar', 4],
]; // in beats
export const DIST_TYPES = ['tube', 'fold', 'clip', 'tape'];

const MSPEC = [
  ['bpm', 40, 240, 120, 'lin', 'bpm'],
  // echo
  ['eSync', 0, 1, 1, 'int', 'sync'],
  ['eDiv', 0, 12, 7, 'int', 'time'],
  ['eMs', 1, 2000, 300, 'exp', 'free ms'],
  ['eFine', -1, 1, 0, 'bip', 'fine %'],
  ['eTone', 200, 16000, 4000, 'exp', 'tone'],
  ['eFb', 0, 0.95, 0.4, 'lin', 'fdbk'],
  ['eWidth', 0, 1, 0.7, 'lin', 'width'],
  ['ePing', 0, 1, 1, 'int', 'ping'],
  ['eLvl', 0, 1, 0.7, 'lin', 'return'],
  // reverb
  ['rPre', 0, 250, 15, 'lin', 'pre'],
  ['rDecay', 0.2, 20, 2.2, 'exp', 'decay'],
  ['rTone', 500, 16000, 6000, 'exp', 'tone'],
  ['rEarly', 0, 1, 0.4, 'lin', 'early'],
  ['rLvl', 0, 1, 0.6, 'lin', 'return'],
  // distortion send bus
  ['sdDrive', 0, 1, 0.5, 'lin', 'drive'],
  ['sdTone', 200, 16000, 6000, 'exp', 'tone'],
  ['sdLvl', 0, 1, 0.6, 'lin', 'return'],
  // ring send bus
  ['rmHz', 20, 4000, 330, 'exp', 'ring hz'],
  ['rmLvl', 0, 1, 0.6, 'lin', 'return'],
  // sidechain duck from kick
  ['dkAmt', 0, 1, 0, 'lin', 'duck'],
  ['dkRel', 10, 1000, 180, 'exp', 'release'],
  ['dkSpace', 0, 1, 0.5, 'lin', 'space'],
  // master high-pass (rush rises it)
  ['mHp', 20, 2000, 20, 'exp', 'hp'],
  // master distortion
  ['mdType', 0, 3, 0, 'int', 'type'],
  ['mdDrive', 0, 1, 0.2, 'lin', 'drive'],
  ['mdColour', -1, 1, 0, 'bip', 'colour'],
  ['mdTone', 500, 20000, 16000, 'exp', 'tone'],
  ['mdMix', 0, 1, 0, 'lin', 'mix'],
  ['mdVol', 0, 2, 1, 'lin', 'volume'],
  // compressor
  ['cThr', -40, 0, -12, 'lin', 'thresh'],
  ['cRatio', 1, 20, 3, 'exp', 'ratio'],
  ['cAtk', 0.1, 100, 5, 'exp', 'attack'],
  ['cRel', 10, 1000, 120, 'exp', 'release'],
  ['cMake', 0, 24, 2, 'lin', 'makeup'],
  ['cMix', 0, 1, 1, 'lin', 'mix'],
  ['mVol', 0, 1.5, 0.6, 'lin', 'master'],
  // mixer: per voice mute/solo and send mutes
  ...[0, 1, 2, 3, 4, 5].flatMap((v) => [
    [`mute${v}`, 0, 1, 0, 'int', `mute ${v + 1}`],
    [`solo${v}`, 0, 1, 0, 'int', `solo ${v + 1}`],
    [`eMute${v}`, 0, 1, 0, 'int', `echo mute ${v + 1}`],
    [`rMute${v}`, 0, 1, 0, 'int', `verb mute ${v + 1}`],
  ]),
  // sequencer / groove / rush
  ['patLen', 1, 64, 16, 'int', 'length'],
  ['swType', 0, 3, 0, 'int', 'groove'],
  ['swDepth', 0, 1, 0, 'lin', 'swing'],
  ['accent', 0, 1, 0.5, 'lin', 'accent'],
  ['rushEvery', 0, 4, 0, 'int', 'rush'],
  ['rushLen', 1, 16, 4, 'int', 'rush len'],
  ['rushVoice', 0, 5, 3, 'int', 'rush drum'],
  ['rushRate', 2, 8, 4, 'int', 'rush rate'],
  ['rushHp', 20, 2000, 600, 'exp', 'rush hp'],
  ...Array.from({ length: 16 }, (_, i) => [`rc${i}`, 0, 1, i / 15, 'lin', `curve ${i + 1}`]),
  // crossfeed 6x6: amount and target (0 fm, 1 filter, 2 ring) per src>dst
  ...[0, 1, 2, 3, 4, 5].flatMap((s) =>
    [0, 1, 2, 3, 4, 5].flatMap((d) => [
      [`xa${s}${d}`, 0, 1, 0, 'lin', `xf ${s + 1}>${d + 1}`],
      [`xt${s}${d}`, 0, 2, 0, 'int', `xf tgt ${s + 1}>${d + 1}`],
    ])
  ),
];
export const GROOVES = ['swing 16', 'swing 8', 'shuffle', 'drunk'];
export const RUSH_EVERY = [0, 1, 2, 4, 8]; // bars
export const SPEEDS = [['1/16', 1], ['1/8', 2], ['1/4', 4], ['1/2', 8], ['1 bar', 16], ['2 bars', 32], ['4 bars', 64], ['8 bars', 128]];
export const XF_TARGETS = ['fm', 'filter', 'ring'];
export const MPARAMS = MSPEC.map(([id, min, max, def, curve, label], i) => ({ id, i, min, max, def, curve, label }));
export const MP = MPARAMS.length;
export const M = Object.fromEntries(MPARAMS.map((p) => [p.id, p.i]));
export function defaultMaster() {
  return MPARAMS.map((p) => p.def);
}
