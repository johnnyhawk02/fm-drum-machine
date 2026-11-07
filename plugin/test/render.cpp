// Renders each voice and a short beat with the C++ engine, as raw float32 stereo files, so
// test/compare.mjs can check them against the JS engine. No JUCE needed.
//   c++ -std=c++17 -O2 -Iengine engine/*.cpp test/render.cpp -o render && ./render out/
#include "Sequencer.h"
#include <cstdio>
#include <string>
#include <vector>

using namespace fmdm;

static void writeRaw(const std::string& path, const std::vector<float>& L, const std::vector<float>& R) {
    FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) { std::perror(path.c_str()); return; }
    for (size_t i = 0; i < L.size(); i++) { std::fwrite(&L[i], 4, 1, f); std::fwrite(&R[i], 4, 1, f); }
    std::fclose(f);
}

int main(int argc, char** argv) {
    const std::string dir = argc > 1 ? argv[1] : ".";
    const int SR = 48000;
    for (int v = 0; v < 6; v++)
        for (int alt = 0; alt <= (v == 5 ? 1 : 0); alt++) {
            Engine e(SR, 1);
            const int n = SR * 3 / 2;
            std::vector<float> L(n), R(n);
            e.trigger(v, 1, alt);
            e.process(L.data(), R.data(), n);
            writeRaw(dir + "/voice" + std::to_string(v) + (alt ? "o" : "") + ".f32", L, R);
        }
    // sequencer: a beat with fx, crossfeed, swing and a lane, 2 bars in 128-sample blocks
    {
        Engine e(SR, 1);
        Sequencer s(e, 1);
        const int pat[6][16] = { { 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0 }, { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0 },
                                 { 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0 }, { 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0 },
                                 { 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }, { 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 } };
        for (int v = 0; v < 6; v++) for (int k = 0; k < 16; k++) if (pat[v][k]) s.vel[v * MAX_STEPS + k] = (k % 4) ? 90 : 127;
        s.flag[5 * MAX_STEPS + 14] = F_OPEN;
        s.flag[0 * MAX_STEPS + 12] = F_ACCENT;
        s.setFlat(3 * NP + P::sEcho, 0.4f);
        s.setFlat(3 * NP + P::sRev, 0.5f);
        s.setFlat(1 * NP + P::sDist, 0.5f);
        s.setFlat(2 * NP + P::sRing, 0.5f);
        s.setFlat(NV + M::dkAmt, 0.6f);
        s.setFlat(NV + M::mdMix, 0.4f);
        s.setFlat(NV + M::swDepth, 0.5f);
        s.setFlat(NV + M::xa01, 0.3f);
        s.setFlat(NV + M::rushEvery, 1);
        s.lTarget[0] = 5 * NP + P::aDec;
        for (int k = 0; k < 16; k++) s.lSteps[k] = (k % 4) / 3.0f - 0.5f;
        s.lDepth[0] = 0.4f;
        s.start();
        const int n = SR * 4;
        std::vector<float> L(n), R(n);
        for (int o = 0; o < n; o += 128) s.process(L.data() + o, R.data() + o, 128);
        writeRaw(dir + "/beat.f32", L, R);
    }
    std::printf("rendered to %s\n", dir.c_str());
    return 0;
}
