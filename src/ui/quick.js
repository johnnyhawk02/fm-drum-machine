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
  q.append(status, grid);
  document.body.append(q);
}
