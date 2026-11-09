// fm/dm — plugin processor. The editor is the browser version's page in a web view (see src/ui/host.js):
// its messages for the AudioWorklet arrive here instead and go to the audio thread through a lock-free
// queue; status, bar and recording messages go back to the page.
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>
#include "Model.h"
#include "IRs.h"

namespace fmdm {

void pageLog(const juce::String& msg);

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

    // ---- the page (message thread)
    void fromPage(const juce::var& m);
    std::function<void(const juce::var&)> toPage; // set by the editor while it is open
    std::function<void()> onPageReady;

private:
    enum MsgType : uint8_t { SET, STEP, PLAY, STOP, TRIG, LANE_FIELD, LANE_STEP, LANE_SHAPE, LANE_TARGET, LANES_OFF, REC };
    enum LaneField : int { LF_LEN, LF_SLEW, LF_SPEED, LF_DEPTH, LF_GROOVE, LF_MODE };
    struct Msg { MsgType t; bool atBar; int a; int b; float x; };
    void push(MsgType t, int a, int b, float x, bool atBar = false);
    void pushPreset(const Model& md, bool atBar);
    void pageMsg(const juce::var& m, bool atBar);
    void onAudio(const Msg& m);
    void apply(const Msg& m);
    void applyModelDirect();
    void renderSpan(float* L, float* R, int off, int n);
    void record(const float* L, const float* R, int n);
    void timerCallback() override;
    void syncIR();
    void sendState();

    Model model;             // what the engine is playing, kept on the message thread
    juce::var pageState;     // the page's own capture of it (adds perf knobs, generator, name)
    bool haveState = false;  // restored from the DAW or set by the page: the page loads it when it opens

    juce::AbstractFifo fifo { 1 << 16 };
    std::vector<Msg> msgs = std::vector<Msg>(1 << 16);
    std::vector<Msg> pending; // messages waiting for the next bar (audio thread)
    juce::SpinLock pushLock;

    std::unique_ptr<Engine> engine;
    std::unique_ptr<Sequencer> seq;
    double sr = 48000;
    bool hostWasPlaying = false, startedByHost = false;
    double lastPpq = 0, lastBpm = 120;
    long lastBars = 0;
    int program = 0;

    // recording (worklet 'rec'): audio thread -> fifo -> page
    int recMode = 0; // 0 off, 1 free, 2 armed loop, 3 loop running
    bool recStarted = false;
    long recLeft = 0;
    juce::AbstractFifo recFifo { 1 << 21 };
    std::vector<float> recBuf = std::vector<float>(1 << 21);
    std::atomic<int> recDone { 0 };

    // MIDI CCs for the page's MIDI learn / perf knobs
    juce::AbstractFifo ccFifo { 256 };
    int ccBuf[256][3] {};

    // status for the page
    std::atomic<int> curStep { -1 }, pendingN { 0 };
    std::atomic<long> stepIdx { 0 }, bars { 0 };
    std::atomic<bool> playing { false }, hostSync { false };
    std::atomic<float> hostBpm { 0 }, gr { 0 }, rush { -1 };
    std::atomic<float> meters[8] {};
    std::atomic<float> lanes[NUM_LANES] {};
    std::atomic<int> lpos[NUM_LANES] {};
    long sentBars = 0;

    // convolution reverb: the engine's send is convolved after each block and comes back in the next one
    juce::dsp::Convolution conv;
    juce::AudioBuffer<float> irSend, irWet, monoR;
    int irLoaded = -1;
    juce::AudioBuffer<float> userIR;
    double userIRRate = 0;
    std::unique_ptr<juce::FileChooser> chooser;
    juce::ThreadPool irPool { 1 }; // builds impulse responses off the message thread (destroyed first)

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(FmDmProcessor)
};

} // namespace fmdm
