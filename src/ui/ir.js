// fm/dm — impulse responses for the convolution reverb. The factory ones are synthesised here
// (decaying noise shaped per space, with early reflections and damping that darkens the tail);
// your own IR file (wav, aiff, mp3...) can be loaded and is kept in the browser.

const IR_NAMES = ['room', 'studio', 'chamber', 'plate', 'hall', 'cathedral', 'spring', 'gated', 'reverse', 'tin can', 'your ir'];
const IR_USER = IR_NAMES.length - 1;
// [seconds, brightness at start (Hz), brightness at end (Hz), early reflections, width]
const IR_SHAPE = [
  [0.45, 9000, 2500, 0.8, 0.6], // room
  [0.9, 12000, 3500, 0.6, 0.8], // studio
  [1.6, 8000, 2000, 0.7, 0.9], // chamber
  [2.2, 14000, 5000, 0, 1], // plate
  [3.4, 9000, 1500, 0.5, 1], // hall
  [6.5, 6000, 800, 0.4, 1], // cathedral
  [1.8, 7000, 2500, 0, 0.7], // spring
  [0.38, 12000, 6000, 0, 0.9], // gated
  [1.4, 9000, 3000, 0, 0.9], // reverse
  [0.6, 16000, 9000, 0, 0.5], // tin can
];

function makeIR(sr, k) {
  const [sec, b0, b1, early, width] = IR_SHAPE[k];
  const n = Math.round(sec * sr);
  const out = [new Float32Array(n), new Float32Array(n)];
  const r = new Rng(1000 + k);
  for (let c = 0; c < 2; c++) {
    const o = out[c];
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let env;
      if (k === 7) env = t < 0.85 ? 1 : (1 - t) / 0.15; // gated: flat, then cut
      else if (k === 8) env = Math.pow(t, 2.2) * (t > 0.97 ? (1 - t) / 0.03 : 1); // reverse: swells up
      else env = Math.exp((-6.9 * i) / n); // -60 dB over the length
      const fc = b0 * Math.pow(b1 / b0, t);
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      const mono = r.bi(), side = r.bi();
      lp += (mono * (1 - width * 0.5) + (c ? -side : side) * width * 0.5 - lp) * a;
      lp2 += (lp - lp2) * a;
      o[i] = lp2 * env;
    }
    // early reflections: a handful of taps in the first 70 ms
    if (early > 0) {
      const er = new Rng(77 + k * 3 + c);
      for (let j = 0; j < 14; j++) {
        const d = Math.round((0.004 + er.uni() * 0.066) * sr);
        if (d < n) o[d] += (er.uni() < 0.5 ? -1 : 1) * early * (1 - d / (0.07 * sr)) * 0.9;
      }
    }
    // spring: a dispersive "boing" (a falling chirp repeated every 35 ms)
    if (k === 6) {
      const per = Math.round(0.035 * sr);
      for (let rep = 0; rep * per < n; rep++) {
        const g = Math.pow(0.72, rep) * 0.5;
        let ph = 0;
        for (let i = 0; i < per && rep * per + i < n; i++) {
          const f = 4000 * Math.exp(-i / (0.004 * sr)) + 300;
          ph += f / sr;
          o[rep * per + i] += Math.sin(2 * Math.PI * ph) * g * Math.exp(-i / (0.012 * sr));
        }
      }
    }
    // tin can: strong metallic resonances (feedback combs)
    if (k === 9) {
      for (const ms of [1.13, 1.71, 2.37]) {
        const d = Math.round((ms / 1000) * sr);
        for (let i = d; i < n; i++) o[i] += o[i - d] * 0.62;
      }
    }
  }
  // normalise each IR to the same energy, so switching keeps a similar level
  let e = 0;
  for (const o of out) for (let i = 0; i < n; i++) e += o[i] * o[i];
  const g = 1 / Math.sqrt(e / 2 + 1e-9) * 0.35;
  for (const o of out) for (let i = 0; i < n; i++) o[i] *= g;
  return out;
}

// ---- the convolver in the audio graph
let irConv = null;
let irShown = -1; // which IR the convolver holds
let irUser = null; // { name, buf: AudioBuffer }
const irCache = new Map();
function irAttach(c, nd) {
  irConv = c.createConvolver();
  irConv.normalize = false;
  const back = c.createDelay(0.01); // the loop back into the engine needs a delay (one block, ~3 ms)
  back.delayTime.value = 0;
  nd.connect(irConv, 1);
  irConv.connect(back);
  back.connect(nd, 0, 0);
  irShown = -1;
  irLoadStored();
}
function irBuffer(k) {
  if (k === IR_USER) return irUser ? irUser.buf : null;
  if (!irCache.has(k)) {
    const [L, R] = makeIR(ctx.sampleRate, k);
    const b = ctx.createBuffer(2, L.length, ctx.sampleRate);
    b.copyToChannel(L, 0);
    b.copyToChannel(R, 1);
    irCache.set(k, b);
  }
  return irCache.get(k);
}
// called every frame: keep the convolver on the IR the rIr knob points at
function irSync() {
  if (!irConv) return;
  const k = Math.round(S.base[NV_ + M.rIr]);
  const want = k === IR_USER && !irUser ? -2 : k;
  if (want === irShown) return;
  irShown = want;
  irConv.buffer = irBuffer(k);
}
async function irLoadFile(file) {
  try {
    const data = await file.arrayBuffer();
    await irUse(file.name, data.slice(0));
    irStore(file.name, data);
    setG(NV_ + M.rIr, 1);
    setG(NV_ + M.rType, 1);
    redraw('m.rIr');
    redraw('m.rType');
    toast('ir loaded: ' + file.name);
  } catch {
    toast('could not read that file as audio');
  }
}
async function irUse(name, data) {
  if (!ctx) await startAudio();
  const buf = await ctx.decodeAudioData(data);
  // match the factory level: same energy target
  let e = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) e += d[i] * d[i]; }
  const g = (1 / Math.sqrt(e / buf.numberOfChannels + 1e-9)) * 0.35;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
  irUser = { name, buf };
  irShown = -1;
  IR_NAMES[IR_USER] = 'your ir';
}
// your IR is kept in the browser (IndexedDB) so it's there next time
function irDb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open('fmdm', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('ir');
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
function irStore(name, data) {
  irDb().then((db) => db.transaction('ir', 'readwrite').objectStore('ir').put({ name, data }, 'user')).catch(() => {});
}
function irLoadStored() {
  irDb().then((db) => {
    const q = db.transaction('ir').objectStore('ir').get('user');
    q.onsuccess = () => { if (q.result) irUse(q.result.name, q.result.data.slice(0)).catch(() => {}); };
  }).catch(() => {});
}
function irPick() {
  const f = h('input');
  f.type = 'file';
  f.accept = 'audio/*,.wav,.aif,.aiff,.flac,.mp3,.ogg';
  f.addEventListener('change', () => f.files[0] && irLoadFile(f.files[0]));
  f.click();
}
