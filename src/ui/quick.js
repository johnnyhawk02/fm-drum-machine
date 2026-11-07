// fm dm — TEMPORARY quick pad: a full-screen pop-up with big buttons for every randomiser,
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
  big('undo', () => { undo(); say('undone'); });
  big('save as preset', () => { saveNew(); say('saved ' + curPreset); }, 'save');
  big('close', () => q.remove(), 'close');
  // the installed app is locked to landscape: when the screen is wider than tall on a phone, the pad is
  // turned a quarter so it reads upright with the phone held upright. "flip" turns it the other way.
  const inner = h('div', 'qinner');
  big('flip', () => {
    rot = rot === 90 ? -90 : 90;
    try { localStorage.setItem('fmdm.quickRot', String(rot)); } catch {}
    fit();
  });
  let rot = 90;
  try { rot = +(localStorage.getItem('fmdm.quickRot') || 90); } catch {}
  const fit = () => {
    const w = innerWidth, hh = innerHeight;
    const turn = w > hh && matchMedia('(pointer: coarse)').matches;
    inner.style.width = (turn ? hh : w) + 'px';
    inner.style.height = (turn ? w : hh) + 'px';
    inner.style.transform = `translate(-50%, -50%)${turn ? ` rotate(${rot}deg)` : ''}`;
  };
  inner.append(status, grid);
  q.append(inner);
  document.body.append(q);
  fit();
  addEventListener('resize', fit);
}
