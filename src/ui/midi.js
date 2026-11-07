// fm dm — MIDI: perf knobs on CC 1..24 (any channel), CC 25..28 for the selected sequencer, user CC maps (learn).

const MIDI_LS = 'fmdm.midimap';
let midiMap = {};
try { midiMap = JSON.parse(localStorage.getItem(MIDI_LS) || '{}'); } catch {}
let midiLearn = null;
function initMidi() {
  if (!navigator.requestMIDIAccess) return;
  navigator.requestMIDIAccess().then((acc) => {
    const hook = () => acc.inputs.forEach((inp) => (inp.onmidimessage = onMidi));
    hook();
    acc.onstatechange = hook;
  }).catch(() => {});
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
