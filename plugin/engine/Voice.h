// fm/dm — one FM drum voice (C++ port of src/engine/voice.js). 4 operators, pitch env, click, noise,
// filter, amp env, crush, LFO. Mono: a retrigger chokes itself (closed hat chokes open).
#pragma once
#include "Dsp.h"
#include "ParamsGen.h"

namespace fmdm {

class Voice {
public:
    Voice(double sampleRate, uint32_t seed);
    void reset();
    void trigger(const float* p, double vel, int alt);
    void process(const float* p);

    bool active = false;
    double L = 0, R = 0, mono = 0, meter = 0;
    double inc[4] = {};             // op phase increments this sample (crossfeed reads inc[0])
    double xPm = 0, xCut = 0, xRing = 0; // crossfeed, set by the engine each sample
    double amp = 0, nEnv = 0, clkEnv = 0;

private:
    void start(const float* p, double vel, int alt);
    void control(const float* p);

    double sr;
    Rng rng;
    double ph[4] = {}, incBase[4] = {};
    float env[4] = {}, atkInc[4] = {}, decC[4] = {}, out[4] = {}, aa[4] = { 1, 1, 1, 1 };
    uint8_t stage[4] = {};
    double fbz = 0, fbz2 = 0;
    Svf filt, nfilt;
    OnePole wob;
    double lfoPh = 0, lfoVal = 0, lfoSH = 0;
    double lPitch = 0, lFm = 0, lCut = 0, lLvl = 0, lPan = 0, lNoise = 0, lRatio = 0;
    double velAmp = 1, fmIdx = 0, wobAmt = 0, hPitch = 1, hIdx = 1, driftInc = 0, trimG = 1, pSemis = 0;
    int fixedMask = 0, fade = 0, pendAlt = 0;
    double pendVel = 1;
    double vel = 1;
    long t = 0;
    double ampX = 0, ampStartLvl = 0, ampAtkInc = 0, ampHoldN = 0, ampDecInc = 0, ampK = 1;
    int ampStage = 3;
    double pEnv = 0, pC = 0, fEnv = 0, fC = 0, clkC = 0, clkPh = 0;
    int nStage = 2;
    double nAtkInc = 0, nC = 0;
    int burst = 0, nBursts = 1;
    double burstT = 0, burstN = 0, burstGap = 0, burstC = 0;
    double crushHold = 0, crushN = 0;
    int ctr = 0;
};

} // namespace fmdm
