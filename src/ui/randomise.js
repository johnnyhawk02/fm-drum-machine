// fm dm — randomisers. Each has a depth (drag the button up/down, 10..100%) and per-group
// chances (hold the button). Drum-safe ranges stay near the starting kit; wild uses full ranges.

const R_GROUPS = {
  tone: ['algo', 'tune', 'fmLvl', 'fb', 'fmEnd', 'drift', 'fmNoise', 'hum', ...['A', 'B', 'C', 'D'].flatMap((o) => [`r${o}`, `l${o}`, `a${o}`, `d${o}`])],
  shape: ['pAmt', 'pDec', 'clk', 'clkType', 'clkDec', 'aAtk', 'aHold', 'aDec', 'aCurve', 'aDec2'],
  noise: ['nLvl', 'nType', 'nCut', 'nRes', 'nAtk', 'nDec', 'nBurst', 'nSpace'],
  filter: ['fType', 'fCut', 'fRes', 'fDrive', 'fEnv', 'fEnvDec'],
  mod: ['lShape', 'lRate', 'lDepth', 'lDest', 'lDest2', 'bits', 'srDiv', 'vFm', 'vPitch', 'vFilt'],
};
// kept as they are in drum-safe mode (structure / routing)
const SAFE_KEEP = new Set(['algo', 'fType', 'nType', 'clkType', 'lDest', 'lDest2', 'lShape', 'nBurst', 'fxA', 'fxB', 'fxC', 'fxD']);
// how far (in knob turns) drum-safe moves from the starting kit
const SAFE_SPAN = { tune: 0.08, drift: 0.1, fmNoise: 0.15, hum: 0.2, fmEnd: 0.15, bits: 0.06, srDiv: 0.06, fDrive: 0.15, lDepth: 0.12 };

const RND = {
  everything: { label: 'everything', depth: 1, chance: {} },
  kit: { label: 'kit', depth: 1, chance: { tone: 1, shape: 1, noise: 1, filter: 0.7, mod: 0.3 } },
  alter: { label: 'alter', depth: 0.3, chance: { tone: 1, shape: 1, noise: 1, filter: 1, mod: 1 } },
  pattern: { label: 'pattern', depth: 1, chance: { genre: 0.2, energy: 1, fills: 1 } },
  crossfeed: { label: 'crossfeed', depth: 0.6, chance: {} },
  fx: { label: 'random fx', depth: 1, chance: { echo: 1, reverb: 1, sends: 1, master: 0.3 } },
  alterfx: { label: 'alter fx', depth: 0.3, chance: { echo: 1, reverb: 1, sends: 1, master: 1 } },
};
const R_ORDER = ['everything', 'kit', 'alter', 'pattern', 'crossfeed', 'fx', 'alterfx'];
const rr = () => Math.random();

function rndVoice(v, depth, chance, alter) {
  for (const [grp, ids] of Object.entries(R_GROUPS)) {
    if (rr() >= (chance[grp] ?? 1)) continue;
    for (const id of ids) {
      const g = v * NP + P[id];
      const p = PARAMS[P[id]];
      if (v !== 5 && id === 'aDec2') continue;
      const cur = toNorm(p, getG(g));
      let n;
      if (alter) {
        if (p.curve === 'int') continue;
        n = cur + (rr() * 2 - 1) * 0.1 * depth * 3;
      } else if (S.opts.wild) {
        n = cur + (rr() - cur) * depth;
      } else {
        if (SAFE_KEEP.has(id)) continue;
        const home = toNorm(p, defaultFor(g));
        const span = SAFE_SPAN[id] ?? 0.2;
        const target = clamp(home + (rr() * 2 - 1) * span, 0, 1);
        n = cur + (target - cur) * depth;
      }
      S.base[g] = fromNorm(p, clamp(n, 0, 1));
    }
  }
}
function rndKit(depth, chance, alter) {
  for (let v = 0; v < 6; v++) rndVoice(v, depth, chance, alter);
}
function setM(id, x) {
  const p = MPARAMS[M[id]];
  S.base[NV_ + M[id]] = clamp(p.curve === 'int' ? Math.round(x) : x, p.min, p.max);
}
function mixM(id, target, depth) {
  const p = MPARAMS[M[id]];
  const cur = toNorm(p, S.base[NV_ + M[id]]);
  S.base[NV_ + M[id]] = fromNorm(p, cur + (toNorm(p, target) - cur) * depth);
}
function rndFx(depth, chance, alter) {
  const ch = (k) => rr() < (chance[k] ?? 1);
  const nudge = (id) => {
    const p = MPARAMS[M[id]];
    if (p.curve === 'int') return;
    const cur = toNorm(p, S.base[NV_ + M[id]]);
    S.base[NV_ + M[id]] = fromNorm(p, clamp(cur + (rr() * 2 - 1) * 0.3 * depth, 0, 1));
  };
  const lin = (a, b) => a + rr() * (b - a);
  const exp = (a, b) => a * Math.pow(b / a, rr());
  if (ch('echo')) {
    if (alter) ['eFb', 'eTone', 'eWidth', 'eFine'].forEach(nudge);
    else {
      if (depth > 0.5) setM('eDiv', [3, 4, 5, 6, 7, 8, 10][Math.floor(rr() * 7)]);
      mixM('eFb', lin(0.2, 0.7), depth); mixM('eTone', exp(1500, 9000), depth); mixM('eWidth', lin(0.4, 1), depth);
      if (rr() < 0.4 * depth) setM('ePing', rr() < 0.6 ? 1 : 0);
    }
  }
  if (ch('reverb')) {
    if (alter) ['rPre', 'rDecay', 'rTone', 'rEarly'].forEach(nudge);
    else { mixM('rPre', lin(0, 60), depth); mixM('rDecay', exp(0.6, S.opts.wild ? 12 : 5), depth); mixM('rTone', exp(2000, 12000), depth); mixM('rEarly', lin(0.1, 0.8), depth); }
  }
  if (ch('sends')) {
    for (let v = 0; v < 6; v++) for (const [id, pr, mx] of [['sEcho', 0.35, 0.45], ['sRev', 0.5, 0.5], ['sDist', 0.15, 0.6], ['sRing', 0.1, 0.5]]) {
      const g = v * NP + P[id];
      if (alter) S.base[g] = clamp(S.base[g] + (rr() * 2 - 1) * 0.1 * depth, 0, 1);
      else {
        const target = rr() < pr ? rr() * mx : 0;
        S.base[g] = S.base[g] + (target - S.base[g]) * depth;
      }
    }
  }
  if (ch('master')) {
    if (alter) ['mdDrive', 'mdColour', 'mdTone', 'dkAmt'].forEach(nudge);
    else { mixM('mdDrive', lin(0, 0.6), depth); mixM('mdMix', rr() < 0.5 ? lin(0, 0.5) : 0, depth); setM('mdType', Math.floor(rr() * 4)); mixM('dkAmt', rr() < 0.5 ? lin(0.2, 0.7) : 0, depth); }
  }
}
function rndMix(depth) {
  for (let v = 0; v < 6; v++) {
    const gl = v * NP + P.level;
    const gp = v * NP + P.pan;
    S.base[gl] += (0.45 + rr() * 0.5 - S.base[gl]) * depth * 0.5;
    S.base[gp] += ((rr() * 2 - 1) * 0.5 - S.base[gp]) * depth;
  }
}
function rndXfeed(depth) {
  for (let s = 0; s < 6; s++) for (let d = 0; d < 6; d++) S.base[NV_ + M[`xa${s}${d}`]] = 0;
  const n = 1 + Math.floor(rr() * (2 + depth * 4));
  for (let i = 0; i < n; i++) {
    const s = Math.floor(rr() * 6);
    let d = Math.floor(rr() * 5);
    if (d >= s) d++;
    setM(`xa${s}${d}`, (0.05 + rr() * 0.45) * depth);
    setM(`xt${s}${d}`, Math.floor(rr() * 3));
  }
}
function rndPattern(depth, chance) {
  if (rr() < (chance.genre ?? 0.2) * depth || S.opts.wild) S.gen.genre = GENRE_NAMES[Math.floor(rr() * GENRE_NAMES.length)];
  S.gen.beat = Math.floor(rr() * 64);
  if (rr() < (chance.energy ?? 1)) S.gen.energy = clamp(S.gen.energy + (0.25 + rr() * 0.6 - S.gen.energy) * depth, 0, 1);
  if (rr() < (chance.fills ?? 1)) S.gen.fills = clamp(S.gen.fills + (rr() * 0.7 - S.gen.fills) * depth, 0, 1);
  S.gen.seed = Math.floor(rr() * 1e6);
  const g = generate({ ...S.gen, accent: S.base[NV_ + M.accent], len: S.base[NV_ + M.patLen] });
  S.vel.set(g.vel);
  S.flag.set(g.flag);
  ['gen.genre', 'gen.beat', 'gen.energy', 'gen.fills'].forEach(redraw);
}

function runRandom(name) {
  const r = RND[name];
  pushUndo();
  const d = r.depth;
  if (name === 'everything') {
    rndPattern(d, { genre: 0.6 });
    rndKit(d, RND.kit.chance, false);
    rndFx(d, RND.fx.chance, false);
    rndMix(d);
  } else if (name === 'kit') rndKit(d, r.chance, false);
  else if (name === 'alter') rndKit(d, r.chance, true);
  else if (name === 'pattern') rndPattern(d, r.chance);
  else if (name === 'crossfeed') rndXfeed(d);
  else if (name === 'fx') rndFx(d, r.chance, false);
  else if (name === 'alterfx') rndFx(d, r.chance, true);
  sendAll(S.opts.nextBar && S.playing);
  dirty();
  if (S.opts.nextBar && S.playing) toast(`${r.label}: on next bar`);
}

function buildRandomisers(wrap) {
  for (const name of R_ORDER) {
    const r = RND[name];
    const b = btn(r.label, 'sm');
    const bar = h('i');
    b.append(bar);
    const drawD = () => (bar.style.width = r.depth * 100 + '%');
    drawD();
    b.title = 'click: randomise · drag up/down: depth · hold: ranges and chances';
    let y0 = 0;
    let moved = false;
    let holdT = 0;
    let held = false;
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      b.setPointerCapture(e.pointerId);
      y0 = e.clientY;
      moved = false;
      held = false;
      const d0 = r.depth;
      holdT = setTimeout(() => { held = true; rndDialog(name); }, 550);
      const mv = (ev) => {
        const dy = (y0 - ev.clientY) / stageScale;
        if (Math.abs(dy) > 3) { moved = true; clearTimeout(holdT); }
        if (moved) { r.depth = clamp(Math.round((d0 + dy / 150) * 10) / 10, 0.1, 1); drawD(); toast(`${r.label} depth ${Math.round(r.depth * 100)}%`); }
      };
      const up = () => {
        clearTimeout(holdT);
        b.removeEventListener('pointermove', mv);
        if (!moved && !held) runRandom(name);
      };
      b.addEventListener('pointermove', mv);
      b.addEventListener('pointerup', up, { once: true });
    });
    b.dataset.rnd = name;
    wrap.append(b);
  }
  const u = btn('undo', 'sm', undo);
  u.style.height = '36px';
  watch('undo', () => (u.disabled = !undoStack.length));
  u.disabled = true;
  wrap.append(u);
}

function rndDialog(name) {
  const r = RND[name];
  const body = h('div');
  body.style.display = 'grid';
  body.style.gap = '10px';
  const row = h('div', 'row');
  const dm = { key: 'rnd.depth', g: -1, steps: 10, noSelect: true, label: 'depth', def: 1, get: () => (r.depth - 0.1) / 0.9,
    set: (n) => { r.depth = Math.round((0.1 + n * 0.9) * 10) / 10; k0.draw(); }, text: () => Math.round(r.depth * 100) + '%', mod: () => null };
  const k0 = knob(null, { model: dm });
  row.append(k0);
  for (const grp of Object.keys(r.chance)) {
    const m = { key: 'rnd.' + grp, g: -1, steps: 0, noSelect: true, label: grp, def: 1, get: () => r.chance[grp],
      set: (n) => { r.chance[grp] = n; k.draw(); }, text: () => Math.round(r.chance[grp] * 100) + '%', mod: () => null };
    const k = knob(null, { model: m });
    row.append(k);
  }
  body.append(row, chk('wild ranges (not drum-safe)', () => S.opts.wild, (v) => (S.opts.wild = v)),
    chk('randomise on next bar', () => S.opts.nextBar, (v) => (S.opts.nextBar = v)),
    h('div', 'dim', '<span style="font-size:17px">depth: how far it moves · chances: how likely each group changes</span>'));
  dialog(`${r.label}: ranges and chances`, body);
}
