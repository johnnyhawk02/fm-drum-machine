// fm/dm — randomisers. Each has a depth (drag the button up/down, 10..100%) and per-group
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
  crossfeed: { label: 'xmod', depth: 0.8, chance: {} },
  fx: { label: 'random fx', depth: 1, chance: { echo: 1, reverb: 1, sends: 1, master: 0.3 } },
  alterfx: { label: 'alter fx', depth: 0.3, chance: { echo: 1, reverb: 1, sends: 1, master: 1 } },
  motion: { label: 'motion', depth: 0.6, chance: {} },
};
const R_ORDER = ['everything', 'kit', 'alter', 'pattern', 'crossfeed', 'fx', 'alterfx', 'motion'];

// motion: 4 to 8 random knobs each get a random step sequence, at fast rates (1/16, 1/8, 1/4 a step)
// and slow ones (1, 2, 4 bars a step), with a little random slew. Replaces the lanes the last motion
// made, keeps your own lanes.
const MOTION_POOL = ['tune', 'fmLvl', 'fb', 'fmEnd', 'dA', 'dB', 'lB', 'pAmt', 'pDec', 'nCut', 'nDec', 'fCut', 'fRes', 'aDec', 'sEcho', 'sRev'];
function rndMotion(depth) {
  S.lanes = S.lanes.map((ln) => (ln && ln.motion ? null : ln));
  const used = new Set();
  const count = S.opts.mental ? 6 + Math.floor(rr() * 4) : 4 + Math.floor(rr() * 5);
  // indexes into SPEEDS: each rate once, in random order, then random ones for the rest
  const speeds = [0, 1, 2, 4, 5, 6].sort(() => rr() - 0.5);
  while (speeds.length < count) speeds.push([0, 1, 2, 4, 5, 6][Math.floor(rr() * 6)]);
  for (let k = 0; k < count; k++) {
    let g = -1;
    for (let tries = 0; tries < 50; tries++) {
      if (rr() < 0.2) {
        // sometimes an xmod cell, so drums modulate each other in and out
        const s = Math.floor(rr() * 6);
        let d = Math.floor(rr() * 5);
        if (d >= s) d++;
        g = NV_ + M[`xa${s}${d}`];
      } else {
        const v = Math.floor(rr() * 6);
        const id = MOTION_POOL[Math.floor(rr() * MOTION_POOL.length)];
        g = v * NP + P[id];
      }
      if (!used.has(g) && laneOf(g) < 0) break;
      g = -1;
    }
    if (g < 0) continue;
    used.add(g);
    const l = newLane(g);
    if (l < 0) break;
    const ln = S.lanes[l];
    ln.motion = true;
    ln.len = rr() < 0.5 ? 16 : 8;
    ln.steps.fill(0);
    // half of them are envelope sequences: a shape fired on each step
    ln.mode = rr() < 0.5 ? 1 : 0;
    if (ln.mode) envRandom(ln.len, ln.steps, ln.shapes, (rr() * 1e9) | 0);
    else laneRandom(LANE_RANDOMS[Math.floor(rr() * LANE_RANDOMS.length)], ln.len, ln.steps, (rr() * 1e9) | 0);
    ln.speed = speeds[k];
    ln.slew = ln.mode ? rr() * 0.1 : 0.1 + rr() * 0.45;
    ln.depth = (g >= NV_ ? 1 : rr() < 0.5 ? -1 : 1) * (0.2 + rr() * 0.4) * depth / 0.6;
    ln.groove = true;
  }
}
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
    else { mixM('rPre', lin(0, 60), depth); mixM('rDecay', exp(0.6, S.opts.wild ? 12 : 5), depth); mixM('rTone', exp(2000, 12000), depth); mixM('rEarly', lin(0.1, 0.8), depth);
      if (rr() < depth) { setM('rType', rr() < 0.35 ? 1 : 0); setM('rIr', Math.floor(rr() * IR_USER)); } } // sometimes a factory impulse response
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
    // levels are never randomised: only auto-level (options) sets them
    const gp = v * NP + P.pan;
    S.base[gp] += ((rr() * 2 - 1) * 0.5 - S.base[gp]) * depth;
  }
}
function rndXfeed(depth) {
  for (let s = 0; s < 6; s++) for (let d = 0; d < 6; d++) S.base[NV_ + M[`xa${s}${d}`]] = 0;
  // drop sequences the last xmod randomise made
  S.lanes = S.lanes.map((ln) => (ln && ln.xmod ? null : ln));
  const n = S.opts.mental ? 3 + Math.floor(rr() * 5) : 1 + Math.floor(rr() * (2 + depth * 4));
  const set = [];
  for (let i = 0; i < n; i++) {
    const s = Math.floor(rr() * 6);
    let d = Math.floor(rr() * 5);
    if (d >= s) d++;
    setM(`xa${s}${d}`, (S.opts.mental ? 0.08 + rr() * 0.45 : 0.05 + rr() * 0.45) * depth);
    setM(`xt${s}${d}`, Math.floor(rr() * 3));
    if (!set.includes(`xa${s}${d}`)) set.push(`xa${s}${d}`);
  }
  // at least half of the routings get a step sequence on their depth
  set.sort(() => rr() - 0.5);
  const nSeq = S.opts.mental ? Math.ceil(set.length * 0.65) : Math.ceil(set.length / 2) + (rr() < 0.5 ? Math.floor(rr() * (set.length / 2)) : 0);
  for (let i = 0; i < nSeq && i < set.length; i++) {
    const g = NV_ + M[set[i]];
    if (laneOf(g) >= 0) continue;
    const l = newLane(g);
    if (l < 0) break;
    const ln = S.lanes[l];
    ln.xmod = true;
    ln.len = rr() < 0.5 ? 16 : 8;
    ln.steps.fill(0);
    laneRandom(LANE_RANDOMS[Math.floor(rr() * LANE_RANDOMS.length)], ln.len, ln.steps, (rr() * 1e9) | 0);
    ln.speed = [0, 1, 2, 4, 5, 6][Math.floor(rr() * 6)];
    ln.slew = 0.1 + rr() * 0.45;
    ln.depth = 0.2 + rr() * 0.4;
    ln.groove = true;
  }
}
function rndPattern(depth, chance) {
  if (rr() < (chance.genre ?? 0.2) * depth || S.opts.wild) S.gen.genre = GENRE_NAMES[Math.floor(rr() * GENRE_NAMES.length)];
  S.gen.beat = Math.floor(rr() * 64);
  if (rr() < (chance.energy ?? 1)) S.gen.energy = clamp(S.gen.energy + (0.25 + rr() * 0.6 - S.gen.energy) * depth, 0, 1);
  if (rr() < (chance.fills ?? 1)) S.gen.fills = clamp(S.gen.fills + (rr() * 0.7 - S.gen.fills) * depth, 0, 1);
  if (S.opts.mental) { S.gen.energy = 0.5 + rr() * 0.3; S.gen.fills = 0.3 + rr() * 0.3; } // busier
  S.gen.seed = Math.floor(rr() * 1e6);
  setM('bpm', 90 + Math.round(rr() * 90)); // any tempo from 90 to 180
  redraw('m.bpm');
  setM('patLen', rr() < 0.5 ? 64 : 128); // phrases of 4 or 8 bars that evolve, with a fill at the end
  redraw('m.patLen');
  const g = generate({ ...S.gen, accent: S.base[NV_ + M.accent], len: S.base[NV_ + M.patLen] });
  S.vel.set(g.vel);
  S.flag.set(g.flag);
  ['gen.genre', 'gen.beat', 'gen.energy', 'gen.fills'].forEach(redraw);
}

function runRandom(name) {
  const r = RND[name];
  pushUndo();
  const before = S.base.slice(0, 6 * NP);
  const mental = S.opts.mental;
  const wild0 = S.opts.wild;
  if (mental && rr() < 0.3) S.opts.wild = true; // wild ranges some of the time
  const d = mental ? r.depth + (1 - r.depth) * 0.3 : r.depth; // a third of the way to full depth
  const ch = (c) => (mental ? Object.fromEntries(Object.keys(c).map((k) => [k, c[k] + (1 - c[k]) * 0.3])) : c);
  if (name === 'everything') {
    rndPattern(d, mental ? { genre: 0.8 } : { genre: 0.6 });
    rndKit(d, ch(RND.kit.chance), false);
    rndFx(d, ch(RND.fx.chance), false);
    rndMix(d);
    if (mental) { rndXfeed(0.7); rndMotion(0.7); }
  } else if (name === 'kit') rndKit(d, ch(r.chance), false);
  else if (name === 'alter') rndKit(d, ch(r.chance), true);
  else if (name === 'pattern') rndPattern(d, ch(r.chance));
  else if (name === 'crossfeed') rndXfeed(d);
  else if (name === 'fx') rndFx(d, ch(r.chance), false);
  else if (name === 'alterfx') rndFx(d, ch(r.chance), true);
  else if (name === 'motion') rndMotion(d);
  S.opts.wild = wild0;
  // auto-level once the new sound is settled, and only for drums whose sound actually changed
  if (S.opts.autoLevel) {
    const skip = new Set([P.level, P.trim, P.pan, P.sEcho, P.sRev, P.sDist, P.sRing]); // mix, not sound
    const changed = [];
    for (let v = 0; v < 6; v++) {
      let ch = false;
      for (let i = 0; i < NP && !ch; i++) if (!skip.has(i) && S.base[v * NP + i] !== before[v * NP + i]) ch = true;
      changed.push(ch);
    }
    // xmod and knob sequences change how loud a drum gets, so those level every drum
    if (name === 'crossfeed' || name === 'motion' || (name === 'everything' && mental)) changed.fill(true);
    autoLevel(changed);
  }
  sendAll(S.opts.nextBar && S.playing);
  dirty();
  if (S.opts.nextBar && S.playing) toast(`${r.label}: on next bar`);
}

// one drum only (right-click or long-press a drum button on the voice page): a kit randomise of
// that drum's sound, then auto-level just that drum. go mental and wild ranges apply as usual.
function runRandomVoice(v) {
  pushUndo();
  const mental = S.opts.mental;
  const wild0 = S.opts.wild;
  if (mental && rr() < 0.3) S.opts.wild = true;
  const r = RND.kit;
  const d = mental ? r.depth + (1 - r.depth) * 0.3 : r.depth;
  const chance = mental ? Object.fromEntries(Object.keys(r.chance).map((k) => [k, r.chance[k] + (1 - r.chance[k]) * 0.3])) : r.chance;
  rndVoice(v, d, chance, false);
  S.opts.wild = wild0;
  if (S.opts.autoLevel) autoLevel([0, 1, 2, 3, 4, 5].map((i) => i === v));
  const atBar = S.opts.nextBar && S.playing;
  sendAll(atBar);
  dirty();
  toast(`${VOICE_NAMES[v]} randomised${atBar ? ' on next bar' : ''}`);
}

// one "randomise" button in the title line opens a drop-down with every randomiser and undo
function buildRandomisers(host) {
  const open = btn('randomise ▾', 'sm rndopen');
  const wrap = h('div', 'rnddrop');
  wrap.hidden = true;
  const show = (on) => {
    wrap.hidden = !on;
    open.classList.toggle('on', on);
  };
  open.addEventListener('click', () => show(wrap.hidden));
  // close on a press anywhere else, or Escape (dialogs opened from the list stay usable)
  document.addEventListener('pointerdown', (e) => {
    if (!wrap.hidden && !wrap.contains(e.target) && !open.contains(e.target) && !e.target.closest('.dlg')) show(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') show(false); });
  host.append(open, wrap);
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
        if (!ev.buttons) return b.removeEventListener('pointermove', mv);
        const dy = (y0 - ev.clientY) / stageScale;
        if (Math.abs(dy) > 3) { moved = true; clearTimeout(holdT); }
        if (moved) { r.depth = clamp(Math.round((d0 + dy / 150) * 10) / 10, 0.1, 1); drawD(); toast(`${r.label} depth ${Math.round(r.depth * 100)}%`); }
      };
      const up = () => {
        clearTimeout(holdT);
        b.removeEventListener('pointermove', mv);
        if (!moved && !held) {
          runRandom(name);
          show(false);
        }
      };
      b.addEventListener('pointermove', mv);
      b.addEventListener('pointerup', up, { once: true });
    });
    b.dataset.rnd = name;
    wrap.append(b);
  }
  const u = btn('undo', 'sm', () => { undo(); show(false); });
  watch('undo', () => (u.disabled = !undoStack.length));
  u.disabled = true;
  wrap.append(u);
  // go mental: every randomiser at full depth, wild ranges, all chances, far more of everything
  const gm = chk('go mental', () => S.opts.mental, (v) => (S.opts.mental = v));
  gm.classList.add('mental');
  wrap.append(gm);
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
