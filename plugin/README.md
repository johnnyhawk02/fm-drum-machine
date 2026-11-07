# fm/dm plugin (JUCE)

fm/dm as a VST3 / AU / standalone instrument, built with JUCE. Milestone 1: the full sound engine and
sequencer from the browser version, presets, host sync, MIDI and a basic editor.

- `engine/` — the sound engine and sequencer in plain C++ (no JUCE), ported line by line from
  `src/engine` and `src/seq`. `ParamsGen.h` is generated from `src/engine/params.js` and `kits.js` by
  `node tools/gen-cpp-params.mjs`, so the parameter layout stays the same in both.
- `src/` — the JUCE processor and editor.
- `test/` — `render.cpp` renders every voice and a beat with the C++ engine; `compare.mjs` renders the
  same with the JS engine and checks they match (voices are bit-identical).

## What it does

- Six FM voices, crossfeed, echo, reverb (algorithmic, or convolution with the same 10 synthesised and
  20 recorded impulse responses, or your own file), send distortion and ring, duck, master drive and
  compressor.
- The step sequencer with groove, accents, open hats, rush and knob lanes, as in the browser.
- Follows the host: tempo, start/stop and loop position. The play button runs it on its own when the
  host is stopped (and in the standalone app).
- MIDI in plays the drums: General MIDI drum notes (36 kick, 38 snare, 42/46 closed/open hat, 49 cymbal,
  toms on drum 2 and 3), or C3 upwards for the six drums in order.
- The built-in presets from `presets/`, plus load/save of preset files in the browser's export format,
  so presets move both ways. The DAW session saves the whole state.

## Build (macOS)

Needs Xcode (or the command line tools) and CMake 3.22+.

    cd plugin
    cmake -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --config Release -j 8

JUCE is downloaded on the first configure (or pass `-DJUCE_DIR=/path/to/JUCE`). The VST3 and AU are
copied to `~/Library/Audio/Plug-Ins/VST3` and `~/Library/Audio/Plug-Ins/Components`; the standalone app
is in `build/FMDM_artefacts/Release/Standalone`.

Engine check against the browser version:

    cmake --build build --target fmdm_render && ./build/fmdm_render /tmp/fmdm && node test/compare.mjs /tmp/fmdm

## Licences

fm/dm's own code is MIT. JUCE is AGPLv3 or commercial (with a free tier for small developers): sharing
built plugin binaries needs one of those. The VT323 font is SIL OFL. The recorded impulse responses are
Voxengo's, see `src/static/ir/CREDITS.txt`.
