# fm/dm plugin (JUCE)

fm/dm as a VST3 / AU / standalone instrument, built with JUCE. It always matches the latest prototype:

- The editor **is** the browser version's page: `dist/index.html`, built from `src/` by `build.mjs`, shown in
  a web view. Every configure rebuilds it from `../src` (and re-runs when `../src` changes), so the plugin has
  exactly the same layout, pages, presets and behaviour as the web app.
- `src/ui/host.js` is the only plugin-specific part of the page: inside the plugin, the messages the page
  sends its AudioWorklet go to the C++ engine instead, and status, bar, recording and MIDI CC messages come
  back. In a browser it does nothing.
- `engine/` is the sound engine and sequencer in plain C++, a line-by-line port of `src/engine` and `src/seq`.
  `ParamsGen.h` is regenerated from `src/engine/params.js` and `kits.js` on every configure.
  **When the JS engine changes, port the change here** and check with `test/compare.mjs`: the voices are
  bit-identical today.
- `src/` holds the processor (the worklet's message handling, bar-synced changes, recording, convolution
  reverb with the same IRs, host tempo/transport/loop sync, MIDI notes in) and the web view editor.

The DAW session saves the whole state in the preset format. MIDI notes play the drums (General MIDI drum
notes, or C3 upwards for the six drums); CCs go to the page's MIDI learn and perf knobs (CC 1..24).
Recordings and preset exports open a save dialog.

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
