// fm/dm — sample-accurate step sequencer, groove, rush and knob step sequencers ("lanes").
// C++ port of src/seq/sequencer.js. Wraps an Engine. No allocation in process().
#pragma once
#include "Engine.h"

namespace fmdm {

constexpr int MAX_STEPS = 128; // 8 bars of 16ths
constexpr int NUM_LANES = 32;
constexpr int F_OPEN = 1;      // hat step plays open
constexpr int F_ACCENT = 2;
constexpr int NG = NV + MP;    // flat index space: voice blocks, then master

// flat-index spec access (g = v*NP+i for voices, NV+i for master)
const ParamSpec& specOf(int g);
double normOf(int g, double x);
double denormOf(int g, double n);
double envShape(int k, double t);

class Sequencer {
public:
    explicit Sequencer(Engine& engine, uint32_t seed = 1);

    void setFlat(int g, float x);
    float getFlat(int g) const { return base[g]; }
    void clearLane(int l);

    void start();
    // start in step with a host at this position (quarter notes)
    void startAt(double ppq);
    void stop();
    void process(float* outL, float* outR, int n);

    Engine& e;
    double sr;
    uint8_t vel[NUM_VOICES * MAX_STEPS] = {};
    uint8_t flag[NUM_VOICES * MAX_STEPS] = {};
    float base[NG];
    // lanes
    int lTarget[NUM_LANES];
    float lSteps[NUM_LANES * MAX_STEPS] = {};
    uint8_t lLen[NUM_LANES];
    float lSlew[NUM_LANES] = {};
    uint8_t lSpeed[NUM_LANES] = {};
    float lDepth[NUM_LANES];
    uint8_t lGroove[NUM_LANES];
    uint8_t lMode[NUM_LANES] = {};
    uint8_t lShape[NUM_LANES * MAX_STEPS] = {};
    float lCur[NUM_LANES] = {};
    int16_t lPos[NUM_LANES] = {};
    float lOut[NUM_LANES] = {};
    // transport
    bool playing = false;
    double clock = 0, nextStep = 0, nominal = 0;
    long stepIdx = 0;
    int curStep = -1;
    long bars = 0;
    bool inRush = false;
    double rushC = 0;
    int barOff = -1;

private:
    double stepLen() const;
    double swingOffset(int k);
    void endRush();
    void fireStep();
    void updateLanes(double dt);

    Rng rng;
    double clock16 = 0; // 16ths before clock 0 (host start offset)
    double ratT[8] = {};
    int ratN = 0, ratI = 0, ratVoice = 0;
    double ratVel = 1;
};

} // namespace fmdm
