// fm/dm — effects (C++ port of src/engine/fx.js): echo, reverb (FDN), waveshaper, compressor.
// All buffers are allocated in constructors.
#pragma once
#include "Dsp.h"
#include <vector>

namespace fmdm {

// fractional read from a circular buffer
inline double readFrac(const std::vector<float>& buf, int mask, int w, double d) {
    const double r = w - d;
    const double rf = std::floor(r);
    const int ri = (int) rf;
    const double fr = r - rf;
    const double a = buf[ri & mask];
    const double b = buf[(ri + 1) & mask];
    return a + (b - a) * fr;
}

class Echo {
public:
    explicit Echo(double sampleRate) : sr(sampleRate) {
        int n = 1;
        while (n < sr * 4.2) n <<= 1;
        mask = n - 1;
        bL.assign(n, 0.f);
        bR.assign(n, 0.f);
        d = sr * 0.3;
        target = d;
        hpL.set(60, sr);
        hpR.set(60, sr);
    }
    void set(double targetSamples, double tone) {
        target = std::fmin(targetSamples, (double) mask - 4);
        lpL.set(tone, sr);
        lpR.set(tone, sr);
    }
    void tick(double inL, double inR, double fb, double width, bool ping) {
        d += (target - d) * 0.0005;
        const double yL = readFrac(bL, mask, w, d);
        const double yR = readFrac(bR, mask, w, d);
        const double fL = hpL.hp(lpL.lp(yL)) * fb;
        const double fR = hpR.hp(lpR.lp(yR)) * fb;
        const int wi = w & mask;
        if (ping) {
            bL[wi] = (float) softclip((inL + inR) * 0.7 + fR);
            bR[wi] = (float) softclip(fL);
        } else {
            bL[wi] = (float) softclip(inL + fL);
            bR[wi] = (float) softclip(inR + fR);
        }
        w = (w + 1) & mask;
        // width: 0 = mono, 1 = full stereo
        const double m = (yL + yR) * 0.5;
        L = m + (yL - m) * width;
        R = m + (yR - m) * width;
    }
    double L = 0, R = 0;

private:
    double sr;
    int mask = 0, w = 0;
    std::vector<float> bL, bR;
    double d = 0, target = 0;
    OnePole lpL, lpR, hpL, hpR;
};

class Reverb {
public:
    explicit Reverb(double sampleRate) : sr(sampleRate) {
        static const int FDN_LEN[8] = { 1031, 1327, 1523, 1801, 2053, 2311, 2633, 2953 };
        const double k = sr / 48000.0;
        for (int i = 0; i < 8; i++) {
            len[i] = (int) std::lround(FDN_LEN[i] * k);
            lines[i].assign(len[i], 0.f);
        }
        int n = 1;
        while (n < sr * 0.35) n <<= 1;
        preMask = n - 1;
        pre.assign(n, 0.f);
        hp.set(80, sr);
    }
    void set(double preMs, double decay, double tone, double earlyAmt) {
        static const double ER_TAPS[8] = { 0.0043, 0.0071, 0.0113, 0.0157, 0.0199, 0.0241, 0.0293, 0.0347 };
        preN = preMs * sr / 1000;
        for (int i = 0; i < 8; i++) {
            g[i] = std::pow(10.0, -3.0 * len[i] / (decay * sr));
            damp[i].set(tone, sr);
            erN[i] = preN + ER_TAPS[i] * sr;
        }
        early = earlyAmt;
    }
    void tick(double inL, double inR) {
        static const double ER_GAIN[8] = { 0.84, -0.71, 0.62, -0.55, 0.47, -0.41, 0.36, -0.3 };
        const double x = hp.hp((inL + inR) * 0.5);
        pre[pw & preMask] = (float) x;
        const double xin = readFrac(pre, preMask, pw, preN);
        // early reflections
        double eL = 0, eR = 0;
        for (int i = 0; i < 8; i++) {
            const double t = readFrac(pre, preMask, pw, erN[i]) * ER_GAIN[i];
            if (i & 1) eR += t;
            else eL += t;
        }
        pw = (pw + 1) & preMask;
        // FDN with a Householder feedback matrix
        double sum = 0;
        for (int i = 0; i < 8; i++) {
            y[i] = lines[i][pos[i]];
            sum += y[i];
        }
        sum *= 0.25; // 2/N
        for (int i = 0; i < 8; i++) {
            const double fb = (y[i] - sum) * g[i];
            const double v = damp[i].lp(fb) + xin * ((i & 1) ? -0.35 : 0.35);
            lines[i][pos[i]] = (float) v;
            if (++pos[i] >= len[i]) pos[i] = 0;
        }
        const double lateL = y[0] + y[2] + y[4] + y[6];
        const double lateR = y[1] + y[3] + y[5] + y[7];
        const double e = early * 0.6;
        L = lateL * 0.35 + eL * e;
        R = lateR * 0.35 + eR * e;
    }
    double L = 0, R = 0;

private:
    double sr;
    int len[8] = {}, pos[8] = {};
    std::vector<float> lines[8];
    OnePole damp[8];
    double g[8] = {}, y[8] = {}, erN[8] = {};
    std::vector<float> pre;
    int preMask = 0, pw = 0;
    double preN = 0, early = 0;
    OnePole hp;
};

// waveshaper types: 0 tube, 1 fold, 2 hard clip, 3 tape
inline double shape(int type, double x, double colour) {
    if (type == 0) {
        const double b = colour * 0.3; // asymmetry
        return softclip(x + b) - softclip(b);
    }
    if (type == 1) return sinc(x * 0.25 * (1 + colour * 0.5));
    if (type == 2) {
        const double c = 1 - std::fmax(0.0, colour) * 0.5;
        return x > c ? c : x < -c ? -c : x;
    }
    // tape: soft knee, gentle
    const double y = x / (1 + std::fabs(x) * (1 + colour * 0.5));
    return y * 1.4;
}

class Distortion {
public:
    explicit Distortion(double sampleRate) : sr(sampleRate) {
        preL.set(800, sr);
        preR.set(800, sr);
        dcL.set(15, sr);
        dcR.set(15, sr);
    }
    void set(double tone) {
        toneL.set(tone, sr);
        toneR.set(tone, sr);
    }
    // colour < 0 darker in, > 0 brighter in (tilt before the shaper)
    void tick(double inL, double inR, int type, double drive, double colour, double mix, double vol) {
        const double g = 1 + drive * drive * 30;
        const double tilt = colour * 0.8;
        const double lL = preL.lp(inL);
        const double lR = preR.lp(inR);
        const double xL = inL + (inL - lL) * tilt - lL * tilt * 0.3;
        const double xR = inR + (inR - lR) * tilt - lR * tilt * 0.3;
        double yL = shape(type, xL * g, colour) / std::sqrt(g);
        double yR = shape(type, xR * g, colour) / std::sqrt(g);
        yL = dcL.hp(toneL.lp(yL));
        yR = dcR.hp(toneR.lp(yR));
        L = (inL + (yL * 1.5 - inL) * mix) * vol;
        R = (inR + (yR * 1.5 - inR) * mix) * vol;
    }
    double L = 0, R = 0;

private:
    double sr;
    OnePole toneL, toneR, preL, preR, dcL, dcR;
};

class Compressor {
public:
    explicit Compressor(double sampleRate) : sr(sampleRate) {}
    void set(double atkMs, double relMs) {
        aC = std::exp(-1000 / (atkMs * sr));
        rC = std::exp(-1000 / (relMs * sr));
    }
    void tick(double inL, double inR, double thr, double ratio, double make, double mix) {
        const double pk = std::fmax(std::fabs(inL), std::fabs(inR));
        const double db = pk > 1e-6 ? 20 * std::log10(pk) : -120;
        const double over = db - thr;
        const double want = over > 0 ? over * (1 - 1 / ratio) : 0;
        const double c = want > gr ? aC : rC;
        gr = want + (gr - want) * c;
        const double gg = std::pow(10.0, (make - gr) / 20);
        L = inL + (inL * gg - inL) * mix;
        R = inR + (inR * gg - inR) * mix;
    }
    double L = 0, R = 0, gr = 0; // gr: gain reduction in dB (positive)

private:
    double sr, aC = 0, rC = 0;
};

} // namespace fmdm
