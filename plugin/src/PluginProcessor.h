// fm/dm — plugin processor. The editor edits the Model on the message thread; every change goes to the
// audio thread as a small message (like the browser's worklet port), so audio never waits on a lock.
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>
#include "Model.h"
#include "IRs.h"

namespace fmdm {

class FmDmProcessor : public juce::AudioProcessor, private juce::Timer {
public:
    FmDmProcessor();
    ~FmDmProcessor() override = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return "fm-dm"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 4.0; }
    int getNumPrograms() override { return juce::jmax(1, factoryPresets().size()); }
    int getCurrentProgram() override { return program; }
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    // ---- editor side (message thread)
    Model model;
    void setParam(int g, float x);
    void setStep(int voice, int step, int vel, int flag);
    void loadPreset(const juce::var& pr);
    void play(bool on);
    void trigger(int voice, float vel, int alt);
    bool loadUserIR(const juce::File& f);
    juce::String userIRName;

    // ---- shown by the editor
    std::atomic<int> curStep { -1 };
    std::atomic<bool> playing { false }, hostSync { false };
    std::atomic<float> hostBpm { 0 };
    std::atomic<float> meters[8] {};
    std::atomic<int> modelVersion { 0 }; // bumps when the model changes from outside the editor (state, program)

private:
    enum MsgType : uint8_t { SET, STEP, PLAY, STOP, TRIG, LANE_FIELD, LANE_STEP, LANE_SHAPE, LANE_TARGET, LANES_OFF };
    enum LaneField : int { LF_LEN, LF_SLEW, LF_SPEED, LF_DEPTH, LF_GROOVE, LF_MODE };
    struct Msg { MsgType t; int a; int b; float x; };
    void push(MsgType t, int a, int b, float x);
    void pushAll();
    void apply(const Msg& m);
    void applyModelDirect();
    void renderSpan(float* L, float* R, int off, int n);
    void timerCallback() override; // keeps the convolver on the IR the model points at

    juce::AbstractFifo fifo { 1 << 15 };
    std::vector<Msg> msgs = std::vector<Msg>(1 << 15);
    juce::SpinLock pushLock; // more than one non-audio thread may push (message thread, host state calls)

    std::unique_ptr<Engine> engine;
    std::unique_ptr<Sequencer> seq;
    double sr = 48000;
    bool hostWasPlaying = false, startedByHost = false;
    double lastPpq = 0, lastBpm = 120;
    int program = 0;

    // convolution reverb: the engine's send is convolved after each block and comes back in the next one
    juce::dsp::Convolution conv;
    juce::AudioBuffer<float> irSend, irWet, monoR;
    int irLoaded = -1;
    juce::AudioBuffer<float> userIR;
    double userIRRate = 0;
    juce::CriticalSection irLock;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(FmDmProcessor)
};

} // namespace fmdm
