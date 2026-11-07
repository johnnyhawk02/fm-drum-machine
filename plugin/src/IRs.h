// fm/dm — impulse responses for the convolution reverb (port of src/ui/ir.js): ten synthesised spaces,
// then Voxengo's recorded ones (embedded FLAC, see src/static/ir/CREDITS.txt), then your own file.
#pragma once
#include <juce_audio_formats/juce_audio_formats.h>

namespace fmdm {

constexpr int IR_SYNTH = 10;
constexpr int IR_FILES = 20;
constexpr int IR_USER = IR_SYNTH + IR_FILES; // 30

juce::String irName(int k);
// a stereo IR, normalised like the browser version (empty if unavailable); irRate is its sample rate
juce::AudioBuffer<float> makeIR(int k, double sampleRate, double& irRate, const juce::AudioBuffer<float>* user = nullptr, double userRate = 0);
// decode an audio file into a buffer (for your own IR)
bool readAudioFile(const juce::File& f, juce::AudioBuffer<float>& out, double& rate);

} // namespace fmdm
