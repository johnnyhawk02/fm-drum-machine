# fm/dm

fm/dm (frequency modulated drum machine) is a six-voice FM drum machine for the browser. Plain JavaScript, AudioWorklet, no dependencies.

- `src/engine/` — voice engine (4-operator FM, pitch env, click, noise, filter, amp env, crush, LFO)
- `npm test` — renders every voice in Node and checks it is not silent, not clipping and deterministic
- `npm run render` — same, and writes WAVs to `renders/`

MIT licence.

There is also a JUCE plugin version (VST3 / AU / standalone) in `plugin/`, see `plugin/README.md`.

## Build

    node build.mjs      # writes dist/index.html (one self-contained page)
    npm test            # Node render + sequencer tests

The VT323 font (SIL Open Font License) is embedded in the page.

## Impulse responses

The convolution reverb's recorded spaces are Voxengo's free reverb impulse responses
(https://www.voxengo.com/impulses/), used under their licence: "Permission is granted to anyone to use
these impulse files royalty-free for any purpose, including commercial usage." See `src/static/ir/CREDITS.txt`.
The other factory IRs are synthesised by the app.
