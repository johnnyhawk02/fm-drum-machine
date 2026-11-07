// fm/dm — TEMPORARY quick pad: a full-screen pop-up with big buttons for every randomiser,
// play, undo and save as preset, for generating presets fast on a phone. Remove when done.

function openQuick() {
  if ($('quick')) return;
  const q = h('div');
  q.id = 'quick';
  const status = h('div', 'qstatus', 'quick pad');
  const say = (t) => (status.textContent = t);
  const grid = h('div', 'qgrid');
  const big = (label, fn, cls) => {
    const b = btn(label, 'b qb ' + (cls || ''), fn);
    grid.append(b);
    return b;
  };
  const play = big(S.playing ? '■ stop' : '▶ play', async () => {
    await togglePlay();
    play.textContent = S.playing ? '■ stop' : '▶ play';
    play.classList.toggle('on', S.playing);
  }, S.playing ? 'on' : '');
  for (const name of R_ORDER) big(RND[name].label, () => { runRandom(name); say(RND[name].label + ' done'); });
  const gm = big('go mental: off', () => {
    S.opts.mental = !S.opts.mental;
    gm.textContent = 'go mental: ' + (S.opts.mental ? 'on' : 'off');
    gm.classList.toggle('on', S.opts.mental);
  }, S.opts.mental ? 'on' : '');
  gm.textContent = 'go mental: ' + (S.opts.mental ? 'on' : 'off');
  big('undo', () => { undo(); say('undone'); });
  big('🎲 name', () => say('next name: ' + rollName()));
  big('save as preset', () => { saveNew(); say('saved ' + curPreset + ' · next: ' + nextName); }, 'save');
  big('close', () => q.remove(), 'close');
  // the installed app is locked to landscape: when the screen is wider than tall on a phone, the pad is
  // turned a quarter so it reads upright with the phone held upright. "flip" turns it the other way.
  const inner = h('div', 'qinner');
  // flip cycles: quarter turn one way, the other way, upright
  big('flip', () => {
    rot = rot === 90 ? -90 : rot === -90 ? 0 : 90;
    try { localStorage.setItem('fmdm.quickRot', String(rot)); } catch {}
    fit();
  }, 'flip');
  let rot = 90;
  try { const v = localStorage.getItem('fmdm.quickRot'); if (v !== null) rot = +v; } catch {}
  // a phone: touch only (no mouse or trackpad) and a short screen. Anything else is a desktop
  const phone = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches && Math.min(screen.width, screen.height) < 600;
  const fit = () => {
    const desk = !phone();
    q.classList.toggle('desk', desk);
    if (desk) {
      inner.style.width = inner.style.height = '';
      inner.style.transform = 'translate(-50%, -50%)';
      return;
    }
    const w = innerWidth, hh = innerHeight;
    const turn = w > hh && rot !== 0;
    inner.style.width = (turn ? hh : w) + 'px';
    inner.style.height = (turn ? w : hh) + 'px';
    inner.style.transform = `translate(-50%, -50%)${turn ? ` rotate(${rot}deg)` : ''}`;
  };
  // on a desktop it's a small box: a click outside closes it
  q.addEventListener('pointerdown', (e) => { if (e.target === q && q.classList.contains('desk')) q.remove(); });
  inner.append(status, grid);
  q.append(inner);
  document.body.append(q);
  fit();
  addEventListener('resize', fit);
}
