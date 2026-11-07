// fm dm — colour picker in the style of a paint program: a saturation/brightness square,
// a hue strip, new/old preview, and H S B, R G B and hex fields that all stay in step.

function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hh * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
const toHex = (rgb) => '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('');
function fromHex(s) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(s.trim());
  if (!m) return null;
  let x = m[1];
  if (x.length === 3) x = x.replace(/./g, (c) => c + c);
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
}

// start: '#rrggbb'; onChange(hex) runs while dragging
function colourPicker(start, onChange) {
  let [hu, sa, va] = rgbToHsv(...(fromHex(start) || [167, 181, 140]));
  const old = start;
  const root = h('div', 'cp');
  const sq = h('div', 'cp-sq');
  const sqDot = h('i');
  sq.append(h('div', 'cp-w'), h('div', 'cp-b'), sqDot);
  const strip = h('div', 'cp-hue');
  const hueMark = h('i');
  strip.append(hueMark);
  const side = h('div', 'cp-side');
  const prev = h('div', 'cp-prev');
  const pNew = h('div');
  const pOld = h('div');
  pOld.style.background = old;
  pOld.title = 'back to the old colour';
  prev.append(h('span', 'dim', 'new'), pNew, pOld, h('span', 'dim', 'old'));
  const fields = h('div', 'cp-fields');
  const mk = (lab, max, unit) => {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = 0;
    inp.max = max;
    const row = h('label', '', `<span>${lab}</span>`);
    row.append(inp, h('span', 'dim', unit || ''));
    fields.append(row);
    return inp;
  };
  const fH = mk('H', 359, '°'), fS = mk('S', 100, '%'), fB = mk('B', 100, '%');
  const fR = mk('R', 255), fG = mk('G', 255), fBl = mk('B', 255);
  const hex = document.createElement('input');
  hex.className = 'cp-hex';
  hex.maxLength = 7;
  const hexRow = h('label', '', '<span>#</span>');
  hexRow.append(hex);
  side.append(prev, fields, hexRow);
  root.append(sq, strip, side);

  function draw(skip) {
    const rgb = hsvToRgb(hu, sa, va);
    const hx = toHex(rgb);
    sq.style.background = `hsl(${hu}, 100%, 50%)`;
    sqDot.style.left = sa * 100 + '%';
    sqDot.style.top = (1 - va) * 100 + '%';
    hueMark.style.top = (1 - hu / 360) * 100 + '%';
    pNew.style.background = hx;
    if (skip !== 'hsb') { fH.value = Math.round(hu); fS.value = Math.round(sa * 100); fB.value = Math.round(va * 100); }
    if (skip !== 'rgb') [fR.value, fG.value, fBl.value] = rgb;
    if (skip !== 'hex') hex.value = hx.slice(1);
    return hx;
  }
  const commit = (skip) => onChange(draw(skip));
  const drag = (el, fn) => el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const go = (ev) => {
      const r = el.getBoundingClientRect();
      fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
      commit();
    };
    go(e);
    const up = () => { el.removeEventListener('pointermove', go); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', go);
    el.addEventListener('pointerup', up);
  });
  drag(sq, (x, y) => { sa = x; va = 1 - y; });
  drag(strip, (x, y) => { hu = Math.min(359.9, (1 - y) * 360); });
  const num = (inp, max) => clamp(+inp.value || 0, 0, max);
  for (const f of [fH, fS, fB]) f.oninput = () => { hu = num(fH, 359); sa = num(fS, 100) / 100; va = num(fB, 100) / 100; commit('hsb'); };
  for (const f of [fR, fG, fBl]) f.oninput = () => { [hu, sa, va] = rgbToHsv(num(fR, 255), num(fG, 255), num(fBl, 255)); commit('rgb'); };
  hex.oninput = () => { const c = fromHex(hex.value); if (c) { [hu, sa, va] = rgbToHsv(...c); commit('hex'); } };
  pOld.onclick = () => { [hu, sa, va] = rgbToHsv(...fromHex(old)); commit(); };
  // keep the picker in step when a swatch is clicked
  root.setColour = (c) => { const x = fromHex(c); if (x) { [hu, sa, va] = rgbToHsv(...x); draw(); } };
  for (const el of root.querySelectorAll('input')) el.addEventListener('keydown', (e) => e.stopPropagation());
  draw();
  return root;
}
