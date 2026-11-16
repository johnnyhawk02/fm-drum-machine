// fm/dm — MIDI: perf knobs on CC 1..24 (any channel), CC 25..28 for the selected sequencer, user CC maps (learn).
// MIDI out: every drum hit (sequencer, rush, ratchets, pads) as a note on channel 10, to one output port.

const MIDI_LS = 'fmdm.midimap';
let midiMap = {};
try { midiMap = JSON.parse(localStorage.getItem(MIDI_LS) || '{}'); } catch {}
let midiLearn = null;
let midiAcc = null;
// MIDI out: a note per voice plus the open hat (General MIDI drums by default; the plugin reads them back in)
const MIDI_NOTES_DEF = [36, 45, 48, 38, 49, 42, 46];
const MIDI_NOTE_NAMES = ['dr1', 'dr2', 'dr3', 'sn', 'cy', 'hh', 'hh open'];
const MIDI_NOTES_LS = 'fmdm.midiNotes';
const MIDI_NOTES = MIDI_NOTES_DEF.slice();
try {
  const a = JSON.parse(localStorage.getItem(MIDI_NOTES_LS) || 'null');
  if (Array.isArray(a) && a.length === 7) a.forEach((n, i) => (MIDI_NOTES[i] = clamp(n | 0, 0, 127)));
} catch {}
// save: false when the plugin hands over the notes saved in the DAW project
function setMidiNotes(a, save = true) {
  a.forEach((n, i) => i < 7 && (MIDI_NOTES[i] = clamp(n | 0, 0, 127)));
  if (!save) return;
  try { localStorage.setItem(MIDI_NOTES_LS, JSON.stringify(MIDI_NOTES)); } catch {}
  post({ t: 'midiNotes', notes: MIDI_NOTES.slice() });
}
const MIDI_OUT_LS = 'fmdm.midiOut';
let midiOutId = ''; // output port id, '' = off
try { midiOutId = localStorage.getItem(MIDI_OUT_LS) || ''; } catch {}
function initMidi() {
  on('hits', midiHits);
  if (HOST) return; // the plugin always sends its notes to the DAW, with the note numbers saved in the project
  if (!navigator.requestMIDIAccess) return;
  navigator.requestMIDIAccess().then((acc) => {
    midiAcc = acc;
    const hook = () => acc.inputs.forEach((inp) => (inp.onmidimessage = onMidi));
    hook();
    acc.onstatechange = hook;
    post({ t: 'midiOut', on: !!midiOutId });
  }).catch(() => {});
}
function midiOutPort() {
  return midiOutId && midiAcc ? midiAcc.outputs.get(midiOutId) : null;
}
function setMidiOut(id) {
  midiOutId = id || '';
  try { localStorage.setItem(MIDI_OUT_LS, midiOutId); } catch {}
  post({ t: 'midiOut', on: !!midiOutId });
}
// the worklet's hits carry the audio time of their block: send each when it is heard
function midiHits(m) {
  const out = midiOutPort();
  if (!out || !ctx) return;
  const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
  const now = performance.now();
  const h = m.hits;
  for (let i = 0; i < h.length; i += 4) {
    const v = h[i] | 0, at = m.time + h[i + 3] / m.sr;
    const note = MIDI_NOTES[v === 5 && h[i + 2] ? 6 : v];
    const vel = Math.max(1, Math.min(127, Math.round(h[i + 1] * 127)));
    let t = ts && ts.performanceTime ? ts.performanceTime + (at - ts.contextTime) * 1000 : now;
    if (t < now) t = now;
    try {
      out.send([0x99, note, vel], t);
      out.send([0x89, note, 0], t + 50);
    } catch {}
  }
}
// options dialog: pick the output (none in the plugin, where the DAW routes it)
function midiOutOptions() {
  const box = h('div');
  box.style.display = 'grid';
  box.style.gap = '6px';
  box.append(h('div', '', HOST ? 'midi out: notes go to the daw on channel 10' : 'midi out (channel 10)'));
  box.append(midiNoteFields());
  if (HOST) return box;
  if (!midiAcc) {
    box.append(h('div', 'dim', navigator.requestMIDIAccess ? 'no midi access' : 'this browser has no web midi'));
    return box;
  }
  const outs = [...midiAcc.outputs.values()];
  if (!outs.length) box.append(h('div', 'dim', 'no midi outputs found'));
  const all = [];
  const draw = () => all.forEach((c) => c.draw());
  for (const o of [{ id: '', name: 'off' }, ...outs]) {
    const c = chk(o.name.toLowerCase(), () => midiOutId === o.id, () => { setMidiOut(o.id); draw(); });
    c.draw = () => c.classList.toggle('on', midiOutId === o.id);
    all.push(c);
    box.append(c);
  }
  return box;
}
function onMidi(ev) {
  const [st, cc, val] = ev.data;
  if ((st & 0xf0) !== 0xb0) return;
  const n = val / 127;
  if (midiLearn) {
    midiMap[cc] = midiLearn;
    try { localStorage.setItem(MIDI_LS, JSON.stringify(midiMap)); } catch {}
    toast(`cc ${cc} = ${fullName(midiLearn)}`);
    midiLearn = null;
    return;
  }
  if (midiMap[cc]) return model(midiMap[cc]).set(n);
  if (cc >= 1 && cc <= 24) {
    const key = S.perf[cc - 1];
    if (key) model(key).set(n);
    return;
  }
  if (cc >= 25 && cc <= 28) {
    const ln = curLane();
    if (!ln) return;
    if (cc === 25) ln.len = 2 + Math.round(n * 62);
    if (cc === 26) ln.slew = n;
    if (cc === 27) ln.speed = Math.round(n * (SPEEDS.length - 1));
    if (cc === 28) ln.depth = n * 2 - 1;
    sendLane(laneOf(ln.g));
  }
}
function learnMidi(key) {
  midiLearn = key;
  toast(`move a midi control for ${fullName(key)}`);
}

// note number per voice (the plugin also plays the drums from these notes)
function midiNoteFields() {
  const row = h('div', 'midinotes');
  const ins = [];
  MIDI_NOTE_NAMES.forEach((name, i) => {
    const f = h('label', '', `<span>${name}</span>`);
    const inp = h('input');
    inp.type = 'number';
    inp.min = 0;
    inp.max = 127;
    inp.value = MIDI_NOTES[i];
    inp.addEventListener('change', () => {
      const a = MIDI_NOTES.slice();
      a[i] = clamp(Math.round(+inp.value || 0), 0, 127);
      inp.value = a[i];
      setMidiNotes(a);
    });
    ins.push(inp);
    f.append(inp);
    row.append(f);
  });
  row.append(btn('reset', 'sm', () => {
    setMidiNotes(MIDI_NOTES_DEF);
    ins.forEach((inp, i) => (inp.value = MIDI_NOTES[i]));
  }));
  return row;
}
