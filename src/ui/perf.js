// fm dm — PERF: 24 assignable knobs (MIDI CC 1..24) and the step sequencer strip under them.

const PERF_DEFAULT = [
  'm.bpm', 'm.dkAmt', 'm.swDepth', 'gen.energy',
  'v0.tune', 'v0.aDec', 'v0.pAmt', 'v0.fmLvl',
  'v1.tune', 'v1.aDec', 'v2.tune', 'v2.aDec',
  'v3.tune', 'v3.nDec', 'v3.nCut', 'v3.fmLvl',
  'v4.tune', 'v4.aDec', 'v5.tune', 'v5.aDec2',
  'm.eFb', 'm.rDecay', 'm.mdDrive', 'm.mHp',
];
S.perf = PERF_DEFAULT.slice();
const perfKnobs = [];

function buildPerf() {
  const box = $('perf');
  box.innerHTML = '';
  const head = h('h3', '', '<span>perf</span><span class="dim" style="font-size:16px">midi cc 1-24</span>');
  const grid = h('div', 'kgrid');
  for (let i = 0; i < 24; i++) {
    const k = knob(S.perf[i], { label: perfLabel(S.perf[i]) });
    k.dataset.cc = i + 1;
    perfKnobs.push(k);
    grid.append(k);
  }
  box.append(head, grid);
}
function perfLabel(key) {
  if (!key) return '---';
  const g = keyG(key);
  if (g < 0 || g >= NV_) return fullName(key);
  return SHORT[Math.floor(g / NP)] + ' ' + labelOf(g);
}
function setPerf(i, key) {
  S.perf[i] = key;
  const old = perfKnobs[i];
  const k = knob(key, { label: perfLabel(key) });
  k.dataset.cc = i + 1;
  old.replaceWith(k);
  perfKnobs[i] = k;
  dirty();
}
function assignDialog(key) {
  const body = h('div', 'kgrid');
  body.style.gridTemplateColumns = 'repeat(4, 1fr)';
  S.perf.forEach((k, i) => {
    const b = btn(`${i + 1}: ${perfLabel(k)}`, 'sm', () => {
      setPerf(i, key);
      closeDialog();
      toast(`perf ${i + 1} = ${perfLabel(key)}`);
    });
    body.append(b);
  });
  dialog(`assign ${fullName(key)} to`, body);
}

// ---- step sequencer strip
let seqPage = 0;
function laneModel(name, label, steps, get, set, fmtf, def) {
  return { key: 'lane.' + name, g: -1, steps, noSelect: true, label, def,
    get: () => { const ln = curLane(); return ln ? get(ln) : def; },
    set: (n) => { const l = ensureLane(); if (l < 0) return; set(S.lanes[l], n); sendLane(l); },
    text: () => { const ln = curLane(); return ln ? fmtf(ln) : ''; }, mod: () => null };
}
function selG() {
  return S.sel ? keyG(S.sel) : -1;
}
function curLane() {
  const g = selG();
  const l = g >= 0 ? laneOf(g) : -1;
  return l >= 0 ? S.lanes[l] : null;
}
function ensureLane() {
  const g = selG();
  if (g < 0) return -1;
  const l = newLane(g);
  if (l < 0) toast('all 32 sequencers in use');
  return l;
}
function openLane(g) {
  const l = newLane(g);
  if (l >= 0) sendLane(l);
}
function removeLane(g) {
  const l = laneOf(g);
  if (l < 0) return;
  S.lanes[l] = null;
  post({ t: 'lane', l, g: -1 });
  redraw(gKey(g));
  redraw('lane');
}

function buildSeq() {
  const el = $('seq');
  el.innerHTML = '';
  const top = h('div', 'top');
  const name = h('div', 'name', 'seq');
  const pages = [0, 1, 2, 3].map((p) => {
    const b = btn(String(p + 1), 'sm', () => { seqPage = p; drawSeq(); });
    return b;
  });
  const clear = btn('clear', 'sm', () => { const g = selG(); if (g >= 0) removeLane(g); });
  top.append(name, ...pages, clear);
  const steps = h('div', 'steps');
  const cells = [];
  for (let i = 0; i < 16; i++) {
    const c = h('div', 'st', '<i></i>');
    cells.push(c);
    steps.append(c);
  }
  steps.append(h('div', 'zero'));
  // paint steps by dragging
  const paint = (e) => {
    const r = steps.getBoundingClientRect();
    const i = clamp(Math.floor(((e.clientX - r.left) / r.width) * 16), 0, 15);
    const y = clamp(1 - (2 * (e.clientY - r.top)) / r.height, -1, 1);
    const l = ensureLane();
    if (l < 0) return;
    const ln = S.lanes[l];
    const si = seqPage * 16 + i;
    ln.steps[si] = Math.abs(y) < 0.06 ? 0 : y;
    if (si >= ln.len) { ln.len = si + 1; }
    sendLane(l);
  };
  steps.addEventListener('pointerdown', (e) => {
    if (selG() < 0) return;
    steps.setPointerCapture(e.pointerId);
    paint(e);
    const mv = (ev) => paint(ev);
    steps.addEventListener('pointermove', mv);
    steps.addEventListener('pointerup', () => steps.removeEventListener('pointermove', mv), { once: true });
  });
  const ctl = h('div', 'ctl');
  const SP = SPEEDS;
  ctl.append(
    knob(null, { model: laneModel('len', 'length', 63, (ln) => (ln.len - 2) / 62, (ln, n) => (ln.len = 2 + Math.round(n * 62)), (ln) => ln.len, 14 / 62), watch: 'lane' }),
    knob(null, { model: laneModel('slew', 'slew', 0, (ln) => ln.slew, (ln, n) => (ln.slew = n), (ln) => Math.round(ln.slew * 100) + '%', 0), watch: 'lane' }),
    knob(null, { model: laneModel('speed', 'speed', SP.length, (ln) => ln.speed / (SP.length - 1), (ln, n) => (ln.speed = Math.round(n * (SP.length - 1))), (ln) => SP[ln.speed][0], 0), watch: 'lane' }),
    knob(null, { model: laneModel('depth', 'depth', 0, (ln) => (ln.depth + 1) / 2, (ln, n) => (ln.depth = n * 2 - 1), (ln) => Math.round(ln.depth * 100) + '%', 0.75), watch: 'lane' }),
  );
  const grooveB = btn('groove', 'sm', () => { const l = ensureLane(); if (l < 0) return; S.lanes[l].groove = !S.lanes[l].groove; sendLane(l); });
  const gw = h('div');
  gw.style.display = 'grid';
  gw.style.placeItems = 'center';
  gw.append(grooveB);
  ctl.append(gw);
  const shapes = h('div', 'shapes');
  for (const s of LANE_SHAPES) shapes.append(btn(s, 'xs', () => fillLane((ln) => laneShape(s, ln.len, ln.steps))));
  for (const s of LANE_RANDOMS) shapes.append(btn(s, 'xs', () => fillLane((ln) => laneRandom(s, ln.len, ln.steps, (Math.random() * 1e9) | 0))));
  el.append(top, steps, ctl, shapes);

  function drawSeq() {
    const g = selG();
    const ln = curLane();
    el.classList.toggle('idle', g < 0);
    name.textContent = g >= 0 ? 'seq · ' + fullName(S.sel) : 'seq · pick a knob';
    pages.forEach((b, p) => {
      b.classList.toggle('on', p === seqPage);
      b.disabled = !ln && p > 0 ? true : ln ? p * 16 >= ln.len && p > 0 : false;
    });
    const pos = ln && S.status && S.status.playing ? S.status.lpos[laneOf(g)] : -1;
    cells.forEach((c, i) => {
      const si = seqPage * 16 + i;
      const v = ln ? ln.steps[si] : 0;
      const bar = c.firstChild;
      bar.style.top = v >= 0 ? (50 - v * 50).toFixed(1) + '%' : '50%';
      bar.style.bottom = v >= 0 ? '50%' : (50 + v * 50).toFixed(1) + '%';
      bar.style.minHeight = '2px';
      c.classList.toggle('off', !!ln && si >= ln.len);
      c.classList.toggle('cur', si === pos);
    });
    grooveB.classList.toggle('on', !!ln && ln.groove);
  }
  el.draw = drawSeq;
  watch('sel', drawSeq);
  watch('lane', drawSeq);
  drawSeq();
}
function fillLane(f) {
  const l = ensureLane();
  if (l < 0) return;
  f(S.lanes[l]);
  sendLane(l);
}
