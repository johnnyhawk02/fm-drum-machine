// Elixir FM — top-level engine: six voices summed to stereo.
// FX, crossfeed and sequencer plug in here as they are built.

import { NUM_VOICES, NP } from './params.js';
import { Voice } from './voice.js';
import { kitToArray, INIT_KIT } from './kits.js';

export class Engine {
  constructor(sr = 48000, seed = 1) {
    this.sr = sr;
    this.params = kitToArray(INIT_KIT);
    this.voices = [];
    for (let v = 0; v < NUM_VOICES; v++) this.voices.push(new Voice(sr, (seed * 7919 + v * 104729) >>> 0));
    this.mute = new Uint8Array(NUM_VOICES);
    this.master = 0.7;
  }

  setParam(v, i, x) {
    this.params[v * NP + i] = x;
  }

  // vel 0..1, alt=1 for open hat
  trigger(v, vel = 1, alt = 0) {
    if (this.mute[v]) return;
    this.voices[v].trigger(this.params, v * NP, vel, alt);
  }

  // render n samples into outL/outR starting at offset
  process(outL, outR, n, off = 0) {
    const p = this.params;
    const vs = this.voices;
    for (let s = 0; s < n; s++) {
      let l = 0;
      let r = 0;
      for (let v = 0; v < NUM_VOICES; v++) {
        const vo = vs[v];
        vo.process(p, v * NP);
        l += vo.L;
        r += vo.R;
      }
      outL[off + s] = l * this.master;
      outR[off + s] = r * this.master;
    }
  }
}
