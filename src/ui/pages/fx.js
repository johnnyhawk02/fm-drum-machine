// fm dm — FX page: echo, reverb, send buses (distortion, ring mod), crossfeed patchbay.

let curFxTab = 'echo';
function buildFx() {
  const page = h('div');
  page.style.display = 'contents';
  const tabs = h('div', 'subtabs');
  const body = h('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '12px';
  const T = {
    echo: () => {
      const s = sect('echo');
      s.head.append(h('span', 'sp'), toggle('m.eSync', 'sync', 'sm'), toggle('m.ePing', 'ping-pong', 'sm'));
      s.append(krow(['m.eDiv', 'm.eMs', 'm.eFine', 'm.eTone']), h('div', '', '&nbsp;'), krow(['m.eFb', 'm.eWidth', 'm.eLvl', h('div')]));
      return [s, sendsSect('echo sends', 'sEcho')];
    },
    reverb: () => {
      const s = sect('reverb');
      s.append(krow(['m.rPre', 'm.rDecay', 'm.rTone', 'm.rEarly', 'm.rLvl']));
      return [s, sendsSect('reverb sends', 'sRev')];
    },
    bus: () => {
      const d = sect('distortion bus');
      d.append(krow(['m.sdDrive', 'm.sdTone', 'm.sdLvl', h('div')]));
      const r = sect('ring mod bus');
      r.append(krow(['m.rmHz', 'm.rmLvl', h('div'), h('div')]));
      return [d, sendsSect('distortion sends', 'sDist'), r, sendsSect('ring mod sends', 'sRing')];
    },
  };
  const tabB = Object.keys(T).map((t) => {
    const b = btn(t, 'sm', () => show(t));
    tabs.append(b);
    return b;
  });
  const cache = {};
  function show(t) {
    curFxTab = t;
    tabB.forEach((b) => b.classList.toggle('on', b.textContent === t));
    body.innerHTML = '';
    if (!cache[t]) cache[t] = T[t]();
    body.append(...cache[t]);
  }
  page.append(tabs, body);
  show(curFxTab);
  return page;
}
function sendsSect(title, id) {
  const s = sect(title);
  s.append(krow([0, 1, 2, 3, 4, 5].map((v) => knob(`v${v}.${id}`, { label: SHORT[v] }))));
  return s;
}

// ---- xmod page: the crossfeed table. Each voice's base operator (op A's sine, running all the time at
// that drum's pitch) can modulate any other voice. Rows = from, columns = into. Drag: amount.
// Click: target (fm = phase-modulates op A, filter = moves the cutoff, ring = ring mod). Double-click: off.
function buildXmod() {
  const page = h('div');
  page.style.display = 'contents';
  page.append(buildXfeed());
  return page;
}
function buildXfeed() {
  const s = sect('crossfeed · base operator of each drum modulates the others');
  s.head.append(h('span', 'sp'),
    btn('randomise', 'sm', () => { pushUndo(); rndXfeed(RND.crossfeed.depth); sendAll(); }),
    btn('clear', 'sm', () => { pushUndo(); for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) setG(NV_ + M[`xa${a}${b}`], 0); }));
  const g = h('div', 'xf');
  g.append(h('div', 'h', 'from \\ to'));
  for (let d = 0; d < 6; d++) g.append(h('div', 'h', SHORT[d]));
  for (let src = 0; src < 6; src++) {
    g.append(h('div', 'h', SHORT[src]));
    for (let d = 0; d < 6; d++) {
      const c = h('div', 'cell' + (src === d ? ' self' : ''), '<b></b><span></span>');
      const ka = `m.xa${src}${d}`;
      const kt = `m.xt${src}${d}`;
      const ga = keyG(ka);
      const gt = keyG(kt);
      const draw = () => {
        const a = getG(ga);
        c.firstChild.style.height = a * 100 + '%';
        c.lastChild.textContent = a > 0 ? XF_TARGETS[Math.round(getG(gt))] : '';
      };
      watch(ka, draw);
      watch(kt, draw);
      draw();
      let moved = false;
      c.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        c.setPointerCapture(e.pointerId);
        let y0 = e.clientY;
        moved = false;
        const mv = (ev) => {
          if (!ev.buttons) return c.removeEventListener('pointermove', mv);
          const dy = (y0 - ev.clientY) / stageScale;
          if (Math.abs(dy) < 1) return;
          y0 = ev.clientY;
          moved = true;
          setG(ga, clamp(getG(ga) + dy / 150, 0, 1));
        };
        c.addEventListener('pointermove', mv);
        c.addEventListener('pointerup', () => {
          c.removeEventListener('pointermove', mv);
          if (!moved) {
            if (getG(ga) === 0) setG(ga, 0.25);
            else setG(gt, (Math.round(getG(gt)) + 1) % 3);
          }
        }, { once: true });
      });
      c.addEventListener('dblclick', () => setG(ga, 0));
      g.append(c);
    }
  }
  s.append(g, h('div', 'dim', '<span style="font-size:17px">rows (op A of that drum, always running) feed columns · drag: depth · click: fm / filter / ring · double-click: off. you hear it while the drum in the column sounds.</span>'));
  return s;
}
