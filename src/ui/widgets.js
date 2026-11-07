// fm/dm — knobs, faders, number boxes, menus, dialogs.

// a control model for any key: engine param ('v0.tune', 'm.bpm') or generator option ('gen.energy')
function model(key) {
  const g = keyG(key);
  if (g >= 0) {
    const p = specOf(g);
    const steps = p.curve === 'int' ? p.max - p.min + 1 : 0;
    return {
      key, g, steps,
      get: () => toNorm(p, getG(g)),
      set: (n) => setG(g, fromNorm(p, n), false),
      text: () => fmt(g),
      label: p.label,
      def: toNorm(p, g >= NV_ ? p.def : defaultFor(g)),
      mod: () => {
        const l = laneOf(g);
        if (l < 0 || !S.status || !S.status.playing) return null;
        return S.status.lanes[l];
      },
    };
  }
  const name = key.slice(4);
  const sp = GEN_SPECS[name];
  const steps = sp.steps || 0;
  const max = sp.max || 1;
  return {
    key, g: -1, steps,
    get: () => (steps ? sp.get() / (steps - 1) : sp.get() / max),
    set: (n) => {
      sp.set(steps ? Math.round(n * (steps - 1)) : n * max);
      redraw(key);
      if (sp.regen) regenSoon();
    },
    text: () => sp.fmt(sp.get()),
    label: sp.label,
    def: steps ? 0 : (sp.def ?? 0) / max,
    mod: () => null,
  };
}
// default of a voice param in the init kit
function defaultFor(g) {
  const v = Math.floor(g / NP);
  const id = PARAMS[g % NP].id;
  const k = INIT_KIT[v] || {};
  return id in k ? k[id] : PARAMS[g % NP].def;
}
let regenT = 0;
function regenSoon() {
  clearTimeout(regenT);
  regenT = setTimeout(() => regen(), 60);
}

// ---- shared drag behaviour (vertical drag, wheel, select, double-click reset, right-click menu)
function bindDrag(el, getM, opts = {}) {
  el.tabIndex = -1;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const m = getM();
    if (!m) return;
    if (!m.noSelect) select(m.key);
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    let y0 = e.clientY;
    let n = m.get();
    let acc = 0;
    let pushed = false;
    const move = (ev) => {
      if (!ev.buttons) return up(); // button already released: never change a value on hover
      const dy = (y0 - ev.clientY) / stageScale;
      y0 = ev.clientY;
      if (!pushed && dy) {
        pushed = true;
      }
      if (m.steps) {
        acc += dy / Math.max(6, 160 / m.steps);
        const d = acc > 0 ? Math.floor(acc) : Math.ceil(acc);
        if (d) {
          acc -= d;
          const i = clamp(Math.round(m.get() * (m.steps - 1)) + d, 0, m.steps - 1);
          m.set(i / (m.steps - 1));
        }
      } else {
        n = clamp(n + dy / (ev.shiftKey ? 900 : opts.range || 180), 0, 1);
        m.set(n);
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  });
  // the wheel only turns a control that is already selected (clicked), so scrolling past it does nothing
  el.addEventListener('wheel', (e) => {
    const m = getM();
    if (!m) return;
    e.preventDefault();
    if (!m.noSelect && S.sel !== m.key) return;
    nudge(m, e.deltaY < 0 ? 1 : -1, e.shiftKey);
  }, { passive: false });
  el.addEventListener('dblclick', () => {
    const m = getM();
    if (m) m.set(m.def);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const m = getM();
    if (m) controlMenu(m, e);
  });
}
function nudge(m, dir, fine) {
  if (m.steps) m.set(clamp(Math.round(m.get() * (m.steps - 1)) + dir, 0, m.steps - 1) / (m.steps - 1));
  else m.set(clamp(m.get() + dir * (fine ? 0.002 : 0.01), 0, 1));
}

// ---- selection: the selected control is turned by arrows/wheel and shown in the seq strip
function select(key) {
  if (S.sel === key) return;
  const old = S.sel;
  S.sel = key;
  if (old) redraw(old);
  redraw(key);
  redraw('sel');
}

// ---- knob: segmented ring (value), lit arc (live sequencer movement), needle
const K_TICKS = 25;
const K_A0 = -135;
const K_A1 = 135;
function knobSvg() {
  let s = '<svg viewBox="-29 -26 58 52">';
  for (let i = 0; i < K_TICKS; i++) {
    const a = ((K_A0 + ((K_A1 - K_A0) * i) / (K_TICKS - 1) - 90) * Math.PI) / 180;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    s += `<line class="t" x1="${(c * 16).toFixed(2)}" y1="${(sn * 16 + 3).toFixed(2)}" x2="${(c * 24).toFixed(2)}" y2="${(sn * 24 + 3).toFixed(2)}"/>`;
  }
  s += '<line class="needle" x1="0" y1="3" x2="0" y2="-9"/></svg>';
  return s;
}
function knob(key, opts = {}) {
  const el = h('div', 'knob');
  el.innerHTML = `<div class="val"></div>${knobSvg()}<div class="lab"></div>`;
  const val = el.firstChild;
  const ticks = el.querySelectorAll('.t');
  const needle = el.querySelector('.needle');
  const lab = el.lastChild;
  let m = opts.model || (key ? model(key) : null);
  let lastMod = null;
  const draw = () => {
    if (!m) {
      el.classList.add('empty');
      val.textContent = '';
      lab.textContent = '---';
      ticks.forEach((t) => t.setAttribute('class', 't'));
      return;
    }
    el.classList.remove('empty');
    const n = m.get();
    const mod = m.mod();
    lastMod = mod;
    const lit = Math.round(n * (K_TICKS - 1));
    let a = lit;
    let b = lit;
    if (mod != null) {
      const mn = Math.round(clamp(n + mod, 0, 1) * (K_TICKS - 1));
      a = Math.min(lit, mn);
      b = Math.max(lit, mn);
    }
    for (let i = 0; i < K_TICKS; i++) {
      const cls = mod != null && i >= a && i <= b && i !== lit ? 't mod' : i <= lit ? 't on' : 't';
      if (ticks[i].getAttribute('class') !== cls) ticks[i].setAttribute('class', cls);
    }
    const ang = K_A0 + (K_A1 - K_A0) * clamp(n + (mod || 0), 0, 1);
    needle.setAttribute('transform', `rotate(${ang.toFixed(1)} 0 3)`);
    val.textContent = m.text();
    lab.textContent = opts.label || m.label;
    el.classList.toggle('sel', S.sel === m.key);
    el.classList.toggle('seq', m.g >= 0 && laneOf(m.g) >= 0);
  };
  el.draw = draw;
  el.setKey = (k) => {
    key = k;
    m = k ? model(k) : null;
    if (k) watch(k, draw);
    draw();
  };
  el.hasMod = () => m && m.g >= 0 && laneOf(m.g) >= 0;
  bindDrag(el, () => m, opts);
  if (key) watch(key, draw);
  if (opts.watch) watch(opts.watch, draw);
  draw();
  return el;
}

// ---- segmented vertical fader
function fader(key, opts = {}) {
  const el = h('div', 'fader');
  const nb = opts.bars || 20;
  el.innerHTML = `<div class="val"></div><div class="bars">${'<i></i>'.repeat(nb)}</div><div class="lab"></div>`;
  const val = el.firstChild;
  const bars = el.querySelectorAll('.bars i');
  const lab = el.lastChild;
  const m = model(key);
  const draw = () => {
    const n = m.get();
    const mod = m.mod();
    const lit = Math.round(clamp(n + (mod || 0), 0, 1) * nb);
    bars.forEach((b, i) => b.classList.toggle('on', i < lit));
    val.textContent = m.text();
    lab.textContent = opts.label || m.label;
    el.classList.toggle('sel', S.sel === key);
  };
  el.draw = draw;
  el.hasMod = () => m.g >= 0 && laneOf(m.g) >= 0;
  bindDrag(el, () => m, { range: 220 });
  watch(key, draw);
  draw();
  return el;
}

// ---- number box (0..100) for sends
function nbox(key) {
  const el = h('div', 'nbox');
  const m = model(key);
  const draw = () => (el.textContent = Math.round(m.get() * 100));
  bindDrag(el, () => m, { range: 200 });
  watch(key, draw);
  draw();
  return el;
}

// ---- button helpers
function btn(text, cls, onclick) {
  const b = h('button', 'b ' + (cls || ''), text);
  b.type = 'button';
  if (onclick) b.addEventListener('click', onclick);
  return b;
}
// toggle bound to an int param (0/1)
function toggle(key, text, cls) {
  const g = keyG(key);
  const b = btn(text, cls, () => setG(g, getG(g) >= 0.5 ? 0 : 1));
  const draw = () => b.classList.toggle('on', getG(g) >= 0.5);
  watch(key, draw);
  draw();
  return b;
}
function chk(text, get, set) {
  const c = h('span', 'chk', `<i></i>${text}`);
  const draw = () => c.classList.toggle('on', !!get());
  c.addEventListener('click', () => {
    set(!get());
    draw();
  });
  draw();
  return c;
}

// ---- popup menu
function menu(items, x, y) {
  closeMenu();
  const mn = h('div', 'menu');
  mn.id = 'menu';
  for (const [text, f] of items) {
    const d = h('div', '', text);
    d.addEventListener('click', () => {
      closeMenu();
      f();
    });
    mn.append(d);
  }
  const r = $('lcd').getBoundingClientRect();
  mn.style.left = (x - r.left) / stageScale + 'px';
  mn.style.top = (y - r.top) / stageScale + 'px';
  $('lcd').append(mn);
  const w = mn.offsetWidth;
  const hh = mn.offsetHeight;
  if (parseFloat(mn.style.left) + w > stageW - 30) mn.style.left = stageW - 30 - w + 'px';
  if (parseFloat(mn.style.top) + hh > stageH - 30) mn.style.top = stageH - 30 - hh + 'px';
  setTimeout(() => addEventListener('pointerdown', closeMenuOut, { once: true }), 0);
}
function closeMenuOut(e) {
  if (!e.target.closest('#menu')) closeMenu();
  else addEventListener('pointerdown', closeMenuOut, { once: true });
}
function closeMenu() {
  const m = $('menu');
  if (m) m.remove();
}
function controlMenu(m, e) {
  const items = [];
  if (m.g >= 0) {
    items.push(['step sequencer', () => { select(m.key); openLane(m.g); }]);
    if (laneOf(m.g) >= 0) items.push(['remove sequencer', () => removeLane(m.g)]);
  }
  items.push(['reset', () => m.set(m.def)]);
  items.push(['assign to perf…', () => assignDialog(m.key)]);
  items.push(['midi learn', () => learnMidi(m.key)]);
  menu(items, e.clientX, e.clientY);
}

// ---- dialog
function dialog(title, body, onClose) {
  closeDialog();
  const d = h('div', 'dlg');
  d.id = 'dlg';
  const inner = h('div');
  const head = h('h3', '', `<span>${title}</span>`);
  head.style.display = 'flex';
  head.style.justifyContent = 'space-between';
  const x = btn('close', 'sm', closeDialog);
  head.append(x);
  inner.append(head, body);
  d.append(inner);
  d.addEventListener('pointerdown', (e) => e.target === d && closeDialog());
  d.onClose = onClose;
  $('lcd').append(d);
  return d;
}
function closeDialog() {
  const d = $('dlg');
  if (d) {
    d.remove();
    if (d.onClose) d.onClose();
    return true;
  }
  return false;
}

// ---- segmented meter
function meterEl(n = 24) {
  const m = h('div', 'meter', '<i></i>'.repeat(n));
  const bars = m.querySelectorAll('i');
  m.set = (x) => {
    const db = x > 1e-5 ? 20 * Math.log10(x) : -100;
    const lit = Math.round(clamp((db + 48) / 48, 0, 1) * n);
    if (m.lit === lit) return;
    m.lit = lit;
    bars.forEach((b, i) => b.classList.toggle('on', i < lit));
  };
  return m;
}
