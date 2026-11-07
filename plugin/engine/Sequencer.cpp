#include "Sequencer.h"
#include <cstring>

namespace fmdm {

const ParamSpec& specOf(int g) { return g >= NV ? MASTER_SPEC[g - NV] : VOICE_SPEC[g % NP]; }

double normOf(int g, double x) {
    const ParamSpec& s = specOf(g);
    if (s.curve == CURVE_EXP) return std::log(x / s.min) / std::log((double) s.max / s.min);
    return (x - s.min) / ((double) s.max - s.min);
}
double denormOf(int g, double n) {
    n = n < 0 ? 0 : n > 1 ? 1 : n;
    const ParamSpec& s = specOf(g);
    if (s.curve == CURVE_EXP) return s.min * std::pow((double) s.max / s.min, n);
    const double x = s.min + n * ((double) s.max - s.min);
    return s.curve == CURVE_INT ? std::floor(x + 0.5) : x;
}

// envelope-mode lane shapes (src/seq/modseq.js)
double envShape(int k, double t) {
    switch (k) {
        case 0: return t < 0.02 ? t / 0.02 : std::exp(-(t - 0.02) * 7);   // perc
        case 1: return t < 0.01 ? t / 0.01 : std::exp(-(t - 0.01) * 18);  // pluck
        case 2: return t < 0.04 ? t / 0.04 : std::exp(-(t - 0.04) * 2.5); // long
        case 3: return (std::exp(4 * t) - 1) / 53.598;                     // swell
        case 4: return t;                                                  // rise
        case 5: return 1 - t;                                              // fall
        case 6: return t < 0.5 ? t * 2 : 2 - t * 2;                        // tri
        case 7: return t < 0.02 ? t / 0.02 : t < 0.7 ? 1 : t < 0.74 ? (0.74 - t) / 0.04 : 0; // gate
        default: return t < 0.5 ? std::exp(-t * 14) : 0.6 * std::exp(-(t - 0.5) * 14);      // bounce
    }
}

Sequencer::Sequencer(Engine& engine, uint32_t seed) : e(engine), sr(engine.sr), rng(seed ^ 0x5bd1e995u) {
    std::memcpy(base, e.params, sizeof(e.params));
    std::memcpy(base + NV, e.master, sizeof(e.master));
    for (int l = 0; l < NUM_LANES; l++) {
        lTarget[l] = -1;
        lLen[l] = 16;
        lDepth[l] = 0.5f;
        lGroove[l] = 1;
    }
}

void Sequencer::setFlat(int g, float x) {
    if (g < 0 || g >= NG) return;
    base[g] = x;
    if (g < NV) e.params[g] = x;
    else e.master[g - NV] = x;
}

void Sequencer::clearLane(int l) {
    const int g = lTarget[l];
    if (g >= 0) setFlat(g, base[g]);
    lTarget[l] = -1;
    lOut[l] = 0;
}

double Sequencer::stepLen() const { return sr * 60.0 / e.master[M::bpm] / 4; }

void Sequencer::start() {
    playing = true;
    clock = 0;
    clock16 = 0;
    stepIdx = 0;
    nominal = 0;
    nextStep = 0;
    ratN = ratI = 0;
    for (int l = 0; l < NUM_LANES; l++) lCur[l] = lSteps[l * MAX_STEPS];
}

void Sequencer::startAt(double ppq) {
    start();
    if (ppq <= 0) return;
    const double p16 = ppq * 4;
    stepIdx = (long) std::ceil(p16 - 1e-6);
    clock16 = p16;
    nominal = (stepIdx - p16) * stepLen();
    nextStep = nominal + swingOffset((int) (stepIdx % 16));
    // bars counts bar starts; keep it in step with the host's bar
    bars = stepIdx / 16;
}

void Sequencer::stop() {
    playing = false;
    curStep = -1;
    endRush();
    // restore modulated targets to base
    for (int l = 0; l < NUM_LANES; l++) {
        const int g = lTarget[l];
        if (g >= 0) setFlat(g, base[g]);
        lOut[l] = 0;
    }
}

double Sequencer::swingOffset(int k) {
    const float* m = e.master;
    const double d = m[M::swDepth];
    if (d <= 0) return 0;
    const double sl = stepLen();
    const int t = (int) m[M::swType];
    const int q = k & 3;
    if (t == 0) return (k & 1) ? d * 0.33 * sl : 0;
    if (t == 1) return q >= 2 ? d * 0.66 * sl : 0;
    if (t == 2) return (k & 1) ? d * 0.5 * sl : 0;
    return rng.bi() * d * 0.15 * sl + d * 0.15 * sl;
}

void Sequencer::endRush() {
    if (inRush) {
        inRush = false;
        e.master[M::mHp] = base[NV + M::mHp];
    }
}

void Sequencer::fireStep() {
    float* m = e.master;
    int len = (int) m[M::patLen];
    if (len <= 0) len = 16;
    if (len > MAX_STEPS) len = MAX_STEPS;
    const int k = (int) (stepIdx % len);
    curStep = k;
    if (stepIdx % 16 == 0) bars++;
    // rush window
    int ei = (int) m[M::rushEvery];
    ei = ei < 0 ? 0 : ei > 4 ? 4 : ei;
    const int every = RUSH_EVERY[ei];
    bool rush = false;
    if (every > 0) {
        const long cyc = every * 16;
        int rl = (int) m[M::rushLen];
        if (rl < 1) rl = 1;
        const long pos = stepIdx % cyc;
        const long ws = cyc - rl;
        if (pos >= ws) {
            rush = true;
            int ci = (int) std::floor((double) (pos - ws) / rl * 16);
            if (ci > 15) ci = 15;
            const double c = m[M::rc0 + ci];
            rushC = c;
            inRush = true;
            m[M::mHp] = (float) (20 * std::pow(m[M::rushHp] / 20.0, c));
            const int rv = (int) m[M::rushVoice];
            const int rate = 1 + (int) std::floor(c * ((int) m[M::rushRate] - 1) + 0.5);
            const double v = 0.5 + 0.5 * c;
            e.trigger(rv, v, 0);
            const double sl = stepLen();
            ratN = 0;
            ratI = 0;
            for (int j = 1; j < rate && j < 8; j++) ratT[ratN++] = nextStep + j * sl / rate;
            ratVel = v;
            ratVoice = rv;
        }
    }
    if (!rush) {
        endRush();
        const double acc = m[M::accent];
        for (int v = 0; v < NUM_VOICES; v++) {
            const int i = v * MAX_STEPS + k;
            const int vl = vel[i];
            if (vl) {
                const int f = flag[i];
                const double ve = vl / 127.0 * ((f & F_ACCENT) ? 1 : 1 - 0.4 * acc);
                e.trigger(v, ve, (f & F_OPEN) ? 1 : 0);
            }
        }
    }
    // schedule the next step
    stepIdx++;
    nominal += stepLen();
    nextStep = nominal + swingOffset((int) (stepIdx % 16));
    if (nextStep <= clock) nextStep = clock + 1;
}

void Sequencer::updateLanes(double dt) {
    const double sl = stepLen();
    const double straight = clock16 + clock / sl; // 16ths, unswung
    for (int l = 0; l < NUM_LANES; l++) {
        const int g = lTarget[l];
        if (g < 0) continue;
        int si = lSpeed[l];
        si = si > 7 ? 7 : si;
        const double dur = SPEED_STEPS[si];
        const int len = lLen[l] ? lLen[l] : 1;
        int pos;
        double tgt;
        if (lMode[l]) {
            // envelope: the step's shape runs over the step's length, scaled by its depth
            const double f = straight / dur;
            const double k = std::floor(f);
            pos = (int) ((long) k % len);
            tgt = lSteps[l * MAX_STEPS + pos] * envShape(lShape[l * MAX_STEPS + pos], f - k);
        } else {
            const double p16 = lGroove[l] ? (double) (stepIdx - 1 > 0 ? stepIdx - 1 : 0) : straight;
            pos = (int) ((long) std::floor(p16 / dur) % len);
            tgt = lSteps[l * MAX_STEPS + pos];
        }
        lPos[l] = (int16_t) pos;
        const double slew = lSlew[l];
        if (slew <= 0.001) lCur[l] = (float) tgt;
        else {
            const double tau = slew * dur * sl * 0.35 + 1;
            lCur[l] += (float) ((tgt - lCur[l]) * (1 - std::exp(-dt / tau)));
        }
        const double o = lCur[l] * lDepth[l];
        lOut[l] = (float) o;
        const float x = (float) denormOf(g, normOf(g, base[g]) + o);
        if (g < NV) e.params[g] = x;
        else e.master[g - NV] = x;
    }
}

void Sequencer::process(float* outL, float* outR, int n) {
    int off = 0;
    barOff = -1; // sample offset in this block where a bar started, or -1
    while (off < n) {
        int chunk = n - off;
        if (chunk > 32) chunk = 32;
        if (playing) {
            double next = nextStep;
            if (ratI < ratN && ratT[ratI] < next) next = ratT[ratI];
            const int until = (int) std::ceil(next - clock);
            if (until <= 0) {
                if (ratI < ratN && ratT[ratI] <= nextStep) {
                    e.trigger(ratVoice, ratVel, 0);
                    ratI++;
                } else {
                    ratN = ratI = 0;
                    if (stepIdx % 16 == 0 && barOff < 0) barOff = off;
                    fireStep();
                }
                continue;
            }
            if (until < chunk) chunk = until;
            updateLanes(chunk);
        }
        e.process(outL, outR, chunk, off);
        off += chunk;
        if (playing) clock += chunk;
    }
}

} // namespace fmdm
