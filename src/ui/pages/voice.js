// fm/dm — VOICE page: drum picker (click auditions, shift-click hat = open), then tabs tone/fm, shape, filter, mod.

let curVoice = 0;
let curVTab = 'tone/fm';
const vKnobs = []; // [knob, param id]

const VTABS = {
  'tone/fm': [
    ['fm', ['algo', 'tune', 'fmLvl', 'fb', 'fmEnd', 'phase']],
    ...['A', 'B', 'C', 'D'].map((o) => [`op ${o}`, [`r${o}`, `l${o}`, `a${o}`, `d${o}`, `fx${o}`]]),
  ],
  shape: [
    ['pitch env · click', ['pAmt', 'pDec', 'clk', 'clkType', 'clkDec']],
    ['amp', ['aAtk', 'aHold', 'aDec', 'aCurve', 'aDec2']],
    ['out · crush', ['level', 'trim', 'pan', 'bits', 'srDiv']],
  ],
  filter: [
    ['filter', ['fType', 'fCut', 'fRes', 'fDrive', 'fEnv', 'fEnvDec']],
    ['noise', ['nLvl', 'nType', 'nCut', 'nRes']],
    ['noise env · bursts', ['nAtk', 'nDec', 'nBurst', 'nSpace']],
  ],
  mod: [
    ['lfo', ['lShape', 'lRate', 'lDepth', 'lDest', 'lDest2', 'lRetrig']],
    ['velocity', ['vLvl', 'vPitch', 'vFm', 'vFilt']],
    ['wobble · humanise', ['drift', 'fmNoise', 'hum']],
    ['sends', ['sEcho', 'sRev', 'sDist', 'sRing']],
  ],
};

function vkey(id) {
  return `v${curVoice}.${id}`;
}

function buildVoice() {
  const page = h('div');
  page.style.display = 'contents';
  // drum picker
  const pick = h('div', 'subtabs');
  const pickB = SHORT.map((n, v) => {
    const b = btn(VOICE_NAMES[v], '', (e) => {
      setVoice(v);
      startAudio().then(() => post({ t: 'trig', v, vel: 1, alt: v === 5 && e.shiftKey ? 1 : 0 }));
    });
    pick.append(b);
    return b;
  });
  const tabs = h('div', 'subtabs');
  const tabB = Object.keys(VTABS).map((t) => {
    const b = btn(t, 'sm', () => setVTab(t));
    tabs.append(b);
    return b;
  });
  const body = h('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '12px';
  page.append(pick, tabs, body);

  const algoInfo = h('span', 'dim');
  algoInfo.style.fontSize = '17px';

  function draw() {
    pickB.forEach((b, v) => b.classList.toggle('on', v === curVoice));
    tabB.forEach((b) => b.classList.toggle('on', b.textContent === curVTab));
    body.innerHTML = '';
    vKnobs.length = 0;
    for (const [title, ids] of VTABS[curVTab]) {
      const s = sect(title);
      if (title === 'fm') {
        s.head.append(h('span', 'sp'), algoInfo);
      }
      const r = h('div', 'row');
      for (const id of ids) {
        if (id === 'aDec2' && curVoice !== 5) {
          r.append(h('div'));
          continue;
        }
        const k = knob(vkey(id));
        vKnobs.push([k, id]);
        r.append(k);
      }
      // keep columns lined up across rows
      for (let i = ids.length; i < 6; i++) r.append(h('div'));
      s.append(r);
      body.append(s);
    }
    drawAlgo();
  }
  function drawAlgo() {
    const a = Math.round(getG(curVoice * NP + P.algo));
    algoInfo.textContent = `routing ${ALGOS[a]} · carriers sound, the rest modulate`;
  }
  function setVoice(v) {
    curVoice = v;
    draw();
  }
  function setVTab(t) {
    curVTab = t;
    draw();
  }
  for (let v = 0; v < 6; v++) watch(`v${v}.algo`, drawAlgo);
  page.setVoice = setVoice;
  voicePage = page;
  draw();
  return page;
}
let voicePage = null;
// shift+1..6 jumps here
function showVoice(v) {
  showPage('voice');
  if (voicePage) voicePage.setVoice(v);
}
