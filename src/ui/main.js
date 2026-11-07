// fm dm — page shell: header, pages, stage scaling, frame loop, transport.

let stageScale = 1;
let stageW = 1440;
let stageH = 900;
// The page is laid out in design pixels (1440x900 at scale 1). It scales with the window, and the
// spare width or height goes to the layout (the right-hand pages widen, the meters and the
// sequencer strip grow taller) instead of black bars, up to 2200x1300 design pixels.
function fitStage() {
  const st = $('stage');
  const vw = $('view').clientWidth || innerWidth;
  const vh = $('view').clientHeight || innerHeight;
  stageScale = Math.min(vw / 1440, vh / 900);
  stageW = Math.min(2200, vw / stageScale);
  stageH = Math.min(1300, vh / stageScale);
  st.style.width = stageW + 'px';
  st.style.height = stageH + 'px';
  st.style.transform = `translate(-50%, -50%) scale(${stageScale})`;
  st.style.transformOrigin = '50% 50%';
}

const PAGES = [
  ['beat', () => buildBeat()],
  ['voice', () => (typeof buildVoice === 'function' ? buildVoice() : soon('voice'))],
  ['fx', () => (typeof buildFx === 'function' ? buildFx() : soon('fx'))],
  ['mix', () => (typeof buildMix === 'function' ? buildMix() : soon('mix'))],
  ['mstr', () => (typeof buildMstr === 'function' ? buildMstr() : soon('mstr'))],
  ['prst', () => (typeof buildPrst === 'function' ? buildPrst() : soon('prst'))],
];
function soon(name) {
  return h('div', 'dim', `<h3>${name}</h3><p style="font-size:22px">coming next</p>`);
}
const pageEls = {};
let curPage = 'beat';
function showPage(name) {
  curPage = name;
  const page = $('page');
  if (!pageEls[name]) {
    const wrap = h('div');
    wrap.style.display = 'contents';
    wrap.append(PAGES.find((p) => p[0] === name)[1]());
    pageEls[name] = wrap;
  }
  page.innerHTML = '';
  page.append(pageEls[name]);
  document.querySelectorAll('#tabs .b').forEach((b) => b.classList.toggle('on', b.dataset.p === name));
}
function buildTabs() {
  const t = $('tabs');
  for (const [name] of PAGES) {
    const b = btn(name, '', () => showPage(name));
    b.dataset.p = name;
    t.append(b);
  }
}

// ---- transport
async function togglePlay() {
  await startAudio();
  S.playing = !S.playing;
  post({ t: S.playing ? 'play' : 'stop' });
  $('play').classList.toggle('on', S.playing);
  $('play').innerHTML = S.playing ? '■ stop' : '▶ play';
}

// ---- header
function buildHeader() {
  const hd = $('hdr');
  hd.innerHTML = '';
  hd.append(h('div', 'logo', 'fm dm'));
  hd.append(btn('options', 'sm', () => openOptions()), btn('?', 'sm', () => openHelp()));
  const rnd = h('div', 'rnd');
  rnd.id = 'rnd';
  hd.append(rnd);
  if (typeof buildRandomisers === 'function') buildRandomisers(rnd);
  hd.append(h('div', 'sp'));
  const play = btn('▶ play', 'big play', togglePlay);
  play.id = 'play';
  const rec = btn('● rec', 'big', () => (typeof openRecorder === 'function' ? openRecorder() : toast('recording comes later')));
  rec.id = 'rec';
  hd.append(play, rec);
}
function openOptions() {
  const body = h('div');
  body.style.display = 'grid';
  body.style.gap = '10px';
  body.append(
    chk('randomise on next bar', () => S.opts.nextBar, (v) => (S.opts.nextBar = v)),
    chk('wild ranges (not drum-safe)', () => S.opts.wild, (v) => (S.opts.wild = v)),
  );
  dialog('options', body);
}

// ---- frame loop
let lastStep = -2;
function frame() {
  requestAnimationFrame(frame);
  const st = S.status;
  drawMeters();
  if (typeof drawMasterMeters === 'function') drawMasterMeters();
  if (!st) return;
  if (st.step !== lastStep) {
    lastStep = st.step;
    redraw('step');
  }
  if (st.playing) {
    for (const ln of S.lanes) if (ln) redraw(gKey(ln.g));
    const seq = $('seq');
    if (seq.draw) seq.draw();
  }
}

function boot() {
  fitStage();
  addEventListener('resize', fitStage);
  addEventListener('orientationchange', () => setTimeout(fitStage, 250));
  if (window.visualViewport) visualViewport.addEventListener('resize', fitStage);
  buildHeader();
  buildPerf();
  buildSeq();
  buildMutes();
  buildTabs();
  regen(false);
  showPage('beat');
  if (typeof bindKeys === 'function') bindKeys();
  if (typeof initMidi === 'function') initMidi();
  requestAnimationFrame(frame);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  if ('serviceWorker' in navigator && /^(https:|http:\/\/localhost)/.test(location.href)) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__fmdm = { S, applyPreset, BUILTIN_PRESETS, togglePlay, showPage };
}
boot();
