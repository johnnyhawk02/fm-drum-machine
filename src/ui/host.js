// fm/dm — running inside the plugin (JUCE web view). The page is the same as the browser version; only
// the audio boundary changes: instead of an AudioWorklet, the messages for the worklet go to the
// plugin's C++ engine, and its status, bar and recording messages come back the same way.
// In a normal browser window.__JUCE__ is missing and none of this does anything.

const HOST = window.__JUCE__ && window.__JUCE__.backend ? (() => {
  const be = window.__JUCE__.backend;
  // typed arrays don't survive JSON: send plain arrays
  const plain = (m) => {
    if (ArrayBuffer.isView(m)) return Array.from(m);
    if (Array.isArray(m)) return m.map(plain);
    if (m && typeof m === 'object') { const o = {}; for (const k in m) o[k] = plain(m[k]); return o; }
    return m;
  };
  const send = (m) => be.emitEvent('fmdm', plain(m));
  const b64ToF32 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Float32Array(u.buffer); };
  const bytesToB64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  let lastState = '';
  let ready = null, readyRes = null;

  function onHost(m) {
    if (m.t === 'state') return restore(m);
    if (m.t === 'rec') return onWorklet({ t: 'rec', data: m.data ? b64ToF32(m.data) : new Float32Array(0), done: m.done });
    if (m.t === 'midi') return typeof onMidi === 'function' && onMidi({ data: m.data });
    if (m.t === 'st') {
      // the host's transport and tempo can change things the page didn't do itself
      if (m.playing !== S.playing) {
        S.playing = m.playing;
        $('play').classList.toggle('on', S.playing);
        $('play').innerHTML = S.playing ? '■ stop' : '▶ play';
      }
      if (m.hostBpm && Math.abs(S.base[NV_ + M.bpm] - m.hostBpm) > 1e-3) {
        S.base[NV_ + M.bpm] = m.hostBpm;
        redraw('m.bpm');
      }
    }
    onWorklet(m);
  }

  // the plugin answers 'hello' with its saved state (a preset, as the preset page captures it) or none
  function restore(m) {
    ctx.sampleRate = m.sr || 48000;
    if (m.preset) {
      outbox.length = 0; // the page's own start-up kit: the saved one replaces it
      const keep = { ...prstOpt }, al = S.opts.autoLevel;
      Object.assign(prstOpt, { tempo: true, wait: false });
      S.opts.autoLevel = false;
      applyPreset(m.preset);
      Object.assign(prstOpt, keep);
      S.opts.autoLevel = al;
      if (m.name) curPreset = m.name;
    } else {
      post({ t: 'all', base: S.base });
      post({ t: 'pat', vel: S.vel, flag: S.flag });
      S.lanes.forEach((ln, l) => ln && post(laneMsg(l)));
    }
    while (outbox.length) send(outbox.shift());
    if (typeof irLoadStored === 'function') irLoadStored();
    readyRes();
    const shown = () => send({ t: 'ready' }); // drawn: the plugin can drop its splash
    requestAnimationFrame(shown);
    setTimeout(shown, 300);
  }

  // keep the plugin's copy of the whole state current, for the DAW session
  setInterval(() => {
    if (!node || typeof capture !== 'function') return;
    const pr = capture(curPreset || 'untitled');
    delete pr.ts;
    const s = JSON.stringify(pr);
    if (s !== lastState) { lastState = s; send({ t: 'state', preset: pr }); }
  }, 500);

  // downloads (recordings, preset export) go to a save dialog in the plugin
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!this.download || !this.href.startsWith('blob:')) return click.call(this);
    const name = this.download;
    fetch(this.href).then((r) => r.arrayBuffer()).then((b) => send({ t: 'save', name, data: bytesToB64(b) }));
  };

  be.addEventListener('fmdm', onHost);
  return {
    start() {
      if (!ready) {
        ready = new Promise((res) => (readyRes = res));
        node = { port: { postMessage: send } };
        // the page reads the sample rate and decodes audio files (your own IR) through ctx
        let dec = null;
        ctx = { sampleRate: 48000, resume: () => Promise.resolve(), decodeAudioData: (d) => (dec ||= new OfflineAudioContext(2, 1, 44100)).decodeAudioData(d) };
        send({ t: 'hello' });
      }
      return ready;
    },
    // your own impulse response, decoded by the page, goes to the plugin's convolver
    userIR(name, buf) {
      const ch = [];
      for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) ch.push(bytesToB64(buf.getChannelData(c).slice().buffer));
      send({ t: 'irUser', name, sr: buf.sampleRate, ch });
    },
  };
})() : null;
if (HOST) setTimeout(() => HOST.start(), 0);
