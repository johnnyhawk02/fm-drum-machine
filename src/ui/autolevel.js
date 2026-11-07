// fm dm — auto-level after a randomise. Each drum is played once offline (the engine is plain JS
// and deterministic), its loudness is measured the way ears hear it, and its level is set so the
// kit sits at a sensible balance. Piercing highs count extra, so harsh hats and cymbals come down.

const AL_SR = 48000;
const AL_LEN = Math.round(AL_SR * 0.5);
// loudness target per drum, in dB relative to the kick
const AL_OFFSET = [0, -3, -4, -1.5, -9, -8];
let alRef = null; // the kick of the starting kit, measured once: the loudness everything aims at

// short-term ear-weighted loudness (dB) and peak of one hit at level 1
function measureHit(block, seed) {
  const p = new Float32Array(block);
  p[P.level] = 1;
  p[P.pan] = 0;
  const vc = new Voice(AL_SR, seed);
  // ear weighting: cut the lows below ~60 Hz, add the presence region (2-5 kHz, where treble hurts)
  // and the top (above 8 kHz) on top of the full signal
  const hp = new Svf(); hp.set(60, 0, AL_SR);
  const pres = new Svf(); pres.set(3500, 0.35, AL_SR);
  const air = new Svf(); air.set(8000, 0, AL_SR);
  vc.trigger(p, 0, 1, false);
  const W = Math.round(AL_SR * 0.05); // 50 ms windows
  let acc = 0, n = 0, best = 0, peak = 0;
  for (let i = 0; i < AL_LEN; i++) {
    vc.process(p, 0);
    const x = vc.mono !== undefined ? vc.mono : (vc.L + vc.R) * 0.5;
    const ax = Math.abs(vc.L) > Math.abs(vc.R) ? Math.abs(vc.L) : Math.abs(vc.R);
    if (ax > peak) peak = ax;
    hp.tick(x);
    const y = hp.hp;
    pres.tick(y);
    air.tick(y);
    const w = y + pres.bp * 1.0 + air.hp * 0.7;
    acc += w * w;
    if (++n === W) {
      if (acc / W > best) best = acc / W;
      acc = 0;
      n = 0;
    }
  }
  return { db: 10 * Math.log10(best + 1e-12), peak };
}

function autoLevelRef() {
  if (alRef === null) {
    const k = kitToArray(INIT_KIT);
    const m = measureHit(k.subarray(0, NP), 1);
    alRef = m.db + 20 * Math.log10(k[P.level]);
  }
  return alRef;
}

// sets S.base levels for all six drums
function autoLevel() {
  const ref = autoLevelRef();
  for (let v = 0; v < 6; v++) {
    const block = S.base.subarray(v * NP, v * NP + NP);
    const m = measureHit(block, v + 1);
    if (m.peak < 1e-4) continue; // silent voice: leave it
    let g = Math.pow(10, (ref + AL_OFFSET[v] - m.db) / 20);
    if (g * m.peak > 0.9) g = 0.9 / m.peak; // hard ceiling per drum
    const p = PARAMS[P.level];
    S.base[v * NP + P.level] = clamp(g, Math.max(p.min, 0.05), p.max);
  }
}
