// fm dm — MIX page: a strip per drum (sends, pan, level fader with meter, mute, solo).

const mixMeters = [];
function buildMix() {
  const page = h('div');
  page.style.display = 'contents';
  const s = sect('mixer');
  const cols = h('div', 'row');
  cols.style.alignItems = 'stretch';
  cols.style.flex = '1';
  for (let v = 0; v < 6; v++) {
    const c = h('div');
    c.style.display = 'flex';
    c.style.flexDirection = 'column';
    c.style.alignItems = 'center';
    c.style.gap = '4px';
    for (const id of ['sEcho', 'sRev', 'sDist', 'sRing', 'pan']) c.append(knob(`v${v}.${id}`));
    const fr = h('div');
    fr.style.display = 'flex';
    fr.style.gap = '4px';
    fr.style.height = '180px';
    const f = fader(`v${v}.level`, { bars: 18, label: 'level' });
    const mt = meterEl(18);
    mt.className = 'meter';
    mt.style.cssText = 'display:flex;flex-direction:column-reverse;gap:2px;width:8px;margin:20px 0 22px';
    mt.querySelectorAll('i').forEach((i) => (i.style.flex = '1'));
    mixMeters.push(mt);
    fr.append(f, mt);
    const ms = h('div');
    ms.style.display = 'flex';
    ms.style.gap = '4px';
    ms.append(toggle(`m.mute${v}`, 'm', 'sm'), toggle(`m.solo${v}`, 's', 'sm'));
    c.append(fr, ms, h('div', '', `<span style="font-size:20px">${SHORT[v].toUpperCase()}</span>`));
    cols.append(c);
  }
  s.append(cols);
  page.append(s);
  return page;
}
