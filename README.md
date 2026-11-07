# Elixir FM (fm-drum-machine)

A six-voice FM drum machine for the browser. Plain JavaScript, AudioWorklet, no dependencies.

- `src/engine/` — voice engine (4-operator FM, pitch env, click, noise, filter, amp env, crush, LFO)
- `npm test` — renders every voice in Node and checks it is not silent, not clipping and deterministic
- `npm run render` — same, and writes WAVs to `renders/`

MIT licence.

## Build

    node build.mjs      # writes dist/index.html (one self-contained page)
    npm test            # Node render + sequencer tests

The VT323 font (SIL Open Font License) is embedded in the page.
