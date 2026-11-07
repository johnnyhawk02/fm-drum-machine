// Elixir FM — mutes: a column per drum with meter, reverb and echo send boxes (each with a mute square)
// and the drum's mute. Mutes act on notes, so tails ring on.

const MUTE_KEYS = ['z', 'x', 'c', 'v', 'b', 'n'];
const ECHO_KEYS = ['a', 's', 'd', 'f', 'g', 'h'];
const VERB_KEYS = ['q', 'w', 'e', 'r', 't', 'y'];
const muteMeters = [];

function sendRow(col, label, sendKey, muteKey) {
  col.append(h('div', 'lbl', label));
  const box = nbox(sendKey);
  const g = keyG(muteKey);
  const sq = h('button', 'sq');
  sq.type = 'button';
  sq.title = 'mute ' + label;
  sq.addEventListener('click', () => setG(g, getG(g) >= 0.5 ? 0 : 1));
  const draw = () => {
    const on = getG(g) >= 0.5;
    sq.classList.toggle('on', on);
    box.classList.toggle('muted', on);
  };
  watch(muteKey, draw);
  draw();
  col.append(box, sq);
}

function buildMutes() {
  const el = $('mutes');
  el.innerHTML = '';
  const head = h('h3', '', '<span>verb · echo · level</span>');
  head.append(btn('clear', 'sm', () => {
    for (let v = 0; v < 6; v++) for (const k of ['mute', 'eMute', 'rMute']) setG(NV_ + M[k + v], 0);
  }));
  const cols = h('div', 'cols');
  for (let v = 0; v < 6; v++) {
    const col = h('div', 'mcol');
    sendRow(col, 'verb', `v${v}.sRev`, `m.rMute${v}`);
    sendRow(col, 'echo', `v${v}.sEcho`, `m.eMute${v}`);
    const meter = meterEl(26);
    muteMeters.push(meter);
    col.append(meter);
    const lvl = h('div', 'lvl');
    const lg = keyG(`v${v}.level`);
    const drawL = () => (lvl.textContent = Math.round(getG(lg) * 100));
    watch(`v${v}.level`, drawL);
    drawL();
    bindDrag(lvl, () => model(`v${v}.level`));
    lvl.style.cursor = 'ns-resize';
    const mk = `m.mute${v}`;
    const mb = toggle(mk, SHORT[v]);
    watch(mk, () => col.classList.toggle('quiet', getG(keyG(mk)) >= 0.5));
    col.append(lvl, mb, h('div', 'key', `${VERB_KEYS[v]} ${ECHO_KEYS[v]} ${MUTE_KEYS[v]}`));
    cols.append(col);
  }
  el.append(head, cols);
}
function drawMeters() {
  const st = S.status;
  for (let v = 0; v < 6; v++) muteMeters[v].set(st ? st.meters[v] : 0);
}
