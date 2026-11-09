// fm/dm — BEAT page: pattern generator, feel, rush (with its curve), density, step grid.

function sect(title, ...kids) {
  const s = h('div', 'sect');
  const t = h('h3', '', `<span>${title}</span>`);
  s.append(t, ...kids);
  s.head = t;
  return s;
}
// a row of knobs on the right pages' six-column grid: short rows are padded so every page lines up
function krow(keys, cls = 'row') {
  const r = h('div', cls);
  for (const k of keys) r.append(typeof k === 'string' ? knob(k) : k);
  for (let i = keys.length; i < 6; i++) r.append(h('div'));
  return r;
}

function buildBeat() {
  const page = h('div');
  page.style.display = 'contents';
  const pat = sect('pattern', krow(['m.bpm', 'gen.genre', 'gen.beat', 'gen.energy', 'gen.fills', 'm.patLen']));
  pat.head.append(h('span', 'sp'), btn('new beat', 'sm', () => { pushUndo(); S.gen.beat = (S.gen.beat + 1) % 64; redraw('gen.beat'); regen(); }));

  // rush curve editor
  const curve = h('div', 'curve');
  const bars = [];
  for (let i = 0; i < 16; i++) {
    const c = h('i', '', '<b></b>');
    bars.push(c.firstChild);
    curve.append(c);
    watch(`m.rc${i}`, () => (bars[i].style.height = getG(NV_ + M[`rc${i}`]) * 100 + '%'));
    bars[i].style.height = getG(NV_ + M[`rc${i}`]) * 100 + '%';
  }
  const paint = (e) => {
    const r = curve.getBoundingClientRect();
    const i = clamp(Math.floor(((e.clientX - r.left) / r.width) * 16), 0, 15);
    setG(NV_ + M[`rc${i}`], clamp(1 - (e.clientY - r.top) / r.height, 0, 1));
  };
  curve.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    curve.setPointerCapture(e.pointerId);
    paint(e);
    const mv = (ev) => (ev.buttons ? paint(ev) : end());
    const end = () => curve.removeEventListener('pointermove', mv);
    curve.addEventListener('pointermove', mv);
    curve.addEventListener('pointerup', end, { once: true });
    curve.addEventListener('pointercancel', end, { once: true });
  });
  // feel knobs and the rush curve share the top row; the rush knobs sit under them, all on the six-column grid
  const curveWrap = h('div');
  curveWrap.style.flex = '3';
  curveWrap.style.alignSelf = 'stretch';
  curveWrap.style.display = 'flex';
  curveWrap.style.flexDirection = 'column';
  curve.style.height = 'auto';
  curve.style.flex = '1';
  curveWrap.append(curve, h('div', 'dim', '<span style="font-size:16px">rush curve: roll speed + high-pass</span>'));
  const feelRow = h('div', 'row');
  for (const k of ['m.swType', 'm.swDepth', 'm.accent']) feelRow.append(knob(k));
  feelRow.append(curveWrap);
  feelRow.style.marginBottom = '8px';
  const rushRow = krow(['m.rushEvery', 'm.rushLen', 'm.rushVoice', 'm.rushRate', 'm.rushHp']);
  const feel = sect('feel · rush', feelRow, rushRow);

  const dens = h('div', 'row');
  dens.style.height = '120px';
  for (let t = 0; t < 6; t++) dens.append(fader(`gen.dens${t}`, { bars: 16 }));
  const den = sect('density', dens);

  page.append(pat, feel, den, buildGrid());
  return page;
}

// ---- step grid: click toggles, shift-click accent, right-click on hat = open
let gridPage = 0;
function buildGrid() {
  const s = sect('steps');
  const pages = [0, 1, 2, 3, 4, 5, 6, 7].map((p) => btn(String(p + 1), 'xs', () => { gridPage = p; draw(); }));
  s.head.append(h('span', 'sp'), ...pages, btn('clear', 'xs', () => { pushUndo(); S.vel.fill(0); S.flag.fill(0); sendPattern(); }));
  const g = h('div', 'grid');
  const cells = [];
  for (let t = 0; t < 6; t++) {
    g.append(h('div', 'rn', SHORT[t]));
    for (let k = 0; k < 16; k++) {
      const c = h('div', 'c' + (k % 4 === 0 ? '' : ' q'));
      c.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const i = t * MAX_STEPS + gridPage * 16 + k;
        if (e.shiftKey) S.flag[i] ^= F_ACCENT;
        else S.vel[i] = S.vel[i] ? 0 : 110;
        if (!S.vel[i]) S.flag[i] = 0;
        sendPattern();
      });
      c.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const i = t * MAX_STEPS + gridPage * 16 + k;
        if (t === 5) {
          if (!S.vel[i]) S.vel[i] = 110;
          S.flag[i] ^= F_OPEN;
          sendPattern();
        }
      });
      cells.push(c);
      g.append(c);
    }
  }
  const draw = () => {
    const len = getG(NV_ + M.patLen);
    pages.forEach((b, p) => { b.classList.toggle('on', p === gridPage); b.disabled = p * 16 >= len && p > 0; });
    const now = S.status && S.status.playing ? S.status.step : -1;
    for (let t = 0; t < 6; t++)
      for (let k = 0; k < 16; k++) {
        const si = gridPage * 16 + k;
        const i = t * MAX_STEPS + si;
        const c = cells[t * 16 + k];
        const v = S.vel[i];
        const cls = 'c' + (k % 4 === 0 ? '' : ' q') + (v ? ' on' : '') + (v && v < 80 ? ' soft' : '') +
          (S.flag[i] & F_OPEN ? ' open' : '') + (S.flag[i] & F_ACCENT ? ' acc' : '') + (si === now ? ' now' : '') ;
        if (c.className !== cls) c.className = cls;
        c.style.opacity = si >= len ? 0.25 : '';
      }
  };
  s.draw = draw;
  watch('pattern', draw);
  watch('m.patLen', draw);
  watch('step', draw);
  s.append(g, h('div', 'dim', '<span style="font-size:15px">click: hit · shift: accent · right-click hat: open</span>'));
  draw();
  return s;
}
