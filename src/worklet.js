// fm/dm — AudioWorklet host for Engine + Sequencer.
// The build prepends the engine and sequencer code to this file.

class ElixirProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new Engine(sampleRate, 1);
    this.seq = new Sequencer(this.engine, 1);
    this.pending = []; // messages waiting for the next bar
    this.lastBars = 0;
    this.statN = 0;
    this.rec = false;
    this.recBuf = new Float32Array(8192 * 2);
    this.recN = 0;
    this.port.onmessage = (ev) => this.onMsg(ev.data);
  }

  onMsg(m) {
    if (m.atBar && this.seq.playing) {
      this.pending.push(m);
      return;
    }
    this.apply(m);
  }

  apply(m) {
    const s = this.seq;
    switch (m.t) {
      case 'set':
        s.setFlat(m.g, m.x);
        break;
      case 'all':
        for (let g = 0; g < m.base.length; g++) s.setFlat(g, m.base[g]);
        break;
      case 'pat':
        s.vel.set(m.vel);
        s.flag.set(m.flag);
        break;
      case 'lane': {
        const l = m.l;
        if (s.lTarget[l] >= 0 && s.lTarget[l] !== m.g) s.setFlat(s.lTarget[l], s.base[s.lTarget[l]]);
        s.lTarget[l] = m.g;
        if (m.g < 0) break;
        s.lSteps.set(m.steps, l * MAX_STEPS);
        s.lLen[l] = m.len;
        s.lSlew[l] = m.slew;
        s.lSpeed[l] = m.speed;
        s.lDepth[l] = m.depth;
        s.lGroove[l] = m.groove ? 1 : 0;
        break;
      }
      case 'lanesOff':
        for (let l = 0; l < NUM_LANES; l++) if (s.lTarget[l] >= 0) {
          s.setFlat(s.lTarget[l], s.base[s.lTarget[l]]);
          s.lTarget[l] = -1;
          s.lOut[l] = 0;
        }
        break;
      case 'bundle':
        for (const x of m.msgs) this.apply(x);
        break;
      case 'play':
        this.pending.length = 0;
        s.start();
        this.lastBars = s.bars;
        break;
      case 'stop':
        s.stop();
        for (const x of this.pending) this.apply(x);
        this.pending.length = 0;
        break;
      case 'trig':
        this.engine.trigger(m.v, m.vel, m.alt || 0);
        break;
      case 'rec':
        // m.mode: 0 stop, 1 free, 2 exact loop of m.bars bars (starts at the next bar, or now if stopped)
        this.recN = 0;
        if (!m.mode) {
          this.flushRec(true);
          this.rec = 0;
          this.recStarted = false;
        } else if (m.mode === 1) this.rec = 1;
        else {
          this.recLeft = Math.round((m.bars * 4 * 60 * sampleRate) / this.engine.master[M.bpm]);
          if (!s.playing) {
            s.start();
            this.lastBars = s.bars;
          }
          this.rec = 2;
        }
        break;
    }
  }

  flushRec(done) {
    this.port.postMessage({ t: 'rec', data: this.recBuf.slice(0, this.recN), done });
    this.recN = 0;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const n = L.length;
    const s = this.seq;
    // a new bar is about to start if the next step is a bar start; apply pending at bar boundaries
    s.process(L, R, n);
    if (s.bars !== this.lastBars) {
      this.lastBars = s.bars;
      if (this.pending.length) {
        for (const x of this.pending) this.apply(x);
        this.pending.length = 0;
      }
      this.port.postMessage({ t: 'bar', bars: s.bars });
    }
    if (this.rec === 2 && s.barOff >= 0) this.rec = 3; // armed loop: starts at this bar
    if (this.rec === 1 || this.rec === 3) {
      let i0 = 0;
      let i1 = n;
      if (this.rec === 3 && this.recStarted !== true) {
        i0 = s.barOff;
        this.recStarted = true;
      }
      if (this.rec === 3 && i1 - i0 > this.recLeft) i1 = i0 + this.recLeft;
      for (let i = i0; i < i1; i++) {
        this.recBuf[this.recN++] = L[i];
        this.recBuf[this.recN++] = R[i];
        if (this.recN >= this.recBuf.length) this.flushRec(false);
      }
      if (this.rec === 3) {
        this.recLeft -= i1 - i0;
        if (this.recLeft <= 0) {
          this.flushRec(true);
          this.rec = 0;
          this.recStarted = false;
        }
      }
    }
    if (++this.statN >= 8) {
      this.statN = 0;
      const e = this.engine;
      const meters = new Float32Array(8);
      for (let v = 0; v < 6; v++) meters[v] = e.voices[v].meter;
      meters[6] = e.peakL;
      meters[7] = e.peakR;
      this.port.postMessage({ t: 'st', step: s.curStep, stepIdx: s.stepIdx, playing: s.playing, meters, gr: e.gr,
        lanes: s.lOut.slice(), lpos: s.lPos.slice(), rush: s.inRush ? s.rushC : -1, pending: this.pending.length });
    }
    return true;
  }
}
registerProcessor('elixir-fm', ElixirProcessor);
