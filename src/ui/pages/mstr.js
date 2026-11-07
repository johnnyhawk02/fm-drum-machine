// fm dm — MSTR page: kick sidechain duck, master distortion, compressor with gain-reduction meter, output.

let grBar = null;
let outL = null;
let outR = null;
function hbar(n = 30) {
  const b = h('div');
  b.style.cssText = 'display:flex;gap:2px;height:14px;flex:1';
  b.innerHTML = '<i style="flex:1;background:var(--dim)"></i>'.repeat(n);
  const bars = b.querySelectorAll('i');
  b.set = (frac) => {
    const lit = Math.round(clamp(frac, 0, 1) * n);
    if (b.lit === lit) return;
    b.lit = lit;
    bars.forEach((x, i) => (x.style.background = i < lit ? 'var(--ink)' : 'var(--dim)'));
  };
  return b;
}
function buildMstr() {
  const page = h('div');
  page.style.display = 'contents';
  const duck = sect('kick sidechain');
  duck.append(krow(['m.dkAmt', 'm.dkRel', 'm.dkSpace', h('div'), h('div'), h('div')]));
  const dist = sect('distortion');
  dist.append(krow(['m.mdType', 'm.mdDrive', 'm.mdColour', 'm.mdTone', 'm.mdMix', 'm.mdVol']));
  const comp = sect('compressor');
  grBar = hbar(30);
  const grTxt = h('span', '', '0 db');
  grTxt.style.cssText = 'font-size:18px;width:70px;text-align:right';
  comp.head.append(h('span', 'sp'), h('span', '', '<span style="font-size:17px">gr</span>'), grBar, grTxt);
  grBar.txt = grTxt;
  comp.append(krow(['m.cThr', 'm.cRatio', 'm.cAtk', 'm.cRel', 'm.cMake', 'm.cMix']));
  const out = sect('output');
  outL = hbar(36);
  outR = hbar(36);
  const meters = h('div');
  meters.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:3;justify-content:center';
  const l1 = h('div');
  l1.style.cssText = 'display:flex;gap:8px;align-items:center';
  l1.append(h('span', '', 'L'), outL);
  const l2 = h('div');
  l2.style.cssText = 'display:flex;gap:8px;align-items:center';
  l2.append(h('span', '', 'R'), outR);
  meters.append(l1, l2);
  const r = krow(['m.mVol', 'm.mHp']);
  r.append(meters);
  out.append(r);
  page.append(duck, dist, comp, out);
  return page;
}
function drawMasterMeters() {
  const st = S.status;
  if (mixMeters.length) for (let v = 0; v < 6; v++) mixMeters[v].set(st ? st.meters[v] : 0);
  if (!grBar || !grBar.isConnected) return;
  const gr = st ? st.gr : 0;
  grBar.set(gr / 20);
  grBar.txt.textContent = '-' + gr.toFixed(1) + ' db';
  const db = (x) => (x > 1e-5 ? (20 * Math.log10(x) + 48) / 48 : 0);
  outL.set(st ? db(st.meters[6]) : 0);
  outR.set(st ? db(st.meters[7]) : 0);
}
