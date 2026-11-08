// fm/dm — small DSP building blocks (C++ port of src/engine/dsp.js). No allocation after construction.
#pragma once
#include <cmath>
#include <cstdint>

namespace fmdm {

constexpr int SIN_BITS = 12;
constexpr int SIN_SIZE = 1 << SIN_BITS;
constexpr int SIN_MASK = SIN_SIZE - 1;
constexpr double TWO_PI = 6.283185307179586;

struct SinTable {
    float t[SIN_SIZE + 1];
    SinTable() { for (int i = 0; i <= SIN_SIZE; i++) t[i] = (float) std::sin(TWO_PI * i / SIN_SIZE); }
};
inline const SinTable& sinTable() { static const SinTable s; return s; }

// sine of x cycles (any real x), linear interpolation
inline double sinc(double x) {
    const float* T = sinTable().t;
    const double f = (x - std::floor(x)) * SIN_SIZE;
    const int i = (int) f;
    const double fr = f - i;
    const double a = T[i & SIN_MASK];
    return a + (T[(i & SIN_MASK) + 1] - a) * fr;
}

// soft clip, cheap tanh-like (exact at 0, saturates to ±1)
inline double softclip(double x) {
    if (x > 3) return 1;
    if (x < -3) return -1;
    const double x2 = x * x;
    return (x * (27 + x2)) / (27 + 9 * x2);
}

inline double sgn(double x) { return x > 0 ? 1.0 : x < 0 ? -1.0 : 0.0; }

// xorshift32 noise, deterministic for a seed (same sequence as the JS version)
struct Rng {
    uint32_t s;
    explicit Rng(uint32_t seed = 1) : s(seed ? seed : 0x9e3779b9u) {}
    uint32_t next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }
    double bi() { return next() / 2147483648.0 - 1.0; } // -1..1
    double uni() { return next() / 4294967296.0; }      // 0..1
};

// time constant (ms) to per-sample multiplier reaching -60 dB at t
inline double decayCoef(double ms, double sr) {
    double n = ms * sr / 1000.0;
    if (n < 1) n = 1;
    return std::exp(-6.907755 / n);
}

// topology-preserving state variable filter (trapezoidal integration)
struct Svf {
    double ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0, k = 2, lp = 0, bp = 0, hp = 0;
    void set(double fc, double res, double sr) {
        const double nyq = sr * 0.49;
        if (fc > nyq) fc = nyq;
        if (fc < 10) fc = 10;
        const double g = std::tan(TWO_PI * 0.5 * fc / sr);
        k = 2 - 1.96 * (res < 0 ? 0 : res > 1 ? 1 : res);
        a1 = 1 / (1 + g * (g + k));
        a2 = g * a1;
        a3 = g * a2;
    }
    void tick(double v0) {
        const double v3 = v0 - ic2;
        const double v1 = a1 * ic1 + a2 * v3;
        const double v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1;
        ic2 = 2 * v2 - ic2;
        lp = v2;
        bp = v1;
        hp = v0 - k * v1 - v2;
    }
    void reset() { ic1 = ic2 = 0; }
};

// one-pole lowpass / highpass
struct OnePole {
    double z = 0, a = 0;
    void set(double fc, double sr) { a = 1 - std::exp(-TWO_PI * fc / sr); }
    double lp(double x) { z += a * (x - z); return z; }
    double hp(double x) { z += a * (x - z); return x - z; }
};

} // namespace fmdm
