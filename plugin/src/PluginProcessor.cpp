#include "PluginProcessor.h"
#include "WebEditor.h"

namespace fmdm {

FmDmProcessor::FmDmProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)) {
    pending.reserve(1 << 16);
    if (factoryPresets().size() > 0) model.fromPreset(factoryPresets()[0], false);
    startTimerHz(40);
}

bool FmDmProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    const auto& out = layouts.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::stereo() || out == juce::AudioChannelSet::mono();
}

// ---- messages to the audio thread
void FmDmProcessor::push(MsgType t, int a, int b, float x, bool atBar) {
    const juce::SpinLock::ScopedLockType sl(pushLock);
    auto w = fifo.write(1);
    if (w.blockSize1 > 0) msgs[(size_t) w.startIndex1] = { t, atBar, a, b, x };
    else if (w.blockSize2 > 0) msgs[(size_t) w.startIndex2] = { t, atBar, a, b, x };
}

void FmDmProcessor::pushPreset(const Model& md, bool atBar) {
    for (int g = 0; g < NG; g++) push(SET, 0, g, md.base[g], atBar);
    for (int i = 0; i < NUM_VOICES * MAX_STEPS; i++) push(STEP, md.vel[i] | (md.flag[i] << 8), i, 0, atBar);
    push(LANES_OFF, 0, 0, 0, atBar);
    for (int l = 0; l < NUM_LANES; l++) {
        const Lane& ln = md.lanes[l];
        if (ln.g < 0) continue;
        for (int k = 0; k < MAX_STEPS; k++) push(LANE_STEP, l, k, ln.steps[k], atBar);
        for (int k = 0; k < MAX_STEPS; k++) push(LANE_SHAPE, l, k, ln.shapes[k], atBar);
        push(LANE_FIELD, l, LF_LEN, (float) ln.len, atBar);
        push(LANE_FIELD, l, LF_SLEW, ln.slew, atBar);
        push(LANE_FIELD, l, LF_SPEED, (float) ln.speed, atBar);
        push(LANE_FIELD, l, LF_DEPTH, ln.depth, atBar);
        push(LANE_FIELD, l, LF_GROOVE, ln.groove ? 1.f : 0.f, atBar);
        push(LANE_FIELD, l, LF_MODE, (float) ln.mode, atBar);
        push(LANE_TARGET, l, ln.g, 0, atBar);
    }
}

// ---- from the page: the same messages its AudioWorklet takes (src/worklet.js), plus a few for the plugin
static float fnum(const juce::var& v) { return (float) (double) v; }

void FmDmProcessor::pageMsg(const juce::var& m, bool atBar) {
    atBar = atBar || (bool) m.getProperty("atBar", false);
    const auto t = m["t"].toString();
    if (t == "set") {
        const int g = (int) m["g"];
        if (g < 0 || g >= NG) return;
        model.base[g] = fnum(m["x"]);
        push(SET, 0, g, model.base[g], atBar);
    } else if (t == "all") {
        if (auto* b = m["base"].getArray())
            for (int g = 0; g < juce::jmin(NG, b->size()); g++) {
                model.base[g] = fnum((*b)[g]);
                push(SET, 0, g, model.base[g], atBar);
            }
    } else if (t == "pat") {
        auto* v = m["vel"].getArray();
        auto* f = m["flag"].getArray();
        if (!v || !f) return;
        for (int i = 0; i < juce::jmin(NUM_VOICES * MAX_STEPS, v->size(), f->size()); i++) {
            model.vel[i] = (uint8_t) (int) (*v)[i];
            model.flag[i] = (uint8_t) (int) (*f)[i];
            push(STEP, model.vel[i] | (model.flag[i] << 8), i, 0, atBar);
        }
    } else if (t == "lane") {
        const int l = (int) m["l"], g = (int) m["g"];
        if (l < 0 || l >= NUM_LANES) return;
        Lane& ln = model.lanes[l];
        if (g < 0) {
            ln = Lane();
            push(LANE_TARGET, l, -1, 0, atBar);
            return;
        }
        if (auto* st = m["steps"].getArray())
            for (int k = 0; k < juce::jmin(MAX_STEPS, st->size()); k++) push(LANE_STEP, l, k, ln.steps[k] = fnum((*st)[k]), atBar);
        if (auto* sh = m["shapes"].getArray())
            for (int k = 0; k < juce::jmin(MAX_STEPS, sh->size()); k++) push(LANE_SHAPE, l, k, ln.shapes[k] = (uint8_t) (int) (*sh)[k], atBar);
        ln.len = juce::jlimit(1, MAX_STEPS, (int) m["len"]);
        ln.slew = fnum(m["slew"]);
        ln.speed = juce::jlimit(0, 7, (int) m["speed"]);
        ln.depth = fnum(m["depth"]);
        ln.groove = (bool) m["groove"];
        ln.mode = (int) m.getProperty("mode", 0);
        ln.g = g;
        push(LANE_FIELD, l, LF_LEN, (float) ln.len, atBar);
        push(LANE_FIELD, l, LF_SLEW, ln.slew, atBar);
        push(LANE_FIELD, l, LF_SPEED, (float) ln.speed, atBar);
        push(LANE_FIELD, l, LF_DEPTH, ln.depth, atBar);
        push(LANE_FIELD, l, LF_GROOVE, ln.groove ? 1.f : 0.f, atBar);
        push(LANE_FIELD, l, LF_MODE, (float) ln.mode, atBar);
        push(LANE_TARGET, l, g, 0, atBar);
    } else if (t == "lanesOff") {
        for (auto& ln : model.lanes) ln = Lane();
        push(LANES_OFF, 0, 0, 0, atBar);
    } else if (t == "bundle") {
        if (auto* a = m["msgs"].getArray())
            for (auto& x : *a) pageMsg(x, atBar);
    } else if (t == "play") {
        push(PLAY, 0, 0, 0);
    } else if (t == "stop") {
        push(STOP, 0, 0, 0);
    } else if (t == "trig") {
        push(TRIG, (int) m["v"], (int) m.getProperty("alt", 0), fnum(m.getProperty("vel", 1.0)));
    } else if (t == "rec") {
        push(REC, (int) m.getProperty("mode", 0), (int) m.getProperty("bars", 4), 0);
    }
}

void FmDmProcessor::fromPage(const juce::var& m) {
    const auto t = m["t"].toString();
    if (t == "hello") {
        // the page has opened: give it the saved state, or let it keep the kit it started with
        auto* o = new juce::DynamicObject();
        o->setProperty("t", "state");
        o->setProperty("sr", sr);
        if (haveState) {
            o->setProperty("preset", pageState.isObject() ? pageState : model.toPreset(model.name));
            o->setProperty("name", pageState.isObject() ? pageState["name"] : juce::var(model.name));
        }
        if (toPage) toPage(juce::var(o));
        return;
    }
    if (t == "ready") {
        if (onPageReady) onPageReady();
        return;
    }
    if (t == "state") {
        pageState = m["preset"];
        haveState = true;
        return;
    }
    if (t == "irUser") {
        auto* ch = m["ch"].getArray();
        if (!ch || ch->isEmpty()) return;
        std::vector<juce::MemoryBlock> data;
        for (auto& c : *ch) {
            juce::MemoryOutputStream os;
            juce::Base64::convertFromBase64(os, c.toString());
            data.push_back(os.getMemoryBlock());
        }
        const int n = (int) (data[0].getSize() / sizeof(float));
        userIR.setSize((int) data.size(), n);
        for (int c = 0; c < (int) data.size(); c++)
            std::memcpy(userIR.getWritePointer(c), data[(size_t) c].getData(), (size_t) juce::jmin(n, (int) (data[(size_t) c].getSize() / sizeof(float))) * sizeof(float));
        userIRRate = (double) m.getProperty("sr", 48000);
        irLoaded = -1;
        syncIR();
        return;
    }
    if (t == "save") {
        // a download from the page (a recording, an exported preset file)
        auto data = std::make_shared<juce::MemoryOutputStream>();
        juce::Base64::convertFromBase64(*data, m["data"].toString());
        const auto name = juce::File::createLegalFileName(m["name"].toString());
        chooser = std::make_unique<juce::FileChooser>("save", juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile(name));
        chooser->launchAsync(juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles | juce::FileBrowserComponent::warnAboutOverwriting,
                             [data](const juce::FileChooser& fc) {
                                 const auto f = fc.getResult();
                                 if (f != juce::File()) f.replaceWithData(data->getData(), data->getDataSize());
                             });
        return;
    }
    pageMsg(m, false);
}

// DAW program change: the factory preset straight into the engine (the page shows it next time it opens)
void FmDmProcessor::setCurrentProgram(int index) {
    const auto& all = factoryPresets();
    if (index < 0 || index >= all.size()) return;
    program = index;
    if (!model.fromPreset(all[index], hostSync.load())) return;
    pageState = all[index];
    haveState = true;
    pushPreset(model, false);
    if (toPage) fromPage(juce::JSON::parse("{\"t\":\"hello\"}"));
}

const juce::String FmDmProcessor::getProgramName(int index) {
    const auto& all = factoryPresets();
    return index >= 0 && index < all.size() ? all[index]["name"].toString() : juce::String("init");
}

// ---- audio thread
void FmDmProcessor::onAudio(const Msg& m) {
    // like the worklet: changes marked for the next bar wait while playing
    if (m.atBar && seq->playing) {
        if (pending.size() < pending.capacity()) pending.push_back(m);
        return;
    }
    apply(m);
}

void FmDmProcessor::apply(const Msg& m) {
    Sequencer& s = *seq;
    switch (m.t) {
        case SET: s.setFlat(m.b, m.x); break;
        case STEP:
            s.vel[m.b] = (uint8_t) (m.a & 0xff);
            s.flag[m.b] = (uint8_t) (m.a >> 8);
            break;
        case PLAY:
            pending.clear();
            s.start();
            lastBars = s.bars;
            startedByHost = false;
            break;
        case STOP:
            s.stop();
            for (auto& x : pending) apply(x);
            pending.clear();
            break;
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
            if (m.b < 0) s.lOut[l] = 0;
            break;
        }
        case LANES_OFF:
            for (int l = 0; l < NUM_LANES; l++) s.clearLane(l);
            break;
        case REC:
            // mode 0 stop, 1 free, 2 exact loop of b bars (starts at the next bar, or now if stopped)
            if (m.a == 0) {
                recMode = 0;
                recStarted = false;
                recDone = 1;
            } else if (m.a == 1) recMode = 1;
            else {
                recLeft = (long) std::lround(m.b * 4 * 60 * sr / engine->master[M::bpm]);
                if (!s.playing) {
                    s.start();
                    lastBars = s.bars;
                }
                recStarted = false;
                recMode = 2;
            }
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
    pending.clear();
    applyModelDirect();
    hostWasPlaying = startedByHost = false;
    lastBars = 0;
    recMode = 0;
    const int n = juce::jmax(1, samplesPerBlock);
    irSend.setSize(2, n);
    irWet.setSize(2, n);
    monoR.setSize(1, n);
    irSend.clear();
    irWet.clear();
    conv.prepare({ sr, (juce::uint32) n, 2 });
    irLoaded = -1;
    syncIR();
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
    // General MIDI drum notes, plus C3 upwards for the six voices in order
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
    if (note >= 60) return (note - 60) % 6;
    return -1;
}

void FmDmProcessor::record(const float* L, const float* R, int n) {
    if (recMode == 2 && seq->barOff >= 0) recMode = 3; // armed loop: starts at this bar
    if (recMode != 1 && recMode != 3) return;
    int i0 = 0, i1 = n;
    if (recMode == 3 && !recStarted) {
        i0 = juce::jmax(0, seq->barOff);
        recStarted = true;
    }
    if (recMode == 3 && i1 - i0 > recLeft) i1 = i0 + (int) recLeft;
    const int frames = juce::jmax(0, i1 - i0);
    auto w = recFifo.write(frames * 2);
    int k = 0;
    for (int i = 0; i < w.blockSize1 + w.blockSize2; i += 2, k++) {
        const int at = (i < w.blockSize1 ? w.startIndex1 + i : w.startIndex2 + i - w.blockSize1);
        recBuf[(size_t) at] = L[i0 + k];
        recBuf[(size_t) at + 1] = R[i0 + k];
    }
    if (recMode == 3) {
        recLeft -= frames;
        if (recLeft <= 0) {
            recMode = 0;
            recStarted = false;
            recDone = 1;
        }
    }
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

    {
        const auto r = fifo.read(fifo.getNumReady());
        for (int i = 0; i < r.blockSize1; i++) onAudio(msgs[(size_t) (r.startIndex1 + i)]);
        for (int i = 0; i < r.blockSize2; i++) onAudio(msgs[(size_t) (r.startIndex2 + i)]);
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
                pending.clear();
                seq->startAt(ppq ? *ppq : 0);
                lastBars = seq->bars;
                startedByHost = true;
            } else if (!hostPlaying && hostWasPlaying && startedByHost) {
                seq->stop();
                for (auto& x : pending) apply(x);
                pending.clear();
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

    float* L = buffer.getWritePointer(0);
    float* R = buffer.getNumChannels() > 1 ? buffer.getWritePointer(1) : nullptr;
    const bool mono = R == nullptr;
    if (mono) {
        monoR.clear();
        R = monoR.getWritePointer(0);
    }
    // render, split at each MIDI note so hits land on their sample
    int pos = 0, barAt = -1;
    auto span = [&](int to) {
        if (to <= pos) return;
        renderSpan(L, R, pos, to - pos);
        if (seq->barOff >= 0 && barAt < 0) barAt = pos + seq->barOff;
        pos = to;
    };
    for (const auto meta : midi) {
        const auto msg = meta.getMessage();
        span(juce::jlimit(0, n, meta.samplePosition));
        if (msg.isNoteOn()) {
            int alt = 0;
            const int v = midiVoice(msg.getNoteNumber(), alt);
            if (v >= 0) engine->trigger(v, msg.getFloatVelocity(), alt);
        } else if (msg.isController()) {
            auto w = ccFifo.write(1);
            if (w.blockSize1 > 0) {
                ccBuf[w.startIndex1][0] = 0xb0 | (msg.getChannel() - 1);
                ccBuf[w.startIndex1][1] = msg.getControllerNumber();
                ccBuf[w.startIndex1][2] = msg.getControllerValue();
            }
        }
    }
    span(n);
    seq->barOff = barAt;

    // the bar changed: apply what waited for it
    if (seq->bars != lastBars) {
        lastBars = seq->bars;
        if (!pending.empty()) {
            for (auto& x : pending) apply(x);
            pending.clear();
        }
    }
    record(L, R, n);
    if (mono) for (int i = 0; i < n; i++) L[i] = (L[i] + R[i]) * 0.5f;
    for (int c = 2; c < buffer.getNumChannels(); c++) buffer.clear(c, 0, n);

    // convolution reverb: this block's send becomes the next block's wet
    if (engine->master[M::rType] >= 0.5f) {
        juce::dsp::AudioBlock<float> in(irSend.getArrayOfWritePointers(), 2, (size_t) n);
        juce::dsp::AudioBlock<float> out(irWet.getArrayOfWritePointers(), 2, (size_t) n);
        conv.process(juce::dsp::ProcessContextNonReplacing<float>(in, out));
    }

    curStep = seq->curStep;
    stepIdx = seq->stepIdx;
    bars = seq->bars;
    playing = seq->playing;
    pendingN = (int) pending.size();
    rush = seq->inRush ? (float) seq->rushC : -1.f;
    gr = (float) engine->gr;
    for (int v = 0; v < NUM_VOICES; v++) meters[v] = (float) engine->voices[(size_t) v]->meter;
    meters[6] = (float) engine->peakL;
    meters[7] = (float) engine->peakR;
    for (int l = 0; l < NUM_LANES; l++) {
        lanes[l] = seq->lOut[l];
        lpos[l] = seq->lPos[l];
    }
}

// ---- to the page, and the IR, on the message thread
static juce::var obj(std::initializer_list<std::pair<const char*, juce::var>> kv) {
    auto* o = new juce::DynamicObject();
    for (auto& [k, v] : kv) o->setProperty(k, v);
    return juce::var(o);
}

void FmDmProcessor::timerCallback() {
    syncIR();
    if (!toPage) {
        // nobody to send to: drop recorded audio and CCs
        recFifo.reset();
        ccFifo.reset();
        return;
    }
    juce::Array<juce::var> m8, ln, lp;
    for (auto& x : meters) m8.add(x.load());
    for (auto& x : lanes) ln.add(x.load());
    for (auto& x : lpos) lp.add(x.load());
    toPage(obj({ { "t", "st" }, { "step", curStep.load() }, { "stepIdx", (juce::int64) stepIdx.load() }, { "playing", playing.load() },
                 { "meters", m8 }, { "gr", gr.load() }, { "lanes", ln }, { "lpos", lp }, { "rush", rush.load() }, { "pending", pendingN.load() },
                 { "hostBpm", hostSync.load() ? juce::var(hostBpm.load()) : juce::var(0) } }));
    const long b = bars.load();
    if (b != sentBars) {
        sentBars = b;
        toPage(obj({ { "t", "bar" }, { "bars", (juce::int64) b } }));
    }
    // recorded audio, as base64 float32 (interleaved L R), then the end marker
    const int ready = recFifo.getNumReady() & ~1;
    const bool done = recDone.load() != 0;
    if (ready > 0 || done) {
        const auto r = recFifo.read(ready);
        juce::MemoryBlock mb;
        mb.append(recBuf.data() + r.startIndex1, (size_t) r.blockSize1 * sizeof(float));
        mb.append(recBuf.data() + r.startIndex2, (size_t) r.blockSize2 * sizeof(float));
        if (done) recDone = 0;
        toPage(obj({ { "t", "rec" }, { "data", juce::Base64::toBase64(mb.getData(), mb.getSize()) }, { "done", done } }));
    }
    const auto c = ccFifo.read(ccFifo.getNumReady());
    for (int i = 0; i < c.blockSize1 + c.blockSize2; i++) {
        const int at = i < c.blockSize1 ? c.startIndex1 + i : c.startIndex2 + i - c.blockSize1;
        toPage(obj({ { "t", "midi" }, { "data", juce::Array<juce::var> { ccBuf[at][0], ccBuf[at][1], ccBuf[at][2] } } }));
    }
}

// keep the convolver on the impulse response the model points at
void FmDmProcessor::syncIR() {
    const int k = juce::jlimit(0, IR_USER, (int) std::lround(model.base[NV + M::rIr]));
    if (model.base[NV + M::rType] < 0.5f || k == irLoaded) return;
    double rate = sr;
    auto b = makeIR(k, sr, rate, &userIR, userIRRate);
    irLoaded = k;
    if (b.getNumSamples() == 0) return;
    conv.loadImpulseResponse(std::move(b), rate, juce::dsp::Convolution::Stereo::yes, juce::dsp::Convolution::Trim::no,
                             juce::dsp::Convolution::Normalise::no);
}

// ---- state: the preset JSON (same format as the browser's presets)
void FmDmProcessor::getStateInformation(juce::MemoryBlock& destData) {
    auto pr = pageState.isObject() ? pageState : model.toPreset(model.name);
    auto* o = new juce::DynamicObject();
    o->setProperty("app", "fm dm plugin");
    o->setProperty("program", program);
    o->setProperty("preset", pr);
    juce::MemoryOutputStream(destData, false).writeString(juce::JSON::toString(juce::var(o), true));
}

void FmDmProcessor::setStateInformation(const void* data, int sizeInBytes) {
    juce::MemoryInputStream in(data, (size_t) sizeInBytes, false);
    const auto st = juce::JSON::parse(in.readString());
    program = (int) st.getProperty("program", 0);
    const auto pr = st["preset"];
    if (model.fromPreset(pr, false)) {
        pageState = pr;
        haveState = true;
        pushPreset(model, false);
        if (toPage) fromPage(juce::JSON::parse("{\"t\":\"hello\"}"));
    }
}

juce::AudioProcessorEditor* FmDmProcessor::createEditor() { return new WebEditor(*this); }

} // namespace fmdm

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new fmdm::FmDmProcessor(); }
