#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace fmdm {

FmDmProcessor::FmDmProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
    if (factoryPresets().size() > 0) model.fromPreset(factoryPresets()[0], false);
    startTimerHz(10);
}

bool FmDmProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    const auto& out = layouts.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::stereo() || out == juce::AudioChannelSet::mono();
}

// ---- messages to the audio thread
void FmDmProcessor::push(MsgType t, int a, int b, float x) {
    const juce::SpinLock::ScopedLockType sl(pushLock);
    auto w = fifo.write(1);
    if (w.blockSize1 > 0) msgs[(size_t) w.startIndex1] = { t, a, b, x };
    else if (w.blockSize2 > 0) msgs[(size_t) w.startIndex2] = { t, a, b, x };
}

void FmDmProcessor::setParam(int g, float x) {
    if (g < 0 || g >= NG) return;
    model.base[g] = x;
    push(SET, 0, g, x);
}

void FmDmProcessor::setStep(int voice, int step, int vel, int flag) {
    const int i = voice * MAX_STEPS + step;
    model.vel[i] = (uint8_t) vel;
    model.flag[i] = (uint8_t) flag;
    push(STEP, vel | (flag << 8), i, 0);
}

void FmDmProcessor::play(bool on) { push(on ? PLAY : STOP, 0, 0, 0); }
void FmDmProcessor::trigger(int voice, float vel, int alt) { push(TRIG, voice, alt, vel); }

void FmDmProcessor::pushAll() {
    for (int g = 0; g < NG; g++) push(SET, 0, g, model.base[g]);
    for (int i = 0; i < NUM_VOICES * MAX_STEPS; i++) push(STEP, model.vel[i] | (model.flag[i] << 8), i, 0);
    push(LANES_OFF, 0, 0, 0);
    for (int l = 0; l < NUM_LANES; l++) {
        const Lane& ln = model.lanes[l];
        if (ln.g < 0) continue;
        for (int k = 0; k < ln.len; k++) push(LANE_STEP, l, k, ln.steps[k]);
        if (ln.mode) for (int k = 0; k < ln.len; k++) push(LANE_SHAPE, l, k, ln.shapes[k]);
        push(LANE_FIELD, l, LF_LEN, (float) ln.len);
        push(LANE_FIELD, l, LF_SLEW, ln.slew);
        push(LANE_FIELD, l, LF_SPEED, (float) ln.speed);
        push(LANE_FIELD, l, LF_DEPTH, ln.depth);
        push(LANE_FIELD, l, LF_GROOVE, ln.groove ? 1.f : 0.f);
        push(LANE_FIELD, l, LF_MODE, (float) ln.mode);
        push(LANE_TARGET, l, ln.g, 0);
    }
}

void FmDmProcessor::loadPreset(const juce::var& pr) {
    // the host's tempo wins while it is driving us
    if (!model.fromPreset(pr, hostSync.load())) return;
    pushAll();
    modelVersion++;
}

void FmDmProcessor::setCurrentProgram(int index) {
    const auto& all = factoryPresets();
    if (index < 0 || index >= all.size()) return;
    program = index;
    loadPreset(all[index]);
}

const juce::String FmDmProcessor::getProgramName(int index) {
    const auto& all = factoryPresets();
    return index >= 0 && index < all.size() ? all[index]["name"].toString() : juce::String("init");
}

// ---- audio thread
void FmDmProcessor::apply(const Msg& m) {
    Sequencer& s = *seq;
    switch (m.t) {
        case SET: s.setFlat(m.b, m.x); break;
        case STEP:
            s.vel[m.b] = (uint8_t) (m.a & 0xff);
            s.flag[m.b] = (uint8_t) (m.a >> 8);
            break;
        case PLAY: if (!s.playing) s.start(); startedByHost = false; break;
        case STOP: s.stop(); break;
        case TRIG: engine->trigger(m.a, m.x, m.b); break;
        case LANE_STEP: s.lSteps[m.a * MAX_STEPS + m.b] = m.x; break;
        case LANE_SHAPE: s.lShape[m.a * MAX_STEPS + m.b] = (uint8_t) m.x; break;
        case LANE_FIELD:
            switch (m.b) {
                case LF_LEN: s.lLen[m.a] = (uint8_t) m.x; break;
                case LF_SLEW: s.lSlew[m.a] = m.x; break;
                case LF_SPEED: s.lSpeed[m.a] = (uint8_t) m.x; break;
                case LF_DEPTH: s.lDepth[m.a] = m.x; break;
                case LF_GROOVE: s.lGroove[m.a] = (uint8_t) m.x; break;
                case LF_MODE: s.lMode[m.a] = (uint8_t) m.x; break;
                default: break;
            }
            break;
        case LANE_TARGET: {
            const int l = m.a;
            if (s.lTarget[l] >= 0 && s.lTarget[l] != m.b) s.setFlat(s.lTarget[l], s.base[s.lTarget[l]]);
            s.lTarget[l] = m.b;
            break;
        }
        case LANES_OFF:
            for (int l = 0; l < NUM_LANES; l++) s.clearLane(l);
            break;
    }
}

// a fresh engine at this rate, straight from the model (nothing else runs during prepare)
void FmDmProcessor::applyModelDirect() {
    Sequencer& s = *seq;
    for (int g = 0; g < NG; g++) s.setFlat(g, model.base[g]);
    std::copy(std::begin(model.vel), std::end(model.vel), s.vel);
    std::copy(std::begin(model.flag), std::end(model.flag), s.flag);
    for (int l = 0; l < NUM_LANES; l++) {
        const Lane& ln = model.lanes[l];
        s.lTarget[l] = ln.g;
        std::copy(std::begin(ln.steps), std::end(ln.steps), s.lSteps + l * MAX_STEPS);
        std::copy(std::begin(ln.shapes), std::end(ln.shapes), s.lShape + l * MAX_STEPS);
        s.lLen[l] = (uint8_t) ln.len;
        s.lSlew[l] = ln.slew;
        s.lSpeed[l] = (uint8_t) ln.speed;
        s.lDepth[l] = ln.depth;
        s.lGroove[l] = ln.groove ? 1 : 0;
        s.lMode[l] = (uint8_t) ln.mode;
    }
}

void FmDmProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    sr = sampleRate;
    engine = std::make_unique<Engine>(sr, 1);
    seq = std::make_unique<Sequencer>(*engine, 1);
    fifo.reset();
    applyModelDirect();
    hostWasPlaying = startedByHost = false;
    const int n = juce::jmax(1, samplesPerBlock);
    irSend.setSize(2, n);
    irWet.setSize(2, n);
    monoR.setSize(1, n);
    irSend.clear();
    irWet.clear();
    conv.prepare({ sr, (juce::uint32) n, 2 });
    irLoaded = -1;
    timerCallback();
}

void FmDmProcessor::renderSpan(float* L, float* R, int off, int n) {
    // the engine indexes the IR buffers like its outputs
    engine->irOutL = irSend.getWritePointer(0) + off;
    engine->irOutR = irSend.getWritePointer(1) + off;
    engine->irInL = irWet.getWritePointer(0) + off;
    engine->irInR = irWet.getWritePointer(1) + off;
    seq->process(L + off, R + off, n);
}

static int midiVoice(int note, int& alt) {
    // General MIDI drum notes, plus C1..F1 (36..41) for the six voices in order
    alt = 0;
    switch (note) {
        case 35: case 36: return 0;
        case 37: case 41: case 43: case 45: return 1;
        case 39: case 47: case 48: case 50: return 2;
        case 38: case 40: return 3;
        case 49: case 51: case 52: case 55: case 57: case 59: return 4;
        case 42: case 44: return 5;
        case 46: alt = 1; return 5;
        default: break;
    }
    if (note >= 60) return (note - 60) % 6; // a keyboard: C3 up plays the voices in order
    return -1;
}

void FmDmProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) {
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    if (!seq) {
        buffer.clear();
        return;
    }
    if (irSend.getNumSamples() < n) { // hosts may exceed the block size they announced; rare, so allocate
        irSend.setSize(2, n, true, true);
        irWet.setSize(2, n, true, true);
        monoR.setSize(1, n, false, true);
    }

    // editor messages
    {
        const auto r = fifo.read(fifo.getNumReady());
        for (int i = 0; i < r.blockSize1; i++) apply(msgs[(size_t) (r.startIndex1 + i)]);
        for (int i = 0; i < r.blockSize2; i++) apply(msgs[(size_t) (r.startIndex2 + i)]);
    }

    // host transport: follow its tempo, start and stop with it, and re-align after a loop or a jump
    bool hostPlaying = false;
    if (auto* ph = getPlayHead()) {
        if (auto pos = ph->getPosition()) {
            const auto bpm = pos->getBpm();
            if (bpm && *bpm > 1) {
                const float b = (float) juce::jlimit(40.0, 240.0, *bpm);
                if (b != seq->base[NV + M::bpm]) seq->setFlat(NV + M::bpm, b);
                hostBpm = b;
            }
            hostPlaying = pos->getIsPlaying();
            const auto ppq = pos->getPpqPosition();
            if (hostPlaying && !hostWasPlaying) {
                seq->startAt(ppq ? *ppq : 0);
                startedByHost = true;
            } else if (!hostPlaying && hostWasPlaying && startedByHost) {
                seq->stop();
                startedByHost = false;
            } else if (hostPlaying && ppq) {
                const double expect = lastPpq + n / sr * lastBpm / 60;
                if (std::fabs(*ppq - expect) > 0.05 + n / sr * lastBpm / 60) seq->startAt(*ppq);
            }
            if (ppq) lastPpq = *ppq;
            lastBpm = seq->base[NV + M::bpm];
        }
    }
    hostWasPlaying = hostPlaying;
    hostSync = hostPlaying;

    // render, split at each MIDI note so hits land on their sample
    float* L = buffer.getWritePointer(0);
    float* R = buffer.getNumChannels() > 1 ? buffer.getWritePointer(1) : nullptr;
    const bool mono = R == nullptr; // a mono output: R is rendered aside, then folded in
    if (mono) {
        monoR.clear();
        R = monoR.getWritePointer(0);
    }
    int pos = 0;
    for (const auto meta : midi) {
        const auto msg = meta.getMessage();
        const int at = juce::jlimit(0, n, meta.samplePosition);
        if (at > pos) {
            renderSpan(L, R, pos, at - pos);
            pos = at;
        }
        if (msg.isNoteOn()) {
            int alt = 0;
            const int v = midiVoice(msg.getNoteNumber(), alt);
            if (v >= 0) engine->trigger(v, msg.getFloatVelocity(), alt);
        }
    }
    if (pos < n) renderSpan(L, R, pos, n - pos);
    if (mono) for (int i = 0; i < n; i++) L[i] = (L[i] + R[i]) * 0.5f;
    for (int c = 2; c < buffer.getNumChannels(); c++) buffer.clear(c, 0, n);

    // convolution reverb: this block's send becomes the next block's wet
    if (engine->master[M::rType] >= 0.5f) {
        juce::dsp::AudioBlock<float> in(irSend.getArrayOfWritePointers(), 2, (size_t) n);
        juce::dsp::AudioBlock<float> out(irWet.getArrayOfWritePointers(), 2, (size_t) n);
        conv.process(juce::dsp::ProcessContextNonReplacing<float>(in, out));
    }

    curStep = seq->curStep;
    playing = seq->playing;
    for (int v = 0; v < NUM_VOICES; v++) meters[v] = (float) engine->voices[(size_t) v]->meter;
    meters[6] = (float) engine->peakL;
    meters[7] = (float) engine->peakR;
}

// ---- IR
void FmDmProcessor::timerCallback() {
    const int k = juce::jlimit(0, IR_USER, (int) std::lround(model.base[NV + M::rIr]));
    if (model.base[NV + M::rType] < 0.5f || k == irLoaded) return;
    juce::ScopedLock sl(irLock);
    double rate = sr;
    auto b = makeIR(k, sr, rate, &userIR, userIRRate);
    irLoaded = k;
    if (b.getNumSamples() == 0) return;
    conv.loadImpulseResponse(std::move(b), rate, juce::dsp::Convolution::Stereo::yes, juce::dsp::Convolution::Trim::no,
                             juce::dsp::Convolution::Normalise::no);
}

bool FmDmProcessor::loadUserIR(const juce::File& f) {
    juce::AudioBuffer<float> b;
    double rate = 0;
    if (!readAudioFile(f, b, rate)) return false;
    {
        juce::ScopedLock sl(irLock);
        userIR = std::move(b);
        userIRRate = rate;
        userIRName = f.getFileNameWithoutExtension();
    }
    setParam(NV + M::rIr, (float) IR_USER);
    setParam(NV + M::rType, 1);
    irLoaded = -1;
    timerCallback();
    return true;
}

// ---- state: the preset JSON (same format as the browser), plus the plugin's own extras
void FmDmProcessor::getStateInformation(juce::MemoryBlock& destData) {
    auto pr = model.toPreset(model.name);
    if (auto* o = pr.getDynamicObject()) {
        o->setProperty("app", "fm dm plugin");
        o->setProperty("program", program);
    }
    juce::MemoryOutputStream(destData, false).writeString(juce::JSON::toString(pr, true));
}

void FmDmProcessor::setStateInformation(const void* data, int sizeInBytes) {
    juce::MemoryInputStream in(data, (size_t) sizeInBytes, false);
    const auto pr = juce::JSON::parse(in.readString());
    program = (int) pr.getProperty("program", 0);
    if (model.fromPreset(pr, false)) {
        pushAll();
        modelVersion++;
    }
}

juce::AudioProcessorEditor* FmDmProcessor::createEditor() { return new FmDmEditor(*this); }

} // namespace fmdm

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new fmdm::FmDmProcessor(); }
