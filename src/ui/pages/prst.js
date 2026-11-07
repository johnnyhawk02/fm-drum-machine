// fm dm — PRST page: presets saved in the browser under two-word alien names, favourites, search,
// save new / save over, export / import, built-in presets. Loading while playing waits for the next bar.

const PRESET_V = 1;
const LS_KEY = 'fmdm.presets';
let curPreset = null; // name of the loaded preset
function lsGet() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}
function lsSet(list) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    toast('could not save (storage full or blocked)');
  }
}
const r4 = (x) => +x.toPrecision(5);
function capture(name) {
  const lanes = [];
  S.lanes.forEach((ln) => ln && lanes.push({ key: gKey(ln.g), steps: Array.from(ln.steps.slice(0, ln.len), r4), len: ln.len, slew: r4(ln.slew), speed: ln.speed, depth: r4(ln.depth), groove: ln.groove }));
  const voices = [];
  for (let v = 0; v < 6; v++) {
    const o = {};
    for (const p of PARAMS) o[p.id] = r4(S.base[v * NP + p.i]);
    voices.push(o);
  }
  const master = {};
  for (const p of MPARAMS) master[p.id] = r4(S.base[NV_ + p.i]);
  const pat = [];
  for (let t = 0; t < 6; t++) {
    const row = [];
    for (let k = 0; k < MAX_STEPS; k++) {
      const i = t * MAX_STEPS + k;
      row.push(S.vel[i] ? S.vel[i] + S.flag[i] * 128 : 0);
    }
    while (row.length && !row[row.length - 1]) row.pop();
    pat.push(row);
  }
  return { v: PRESET_V, name, ts: Date.now(), voices, master, pat, lanes, gen: S.gen, perf: S.perf };
}
function applyPreset(pr) {
  if (!pr || pr.v !== PRESET_V) return toast('unknown preset format');
  pushUndo();
  for (let v = 0; v < 6; v++) for (const p of PARAMS) S.base[v * NP + p.i] = pr.voices[v]?.[p.id] ?? defaultFor(v * NP + p.i);
  for (const p of MPARAMS) S.base[NV_ + p.i] = pr.master?.[p.id] ?? p.def;
  S.vel.fill(0);
  S.flag.fill(0);
  (pr.pat || []).forEach((row, t) => row.forEach((x, k) => {
    S.vel[t * MAX_STEPS + k] = x & 127;
    S.flag[t * MAX_STEPS + k] = x >> 7;
  }));
  S.lanes = new Array(NUM_LANES).fill(null);
  (pr.lanes || []).slice(0, NUM_LANES).forEach((ln, l) => {
    const g = keyG(ln.key);
    if (g < 0) return;
    const steps = new Float32Array(MAX_STEPS);
    steps.set(ln.steps.slice(0, MAX_STEPS));
    S.lanes[l] = { g, steps, len: ln.len, slew: ln.slew, speed: ln.speed, depth: ln.depth, groove: ln.groove };
  });
  if (pr.gen) S.gen = { ...S.gen, ...pr.gen, density: pr.gen.density ? pr.gen.density.slice() : S.gen.density };
  if (pr.perf) pr.perf.forEach((k, i) => k !== S.perf[i] && setPerf(i, k));
  if (S.opts.autoLevel) autoLevel(); // the sound is settled: even out each drum before its fader
  curPreset = pr.name;
  const wait = S.playing;
  sendAll(wait);
  redraw('pattern');
  redraw('preset');
  toast(wait ? `${pr.name}: on next bar` : pr.name);
}
function allPresets() {
  const mine = lsGet();
  const names = new Set(mine.map((p) => p.name));
  return [...mine.map((p) => ({ ...p, mine: true })), ...BUILTIN_PRESETS.filter((p) => !names.has(p.name)).map((p) => ({ ...p, builtin: true }))];
}
function saveNew() {
  const list = lsGet();
  let name;
  do name = alienName((Math.random() * 1e9) | 0);
  while (list.some((p) => p.name === name));
  list.unshift(capture(name));
  lsSet(list);
  curPreset = name;
  redraw('preset');
  toast('saved ' + name);
}
function saveOver() {
  if (!curPreset) return saveNew();
  const list = lsGet();
  const i = list.findIndex((p) => p.name === curPreset);
  const old = i >= 0 ? list[i] : BUILTIN_PRESETS.find((p) => p.name === curPreset);
  const pr = capture(curPreset);
  if (old && old.fav) pr.fav = true;
  if (i >= 0) list[i] = pr;
  else list.unshift(pr);
  lsSet(list);
  redraw('preset');
  toast('saved over ' + curPreset);
}
function toggleFav(name) {
  const list = lsGet();
  let p = list.find((x) => x.name === name);
  if (!p) {
    const b = BUILTIN_PRESETS.find((x) => x.name === name);
    if (!b) return;
    p = { ...b };
    list.push(p);
  }
  p.fav = !p.fav;
  lsSet(list);
  redraw('preset');
}
function deletePreset(name) {
  lsSet(lsGet().filter((p) => p.name !== name));
  redraw('preset');
}
function exportPresets() {
  const data = JSON.stringify({ app: 'fm dm', v: PRESET_V, presets: lsGet() }, null, 1);
  const a = h('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = 'fm-dm-presets.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importPresets(files) {
  for (const f of files) {
    f.text().then((t) => {
      try {
        const got = (JSON.parse(t).presets || []).filter((p) => p.v === PRESET_V && p.name && p.voices);
        const list = lsGet();
        for (const p of got) {
          const i = list.findIndex((x) => x.name === p.name);
          if (i >= 0) list[i] = p;
          else list.push(p);
        }
        lsSet(list);
        redraw('preset');
        toast(`imported ${got.length} preset${got.length === 1 ? '' : 's'}`);
      } catch {
        toast('not a presets file');
      }
    });
  }
}

let prstSearch = null;
function buildPrst() {
  const page = h('div');
  page.style.display = 'contents';
  const top = h('div', 'row');
  top.style.alignItems = 'center';
  const cur = h('div', '', '');
  cur.style.cssText = 'font-size:24px;flex:2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  // TEMPORARY: quick content generation, randomise everything right next to save
  top.append(cur, btn('rnd everything', '', () => runRandom('everything')), btn('save new', '', saveNew), btn('save over', '', saveOver));
  const row2 = h('div', 'row');
  row2.style.alignItems = 'center';
  const search = h('input');
  search.type = 'search';
  search.placeholder = 'search';
  search.id = 'psearch';
  search.style.flex = '3';
  prstSearch = search;
  let favOnly = false;
  const favB = btn('★ only', 'sm', () => { favOnly = !favOnly; favB.classList.toggle('on', favOnly); draw(); });
  const imp = h('label', 'b sm', 'import');
  imp.style.display = 'inline-grid';
  imp.style.placeItems = 'center';
  const file = h('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.multiple = true;
  file.hidden = true;
  file.addEventListener('change', () => importPresets(file.files));
  imp.append(file);
  row2.append(search, favB, imp, btn('export', 'sm', exportPresets));
  const list = h('div');
  list.style.cssText = 'flex:1;min-height:0;overflow:auto;border-top:2px solid var(--ink);padding-top:6px';
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = list.querySelector('[data-name]');
      if (first) first.click();
    }
    e.stopPropagation();
  });
  function draw() {
    cur.textContent = curPreset ? '» ' + curPreset : '» (unsaved)';
    const q = search.value.trim().toLowerCase();
    const items = allPresets().filter((p) => (!favOnly || p.fav) && (!q || p.name.includes(q) || (p.gen?.genre || '').includes(q)))
      .sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));
    list.innerHTML = '';
    for (const p of items) {
      const r = h('div');
      r.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:22px;padding:1px 4px;cursor:pointer';
      if (p.name === curPreset) r.style.background = 'var(--dim)';
      const star = h('span', '', p.fav ? '★' : '☆');
      star.style.width = '22px';
      star.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(p.name); });
      const nm = h('span', '', p.name);
      nm.style.flex = '1';
      const info = h('span', 'dim', `${p.gen?.genre || ''} ${Math.round(p.master?.bpm || 0)} ${p.builtin ? '· built-in' : ''}`);
      info.style.fontSize = '17px';
      r.append(star, nm, info);
      if (p.mine) {
        const del = btn('x', 'xs', (e) => { e.stopPropagation(); if (confirm(`delete ${p.name}?`)) deletePreset(p.name); });
        r.append(del);
      }
      r.dataset.name = p.name;
      r.addEventListener('click', () => applyPreset(p));
      list.append(r);
    }
    if (!items.length) list.append(h('div', 'dim', '<span style="font-size:20px">no presets yet: save new keeps everything (kit, beat, fx, mix, sequencers)</span>'));
  }
  watch('preset', draw);
  page.append(top, row2, list);
  draw();
  return page;
}
