// fm/dm — keyboard: space play, 1-8 randomisers, u undo, z..n mutes, a..h echo mutes, q..y reverb mutes,
// shift+1-6 voice page, [ ] pages, o presets, / search, ? help, esc closes, arrows turn the selected knob.

function bindKeys() {
  addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (e.key === 'Escape') {
      if (!closeDialog()) closeMenu();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (digit && e.shiftKey) {
      const v = +digit[1] - 1;
      if (v < 6) showVoice(v);
      return;
    }
    if (digit) {
      const i = +digit[1] - 1;
      if (i < R_ORDER.length) runRandom(R_ORDER[i]);
      return;
    }
    if (e.key === '?') return openHelp();
    if (e.key === '/') {
      e.preventDefault();
      showPage('prst');
      setTimeout(() => prstSearch && prstSearch.focus(), 0);
      return;
    }
    if (k === 'o') return showPage('prst');
    if (k === 'u') return undo();
    if (e.key === '[' || e.key === ']') {
      const names = PAGES.map((p) => p[0]);
      const i = names.indexOf(curPage);
      showPage(names[(i + (e.key === ']' ? 1 : names.length - 1)) % names.length]);
      return;
    }
    const tog = (id) => setG(NV_ + M[id], getG(NV_ + M[id]) >= 0.5 ? 0 : 1);
    let i = MUTE_KEYS.indexOf(k);
    if (i >= 0) return tog('mute' + i);
    i = ECHO_KEYS.indexOf(k);
    if (i >= 0) return tog('eMute' + i);
    i = VERB_KEYS.indexOf(k);
    if (i >= 0) return tog('rMute' + i);
    // presets page: up/down loads the previous/next preset in the list
    if (curPage === 'prst' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      return prstStep(e.key === 'ArrowDown' ? 1 : -1);
    }
    if (e.key.startsWith('Arrow') && S.sel) {
      e.preventDefault();
      const m = model(S.sel);
      nudge(m, e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1, e.shiftKey);
    }
  });
}

// ---- help, in the same LCD look
const HELP = [
  ...(typeof HOST !== 'undefined' && HOST ? [] : [['play', 'space plays and stops. rec records a wav: free, or an exact loop of 1 to 128 bars starting on the next bar.']]),
  ...(typeof HOST !== 'undefined' && HOST ? [] : [['visualiser', 'click the fm/dm logo for a full-screen picture that moves with the drums. matrix patches each drum (dr1 to hh) to the picture: click a cell to patch it, drag up or down for the amount. randomise picture (or enter) makes a new patch and always leaves the mirror on. randomise everything randomises the sounds, rhythm, fx, mix, xmod and motion. esc or x closes.']]),
  ['perf', 'the 24 knobs on the left are midi cc 1 to 24 on any channel. right-click any knob or fader to assign it to a perf knob, give it a step sequencer, or reset it. double-click resets.'],
  ['step sequencer', 'click a knob, then paint steps in the strip under perf. length 2 to 64 (pages of 16), slew, speed (a 16th up to 8 bars a step), depth, shapes and randoms. the knob ring shows its movement as a lit arc.'],
  ['randomise', '1 everything, 2 kit, 3 alter, 4 pattern, 5 xmod, 6 random fx, 7 alter fx, 8 motion, u undo. drag a button up or down to set its depth. hold it for its ranges and chances. right-click (or long-press) a drum on the voice page to randomise just that drum. options: randomise on next bar, wild ranges, auto-level.'],
  ['mutes', 'z x c v b n mute the drums. a s d f g h mute echo sends, q w e r t y reverb sends. mutes act on notes, so tails ring on.'],
  ['pages', '[ and ] step through beat, voice, fx, xmod, mix, mstr, prst. shift+1 to 6 opens a drum on the voice page. o presets, / search presets.'],
  ['knobs', 'drag up and down (shift for fine), scroll, or click then use the arrow keys.'],
  ['beat', 'genre, beat, energy, fills and density make the pattern. rush rolls one drum faster near the end of every n bars while the others drop out and a high-pass rises along the rush curve.'],
  ['midi', 'cc 1-24 perf knobs, cc 25-28 the selected sequencer length, slew, speed, depth. right-click a knob and pick midi learn to map your own cc.'],
];
function openHelp() {
  const body = h('div');
  body.style.cssText = 'display:grid;grid-template-columns:170px 1fr;gap:8px 18px;font-size:21px;max-width:860px';
  for (const [a, b] of HELP) body.append(h('b', '', a.toUpperCase()), h('div', '', b));
  dialog('help', body);
}
