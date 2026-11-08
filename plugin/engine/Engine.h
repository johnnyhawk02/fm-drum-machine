// fm/dm — top-level engine (C++ port of src/engine/engine.js): six voices, crossfeed, sends, FX,
// master chain. process() allocates nothing. Parameters live in two flat float arrays:
//   params  NUM_VOICES * NP  (voice blocks)
//   master  MP               (fx, mixer, crossfeed)
#pragma once
#include "Voice.h"
#include "Fx.h"
#include <memory>

namespace fmdm {

class Engine {
public:
    explicit Engine(double sampleRate = 48000, uint32_t seed = 1);

    void trigger(int v, double vel = 1, int alt = 0); // vel 0..1, alt=1 for open hat
    void process(float* outL, float* outR, int n, int off = 0);

    double sr;
    float params[NV];
    float master[MP];
    std::vector<std::unique_ptr<Voice>> voices;

    // convolution reverb runs outside the engine: the send goes out on irOut, the wet comes back on irIn
    // (both indexed like outL/outR; null when not connected)
    float *irInL = nullptr, *irInR = nullptr, *irOutL = nullptr, *irOutR = nullptr;

    double peakL = 0, peakR = 0, gr = 0;

private:
    void control();

    Echo echo;
    Reverb reverb;
    Distortion sendDist, mdist;
    Compressor comp;
    Svf hpL, hpR;
    bool hpOn = false, anySolo = false;
    double irTone = 0, irLpL = 0, irLpR = 0;
    double ringPh = 0, duck = 0, duckC = 0;
    int ctr = 0;
    double xPh[NUM_VOICES] = {};
    double xSrc[NUM_VOICES] = {};
};

} // namespace fmdm
