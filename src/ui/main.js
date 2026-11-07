// fm/dm — page shell: header, pages, stage scaling, frame loop, transport.

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
  ['xmod', () => buildXmod()],
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
  hd.append(h('div', 'logo', 'fm/dm'));
  hd.append(btn('options', 'sm', () => openOptions()), btn('?', 'sm', () => openHelp()));
  hd.append(btn('quick', 'sm', () => openQuick())); // TEMPORARY quick pad
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
// ---- screen colour (saved in this browser). Light colours only, so the dark ink stays readable.
const LCD_COLOURS = [
  ['beige', '#d1c7ac'], ['green', '#a7b58c'], ['grey', '#b4b8ad'], ['amber', '#d4b26a'],
  ['blue', '#9fb6c4'], ['paper', '#d8dccf'], ['rose', '#d4a9a9'],
];
function lcdColour() {
  try { return localStorage.getItem('fmdm.lcd') || LCD_COLOURS[0][1]; } catch { return LCD_COLOURS[0][1]; }
}
function setLcdColour(c, save = true) {
  document.documentElement.style.setProperty('--lcd', c);
  if (save) try { localStorage.setItem('fmdm.lcd', c); } catch {}
}
function openOptions() {
  const body = h('div');
  body.style.display = 'grid';
  body.style.gap = '10px';
  const sw = h('div', 'swatches');
  const picker = colourPicker(lcdColour(), (c) => { setLcdColour(c); mark(); });
  const mark = () => {
    const c = lcdColour().toLowerCase();
    sw.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.c === c));
  };
  for (const [name, c] of LCD_COLOURS) {
    const b = h('button', 'swatch');
    b.title = name;
    b.dataset.c = c;
    b.style.background = c;
    b.onclick = () => { setLcdColour(c); picker.setColour(c); mark(); };
    sw.append(b);
  }
  mark();
  body.append(
    chk('randomise on next bar', () => S.opts.nextBar, (v) => (S.opts.nextBar = v)),
    chk('wild ranges (not drum-safe)', () => S.opts.wild, (v) => (S.opts.wild = v)),
    chk('auto-level drums after randomise', () => S.opts.autoLevel, (v) => {
      S.opts.autoLevel = v;
      pushUndo();
      if (v) autoLevel(); else clearTrims();
      sendAll();
      try { localStorage.setItem('fmdm.autoLevel', v ? '1' : '0'); } catch {}
    }),
    h('div', 'dim', 'version ' + APP_VER),
    h('div', '', 'screen colour'),
    sw,
    picker,
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
  { const t = $('turn'); const b = btn('open quick pad', 'b', () => openQuick()); b.style.marginTop = '20px'; t.innerHTML = '<div>turn your phone sideways</div>'; t.append(b); } // TEMPORARY
  setLcdColour(lcdColour(), false);
  try { if (localStorage.getItem('fmdm.autoLevel') === '0') S.opts.autoLevel = false; } catch {}
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
  // update at startup: check for a new service worker straight away (bypassing the HTTP cache), and when
  // a new one takes over, reload once so the new version is what runs
  if ('serviceWorker' in navigator && /^(https:|http:\/\/localhost)/.test(location.href)) {
    const hadSw = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadSw && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
  }
  window.__fmdm = { S, presetName, presetNameRaw, isRude, NAME_WORDS, applyPreset, BUILTIN_PRESETS, togglePlay, showPage, runRandom, measureHit, NP, P };
}
boot();
