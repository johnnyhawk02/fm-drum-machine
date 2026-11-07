// fm dm — page state, audio connection, control registry, formatting, undo.

const $ = (id) => document.getElementById(id);
function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const NV_ = NUM_VOICES * NP;
const SHORT = ['dr1', 'dr2', 'dr3', 'sn', 'cy', 'hh'];

// ---- state
const S = {
  base: new Float32Array(NV_ + MP),
  vel: new Uint8Array(NUM_VOICES * MAX_STEPS),
  flag: new Uint8Array(NUM_VOICES * MAX_STEPS),
  lanes: new Array(NUM_LANES).fill(null), // {g, steps, len, slew, speed, depth, groove}
  gen: { genre: 'techno', beat: 0, energy: 0.5, fills: 0.3, density: [1, 1, 1, 1, 1, 1], seed: 1 },
  perf: [],
  sel: null, // selected control key
  playing: false,
  status: null,
  opts: { nextBar: false, wild: false },
};
S.base.set(kitToArray(INIT_KIT), 0);
S.base.set(defaultMaster(), NV_);

// ---- keys <-> flat indices
function keyG(key) {
  if (key.startsWith('m.')) return NV_ + M[key.slice(2)];
  const m = /^v(\d)\.(\w+)$/.exec(key);
  return m ? +m[1] * NP + P[m[2]] : -1;
}
function gKey(g) {
  if (g >= NV_) return 'm.' + MPARAMS[g - NV_].id;
  return `v${Math.floor(g / NP)}.${PARAMS[g % NP].id}`;
}
function specOf(g) {
  return g >= NV_ ? MPARAMS[g - NV_] : PARAMS[g % NP];
}

// ---- audio
let ctx = null;
let node = null;
const outbox = [];
function post(m) {
  if (node) node.port.postMessage(m);
  else outbox.push(m);
}
async function startAudio() {
  if (ctx) return ctx.resume();
  ctx = new AudioContext({ latencyHint: 'interactive' });
  const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }));
  await ctx.audioWorklet.addModule(url);
  node = new AudioWorkletNode(ctx, 'elixir-fm', { numberOfInputs: 0, outputChannelCount: [2] });
  node.connect(ctx.destination);
  node.port.onmessage = (ev) => onWorklet(ev.data);
  post({ t: 'all', base: S.base });
  post({ t: 'pat', vel: S.vel, flag: S.flag });
  S.lanes.forEach((ln, l) => ln && post(laneMsg(l)));
  while (outbox.length) node.port.postMessage(outbox.shift());
}
const listeners = { st: [], bar: [], rec: [] };
function on(t, f) {
  listeners[t].push(f);
}
function onWorklet(m) {
  if (m.t === 'st') S.status = m;
  for (const f of listeners[m.t] || []) f(m);
}

// ---- control registry: key -> redraw functions
const views = new Map();
function watch(key, f) {
  if (!views.has(key)) views.set(key, []);
  views.get(key).push(f);
}
function redraw(key) {
  for (const f of views.get(key) || []) f();
}
function redrawAll() {
  for (const fs of views.values()) for (const f of fs) f();
}

// ---- engine parameter get/set
function getG(g) {
  return S.base[g];
}
function setG(g, x, atBar) {
  const p = specOf(g);
  x = clamp(x, p.min, p.max);
  if (p.curve === 'int') x = Math.round(x);
  S.base[g] = x;
  post({ t: 'set', g, x, atBar });
  redraw(gKey(g));
  dirty();
}
function sendAll(atBar) {
  post({ t: 'bundle', msgs: [{ t: 'all', base: S.base.slice() }, { t: 'pat', vel: S.vel.slice(), flag: S.flag.slice() }, ...laneMsgs()], atBar });
  redrawAll();
}
function sendPattern(atBar) {
  post({ t: 'pat', vel: S.vel.slice(), flag: S.flag.slice(), atBar });
  redraw('pattern');
  dirty();
}

// ---- lanes (knob step sequencers)
function laneOf(g) {
  return S.lanes.findIndex((ln) => ln && ln.g === g);
}
function laneMsg(l) {
  const ln = S.lanes[l];
  if (!ln) return { t: 'lane', l, g: -1 };
  return { t: 'lane', l, g: ln.g, steps: ln.steps.slice(), len: ln.len, slew: ln.slew, speed: ln.speed, depth: ln.depth, groove: ln.groove };
}
function laneMsgs() {
  return S.lanes.map((_, l) => laneMsg(l));
}
function newLane(g) {
  let l = laneOf(g);
  if (l >= 0) return l;
  l = S.lanes.findIndex((x) => !x);
  if (l < 0) return -1;
  S.lanes[l] = { g, steps: new Float32Array(MAX_STEPS), len: 16, slew: 0, speed: 0, depth: 0.5, groove: true };
  return l;
}
function sendLane(l) {
  post(laneMsg(l));
  const ln = S.lanes[l];
  if (ln) redraw(gKey(ln.g));
  redraw('lane');
  dirty();
}

// ---- formatting
const NAMES = {
  algo: ALGOS, fType: FILTER_TYPES, nType: NOISE_TYPES, clkType: CLICK_TYPES, lShape: LFO_SHAPES, lDest: LFO_DESTS, lDest2: LFO_DESTS,
  eDiv: ECHO_DIVS.map((d) => d[0]), mdType: DIST_TYPES, swType: GROOVES, rushVoice: SHORT,
  rushEvery: RUSH_EVERY.map((b) => (b ? `${b} bar` : 'off')),
};
const ONOFF = new Set(['fxA', 'fxB', 'fxC', 'fxD', 'lRetrig', 'eSync', 'ePing']);
function fmt(g, x = getG(g)) {
  const p = specOf(g);
  const id = p.id;
  if (NAMES[id]) return NAMES[id][Math.round(x)] ?? '';
  if (ONOFF.has(id) || /^(mute|solo|eMute|rMute)\d$/.test(id)) return x >= 0.5 ? 'on' : 'off';
  if (/^xt\d\d$/.test(id)) return XF_TARGETS[Math.round(x)];
  if (id === 'bpm') return x.toFixed(0) + ' bpm';
  if (id === 'tune' || id === 'rmHz' || /Cut$|Tone$|^mHp$|rushHp/.test(id)) return x >= 1000 ? (x / 1000).toFixed(x >= 10000 ? 1 : 2) + 'k' : x.toFixed(0) + (id === 'tune' ? 'hz' : '');
  if (/^r[ABCD]$/.test(id)) return x.toFixed(x < 10 ? 3 : 2);
  if (id === 'pAmt') return x.toFixed(1) + 'st';
  if (id === 'rDecay') return x.toFixed(1) + 's';
  if (/^(a|d)[ABCD]$|Dec|Atk|Hold|Ms|Pre|^aDec2$|Space$|Rel$|^cAtk$/.test(id) && p.max > 1) return x >= 1000 ? (x / 1000).toFixed(2) + 's' : x.toFixed(x < 10 ? 1 : 0) + 'ms';
  if (id === 'cThr') return x.toFixed(0) + 'db';
  if (id === 'cMake') return '+' + x.toFixed(0) + 'db';
  if (id === 'cRatio') return x.toFixed(1) + ':1';
  if (id === 'bits') return x.toFixed(1);
  if (id === 'srDiv') return 'x' + x.toFixed(1);
  if (id === 'lRate') return x.toFixed(2) + 'hz';
  if (id === 'patLen' || id === 'rushLen' || id === 'rushRate') return x.toFixed(0);
  if (p.curve === 'bip') return (x > 0 ? '+' : '') + Math.round(x * 100);
  if (id === 'eFine') return (x > 0 ? '+' : '') + x.toFixed(2) + '%';
  if (p.max <= 2 && p.min >= 0) return Math.round(x * 100) + '%';
  return x.toFixed(0);
}
function labelOf(g) {
  const p = specOf(g);
  return p.label;
}
// long name, used by the seq strip and perf assignment
function fullName(key) {
  const g = keyG(key);
  if (g < 0) return GEN_SPECS[key.slice(4)]?.label || key;
  if (g >= NV_) return labelOf(g);
  return SHORT[Math.floor(g / NP)] + ' ' + labelOf(g);
}

// ---- generator options (not engine params) as knob specs
const GEN_SPECS = {
  genre: { label: 'genre', steps: GENRE_NAMES.length, get: () => GENRE_NAMES.indexOf(S.gen.genre), set: (i) => (S.gen.genre = GENRE_NAMES[i]), fmt: (i) => GENRE_NAMES[i], regen: true },
  beat: { label: 'beat', steps: 64, get: () => S.gen.beat, set: (i) => (S.gen.beat = i), fmt: (i) => alienName(i * 7919 + 13).split(' ')[0] + ' ' + (i + 1), regen: true },
  energy: { label: 'energy', get: () => S.gen.energy, set: (x) => (S.gen.energy = x), fmt: (x) => Math.round(x * 100) + '%', regen: true, def: 0.5 },
  fills: { label: 'fills', get: () => S.gen.fills, set: (x) => (S.gen.fills = x), fmt: (x) => Math.round(x * 100) + '%', regen: true, def: 0.3 },
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((t) => [`dens${t}`, { label: SHORT[t], max: 2, get: () => S.gen.density[t], set: (x) => (S.gen.density[t] = x), fmt: (x) => Math.round(x * 100) + '%', regen: true, def: 1 }])),
};

// ---- two-word alien names (for presets and beats)
const SYL_A = ['zor', 'qua', 'vex', 'mib', 'tal', 'kry', 'oon', 'fla', 'gri', 'xu', 'yel', 'bo', 'nir', 'spu', 'dra', 'ix', 'lum', 'pek', 'saa', 'tro'];
const SYL_B = ['nak', 'lix', 'mor', 'pa', 'zee', 'tub', 'ga', 'ron', 'vi', 'dok', 'sel', 'ump', 'aar', 'ek', 'fo', 'quo', 'wis', 'yb', 'zz', 'lo'];
function alienName(seed) {
  const r = new Rng((seed * 2654435761) >>> 0);
  const w = () => {
    const n = 2 + (r.next() % 2);
    let s = '';
    for (let i = 0; i < n; i++) s += (i % 2 ? SYL_B : SYL_A)[r.next() % 20];
    return s;
  };
  return w() + ' ' + w();
}

// ---- undo (snapshots of everything that randomisers touch)
const undoStack = [];
function snapshot() {
  return { base: S.base.slice(), vel: S.vel.slice(), flag: S.flag.slice(), gen: JSON.parse(JSON.stringify(S.gen)),
    lanes: S.lanes.map((ln) => ln && { ...ln, steps: ln.steps.slice() }) };
}
function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 50) undoStack.shift();
  redraw('undo');
}
function restore(s, atBar) {
  S.base.set(s.base);
  S.vel.set(s.vel);
  S.flag.set(s.flag);
  S.gen = s.gen;
  S.lanes = s.lanes;
  sendAll(atBar);
}
function undo() {
  const s = undoStack.pop();
  if (s) restore(s, false);
  redraw('undo');
}

// ---- dirty marker + toast
let dirtyFlag = false;
function dirty() {
  dirtyFlag = true;
}
let toastT = 0;
function toast(msg) {
  let t = $('toast');
  if (!t) {
    t = h('div', 'toast');
    t.id = 'toast';
    $('lcd').append(t);
  }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 1800);
}

// ---- pattern generation
function regen(atBar) {
  const g = generate({ ...S.gen, accent: getG(NV_ + M.accent), len: getG(NV_ + M.patLen) });
  S.vel.set(g.vel);
  S.flag.set(g.flag);
  sendPattern(atBar ?? (S.opts.nextBar && S.playing));
}
