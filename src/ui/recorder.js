// fm dm — record a WAV: free (press rec, press again to stop) or an exact loop of 1..128 bars.

const REC = { mode: 'loop', bars: 4, on: false, chunks: [] };
function wavBlob(chunks, sr) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const d = new DataView(buf);
  const w = (o, s) => [...s].forEach((ch, i) => d.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 2, true); d.setUint32(24, sr, true);
  d.setUint32(28, sr * 4, true); d.setUint16(32, 4, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
  let o = 44;
  for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) d.setInt16(o, Math.round(clamp(c[i], -1, 1) * 32767), true);
  return new Blob([buf], { type: 'audio/wav' });
}
on('rec', (m) => {
  if (m.data.length) REC.chunks.push(m.data);
  if (m.done) finishRec();
});
function finishRec() {
  REC.on = false;
  $('rec').classList.remove('on');
  if (!S.playing && REC.mode === 'loop') { /* transport was started for the loop: keep playing */ }
  const blob = wavBlob(REC.chunks, ctx.sampleRate);
  REC.chunks = [];
  const a = h('a');
  a.href = URL.createObjectURL(blob);
  const bpm = Math.round(getG(NV_ + M.bpm));
  a.download = `fm-dm ${curPreset || 'take'} ${bpm}bpm${REC.mode === 'loop' ? ' ' + REC.bars + 'bars' : ''}.wav`;
  a.click();
  toast('saved ' + a.download);
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function startRec() {
  await startAudio();
  REC.chunks = [];
  REC.on = true;
  $('rec').classList.add('on');
  if (REC.mode === 'loop') {
    if (!S.playing) {
      S.playing = true;
      $('play').classList.add('on');
      $('play').innerHTML = '■ stop';
    }
    post({ t: 'rec', mode: 2, bars: REC.bars });
    toast(`recording ${REC.bars} bar${REC.bars > 1 ? 's' : ''} from the next bar`);
  } else post({ t: 'rec', mode: 1 });
}
function openRecorder() {
  if (REC.on) {
    post({ t: 'rec', mode: 0 });
    return;
  }
  const body = h('div');
  body.style.display = 'grid';
  body.style.gap = '12px';
  const modes = h('div', 'subtabs');
  const bFree = btn('free', '', () => { REC.mode = 'free'; draw(); });
  const bLoop = btn('exact loop', '', () => { REC.mode = 'loop'; draw(); });
  modes.append(bFree, bLoop);
  const BARS = [1, 2, 4, 8, 16, 32, 64, 128];
  const bm = { key: 'rec.bars', g: -1, steps: BARS.length, noSelect: true, label: 'bars', def: 2 / 7,
    get: () => BARS.indexOf(REC.bars) / 7, set: (n) => { REC.bars = BARS[Math.round(n * 7)]; kb.draw(); }, text: () => String(REC.bars), mod: () => null };
  const kb = knob(null, { model: bm });
  const go = btn('● start', 'big', () => { closeDialog(); startRec(); });
  const row = h('div', 'row');
  row.style.alignItems = 'center';
  row.append(kb, go);
  const note = h('div', 'dim', '');
  note.style.fontSize = '18px';
  function draw() {
    bFree.classList.toggle('on', REC.mode === 'free');
    bLoop.classList.toggle('on', REC.mode === 'loop');
    kb.style.visibility = REC.mode === 'loop' ? '' : 'hidden';
    note.textContent = REC.mode === 'loop' ? 'starts on the next bar and stops after exactly that many bars, so the file loops' : 'records until you press rec again';
  }
  body.append(modes, row, note);
  dialog('record a wav', body);
  draw();
}
