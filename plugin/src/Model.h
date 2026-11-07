// fm/dm — the plugin's own copy of everything the user edits (message thread), and presets in the
// same JSON format as the browser version, so presets exported there load here and the other way.
#pragma once
#include <juce_core/juce_core.h>
#include "Sequencer.h"

namespace fmdm {

struct Lane {
    int g = -1; // flat target, -1 off
    float steps[MAX_STEPS] = {};
    uint8_t shapes[MAX_STEPS] = {};
    int mode = 0, len = 16, speed = 0;
    float slew = 0, depth = 0.5f;
    bool groove = true;
};

struct Model {
    float base[NG];
    uint8_t vel[NUM_VOICES * MAX_STEPS] = {};
    uint8_t flag[NUM_VOICES * MAX_STEPS] = {};
    Lane lanes[NUM_LANES];
    juce::String name = "init";
    juce::var gen, perf; // kept as-is for the browser version

    Model();
    void reset();
    bool fromPreset(const juce::var& pr, bool keepTempo);
    juce::var toPreset(const juce::String& presetName) const;
};

int keyToFlat(const juce::String& key); // "v3.tune" / "m.bpm" -> flat index, -1 if unknown
juce::String flatToKey(int g);
float defaultFor(int g);

// the built-in presets (presets/*.json in the repo)
const juce::Array<juce::var>& factoryPresets();
// presets in a file: a { presets: [...] } bundle or one preset
juce::Array<juce::var> presetsInJson(const juce::var& v);

} // namespace fmdm
