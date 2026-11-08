#include "Voice.h"

namespace fmdm {

static constexpr int V_CTRL = 16; // control-rate block
static constexpr int FADE_N = 64; // retrigger fade, samples

static inline double lm(int d1, int d2, int d, double l) { return (d1 == d ? l : 0) + (d2 == d ? l : 0); }

// algorithms: modulator bitmask per op [A,B,C,D] and carrier mask (bit0=A)
static const int ALG_MOD[8][4] = {
    { 0b0010, 0b0100, 0b1000, 0 }, { 0b0010, 0b1100, 0, 0 }, { 0b0010, 0, 0b1000, 0 }, { 0b1110, 0, 0, 0 },
    { 0b1000, 0b1000, 0b1000, 0 }, { 0b0110, 0, 0b1000, 0 }, { 0, 0, 0b1000, 0 },   { 0, 0, 0, 0 },
};
static const int ALG_CAR[8] = { 0b0001, 0b0001, 0b0101, 0b0001, 0b0111, 0b0001, 0b0111, 0b1111 };

static inline int algoOf(const float* p) {
    int a = (int) p[P::algo];
    return a < 0 ? 0 : a > 7 ? 7 : a;
}

Voice::Voice(double sampleRate, uint32_t seed) : sr(sampleRate), rng(seed) { reset(); }

void Voice::reset() {
    active = false;
    vel = 1;
    t = 0;
    amp = 0;
    ampX = 0;
    ampStage = 3;
    pEnv = fEnv = clkEnv = nEnv = 0;
    nStage = 2;
    burst = 0;
    burstT = 0;
    crushHold = crushN = 0;
    ctr = 0;
    filt.reset();
    nfilt.reset();
}

// A new hit on a sounding voice first fades the old note out over FADE_N samples (no click), then starts.
void Voice::trigger(const float* p, double v, int alt) {
    if (active && (amp > 1e-3 || nEnv > 1e-3 || clkEnv > 1e-3)) {
        fade = FADE_N;
        pendVel = v;
        pendAlt = alt;
        return;
    }
    start(p, v, alt);
}

void Voice::start(const float* p, double v, int alt) {
    fade = 0;
    active = true;
    vel = v;
    t = 0;
    const int car0 = ALG_CAR[algoOf(p)];
    const bool ninety = p[P::phase] >= 0.5f;
    for (int o = 0; o < 4; o++) {
        const int base = P::rA + o * 5;
        ph[o] = ninety ? (((car0 >> o) & 1) ? 0.25 : 0.5) : 0;
        env[o] = 0;
        const double atk = p[base + 2];
        atkInc[o] = (float) (atk <= 0.05 ? 2 : 1000 / (atk * sr));
        stage[o] = 0;
        decC[o] = (float) decayCoef(p[base + 3], sr);
    }
    fbz = fbz2 = 0;
    ampStartLvl = 0;
    ampStage = 0;
    ampX = 0;
    const double aAtk = p[P::aAtk];
    ampAtkInc = aAtk <= 0.05 ? 2 : 1000 / (aAtk * sr);
    ampHoldN = p[P::aHold] * sr / 1000;
    const double dec = alt ? p[P::aDec2] : p[P::aDec];
    ampDecInc = 1000 / (dec * sr);
    ampK = std::pow(2.0, p[P::aCurve] * 4.0 - 1.0);
    pEnv = 1;
    pC = decayCoef(p[P::pDec], sr);
    fEnv = 1;
    fC = decayCoef(p[P::fEnvDec], sr);
    clkEnv = 1;
    clkC = decayCoef(p[P::clkDec], sr);
    clkPh = 0;
    nStage = 0;
    nEnv = 0;
    const double nAtk = p[P::nAtk];
    nAtkInc = nAtk <= 0.05 ? 2 : 1000 / (nAtk * sr);
    nC = decayCoef(p[P::nDec], sr);
    burst = 0;
    burstT = 0;
    nBursts = (int) std::lround(p[P::nBurst]);
    burstGap = p[P::nSpace] * sr / 1000;
    burstN = burstGap * (1 + rng.bi() * 0.12);
    burstC = decayCoef(p[P::nSpace] * 0.8, sr);
    if (p[P::lRetrig] >= 0.5f) lfoPh = 0;
    // humanise: a fresh random pitch and index offset for each hit
    const double hum = p[P::hum];
    hPitch = std::pow(2.0, rng.bi() * hum * 25 / 1200);
    hIdx = 1 + rng.bi() * hum * 0.2;
    wob.z = 0;
    ctr = 0;
}

void Voice::control(const float* p) {
    const double dt = V_CTRL / sr;
    // lfo
    const double rate = p[P::lRate];
    double lph = lfoPh + rate * dt;
    if (lph >= 1) {
        lph -= std::floor(lph);
        lfoSH = rng.bi();
    }
    lfoPh = lph;
    const int shape = (int) p[P::lShape];
    double l;
    if (shape == 0) l = sinc(lph);
    else if (shape == 1) l = lph < 0.5 ? 4 * lph - 1 : 3 - 4 * lph;
    else if (shape == 2) l = 1 - 2 * lph;
    else if (shape == 3) l = lph < 0.5 ? 1 : -1;
    else l = lfoSH;
    l *= p[P::lDepth];
    lfoVal = l;
    const int d1 = (int) p[P::lDest], d2 = (int) p[P::lDest2];
    lPitch = lm(d1, d2, 1, l) * 12;
    lFm = lm(d1, d2, 2, l);
    lCut = lm(d1, d2, 3, l) * 4;
    lLvl = lm(d1, d2, 4, l);
    lPan = lm(d1, d2, 5, l);
    lNoise = lm(d1, d2, 6, l);
    lRatio = lm(d1, d2, 7, l);

    // pitch (the pitch envelope itself runs per sample, see process)
    pSemis = p[P::pAmt] * (1 - p[P::vPitch] * (1 - vel));
    const double f0 = p[P::tune] * std::pow(2.0, lPitch / 12);
    const double rmul = std::pow(2.0, lRatio * 2);
    const int car = ALG_CAR[algoOf(p)];
    int fixed = 0;
    for (int o = 0; o < 4; o++) {
        const int base = P::rA + o * 5;
        const bool fx = p[base + 4] >= 0.5f;
        double f = fx ? p[base] * 1000.0 : p[base] * f0;
        if (fx) fixed |= 1 << o;
        if (!((car >> o) & 1)) f *= rmul;
        incBase[o] = (fx ? f : f * hPitch) / sr;
    }
    driftInc = p[P::drift] * 40.0 / sr;
    // fm noise: the wobble is low-passed at a few times the pitch, scaled to the operator's own frequency
    wobAmt = p[P::fmNoise] * 2.0;
    if (wobAmt > 0) wob.set(std::fmin(9000.0, f0 * 8), sr);
    fixedMask = fixed;
    // FM index into each operator shrinks as its pitch rises, so sidebands stay below Nyquist
    for (int o = 0; o < 4; o++) {
        const double fr = incBase[o] * (((fixedMask >> o) & 1) ? 1 : std::pow(2.0, pEnv * pSemis / 12));
        const double q = 0.5 - (fr > 0.5 ? 0.5 : fr);
        const double a = 20 * q * q * q * q;
        aa[o] = (float) (a > 1 ? 1 : a);
    }
    // filter
    const int ft = (int) p[P::fType];
    if (ft) {
        const double oct = p[P::fEnv] * fEnv * 6 + lCut - p[P::vFilt] * (1 - vel) * 3 + xCut * 3;
        filt.set(p[P::fCut] * std::pow(2.0, oct), p[P::fRes], sr);
    }
    nfilt.set(p[P::nCut], p[P::nRes], sr);
    // velocity scalars
    velAmp = 1 - p[P::vLvl] * (1 - vel);
    trimG = std::pow(10.0, p[P::trim] / 20.0);
    const double fmv = p[P::fmLvl];
    fmIdx = fmv * fmv * 4 * (1 - p[P::vFm] * (1 - vel)) * (1 + lFm) * hIdx;
}

void Voice::process(const float* p) {
    if (!active) {
        L = R = mono = 0;
        return;
    }
    if (ctr == 0) control(p);
    ctr = (ctr + 1) % V_CTRL;

    const int algo = algoOf(p);
    const int car = ALG_CAR[algo];

    // pitch envelope, per sample
    const double pm = pSemis != 0 ? std::pow(2.0, pEnv * pSemis / 12) : 1;
    for (int o = 0; o < 4; o++) inc[o] = ((fixedMask >> o) & 1) ? incBase[o] : incBase[o] * pm;
    {
        double w = 0;
        if (wobAmt > 0) w = wob.lp(rng.bi()) * wobAmt * nEnv;
        if (w != 0 || driftInc != 0) {
            // carriers wobble less (a fifth as much), and less again when the FM index is high
            const double cw = w * 0.2 * (1 - std::fmin(0.5, fmIdx * 2.5));
            for (int o = 0; o < 4; o++) {
                if ((car >> o) & 1) inc[o] *= 1 + cw;
                else inc[o] = inc[o] * (1 + w) + driftInc;
            }
        }
    }

    // operator envelopes
    for (int o = 0; o < 4; o++) {
        if (stage[o] == 0) {
            env[o] += atkInc[o];
            if (env[o] >= 1) {
                env[o] = 1;
                stage[o] = 1;
            }
        } else env[o] *= decC[o];
    }

    // FM operators, D down to A
    const int* mods = ALG_MOD[algo];
    const double fmEnd = p[P::fmEnd];
    const double idx = fmIdx;
    double body = 0;
    int ncar = 0;
    for (int o = 3; o >= 0; o--) {
        double m = 0;
        const int mask = mods[o];
        if (mask) {
            for (int j = o + 1; j < 4; j++) if ((mask >> j) & 1) m += out[j];
            m *= idx * aa[o];
        }
        // crossfeed: other voices' base oscillators phase-modulate operator A
        if (o == 0) m += xPm;
        if (o == 3) {
            // feedback follows D's own envelope; negative feedback uses the squared signal (rougher)
            const double fb = p[P::fb];
            if (fb != 0) {
                const double z = (fbz + fbz2) * 0.5;
                m += (fb > 0 ? z : z * z * 2 - 0.5) * fb * 1.2 * env[3] * aa[3];
            }
        }
        double phs = ph[o] + inc[o];
        if (phs >= 1) phs -= 1;
        ph[o] = phs;
        const double lvl = p[P::lA + o * 5];
        const double e = ((car >> o) & 1) ? (double) env[o] : fmEnd + (1 - fmEnd) * env[o];
        const double y = sinc(phs + m) * e * lvl;
        out[o] = (float) y;
        if ((car >> o) & 1) {
            body += y;
            ncar++;
        }
    }
    fbz2 = fbz;
    fbz = out[3];
    if (ncar > 1) body *= 1 / std::sqrt((double) ncar);

    // amp env (applies to the FM body)
    double a;
    if (ampStage == 0) {
        ampX += ampAtkInc;
        if (ampX >= 1) {
            ampX = 0;
            ampStage = ampHoldN > 0 ? 1 : 2;
            a = 1;
        } else a = ampStartLvl + (1 - ampStartLvl) * ampX;
    } else if (ampStage == 1) {
        a = 1;
        ampX += 1;
        if (ampX >= ampHoldN) {
            ampX = 0;
            ampStage = 2;
        }
    } else if (ampStage == 2) {
        ampX += ampDecInc;
        if (ampX >= 1) {
            ampStage = 3;
            a = 0;
        } else a = std::pow(1 - ampX, ampK);
    } else a = 0;
    amp = a;
    body *= a;

    // click
    double clk = 0;
    const double ck = p[P::clk];
    if (ck > 0 && clkEnv > 1e-4) {
        const int ct = (int) p[P::clkType];
        if (ct == 0) clk = clkEnv;
        else if (ct == 1) clk = rng.bi() * clkEnv;
        else {
            clkPh += 3000 / sr;
            clk = sinc(clkPh) * clkEnv;
        }
        clk *= ck;
    }
    clkEnv *= clkC;

    // noise
    double nz = 0;
    const double nl = p[P::nLvl] * (1 + lNoise);
    if (nStage == 0) {
        nEnv += nAtkInc;
        if (nEnv >= 1) {
            nEnv = 1;
            nStage = 1;
        }
    } else if (nStage == 1) {
        // bursts: short decays retriggered every spacing, the last burst uses the full decay
        if (burst < nBursts - 1) {
            nEnv *= burstC;
            burstT += 1;
            if (burstT >= burstN) {
                // uneven gaps: x1, then x1.4 for later bursts, each with a little jitter
                burstT = 0;
                burst++;
                nEnv = 0.8 + 0.2 * rng.uni();
                burstN = burstGap * 1.4 * (1 + rng.bi() * 0.12);
            }
        } else nEnv *= nC;
    }
    if (nl > 0 && nEnv > 1e-5) {
        nfilt.tick(rng.bi());
        const int nt = (int) p[P::nType];
        nz = (nt == 0 ? nfilt.lp : nt == 1 ? nfilt.bp : nfilt.hp) * nEnv * nl;
    }

    // sum, drive, filter
    double x = body + clk + nz;
    if (xRing != 0) x *= 1 + xRing;
    const double drv = p[P::fDrive];
    if (drv > 0) {
        const double g = 1 + drv * 12;
        x = softclip(x * g) / std::sqrt(g) * (1 + drv * 0.3);
    }
    const int ft = (int) p[P::fType];
    if (ft) {
        filt.tick(x);
        x = ft == 1 ? filt.lp : ft == 2 ? filt.bp * 1.5 : filt.hp;
    }

    // crush
    const double bits = p[P::bits];
    const double div = p[P::srDiv];
    if (div > 1.01) {
        crushN += 1;
        if (crushN >= div) {
            crushN -= div;
            crushHold = x;
        }
        x = crushHold;
    }
    if (bits < 15.9) {
        const double q = std::pow(2.0, bits - 1);
        x = std::floor(x * q + 0.5) / q; // Math.round
    }

    // level, pan
    const double lv = p[P::level] * trimG * velAmp * (1 - std::fabs(lLvl) * 0.5 + lLvl * 0.5);
    x *= lv;
    if (fade > 0) x *= (double) fade / FADE_N;
    mono = x;
    double pan = p[P::pan] + lPan;
    pan = pan < -1 ? -1 : pan > 1 ? 1 : pan;
    const double pa = (pan + 1) * 0.125; // 0..0.25 cycles
    L = x * sinc(pa + 0.25);
    R = x * sinc(pa);
    const double ax = std::fabs(x);
    meter = ax > meter ? ax : meter * 0.9995;

    // retrigger fade done: start the new note
    if (fade > 0 && --fade == 0) {
        start(p, pendVel, pendAlt);
        return;
    }

    // envelopes advance
    pEnv *= pC;
    fEnv *= fC;
    t++;
    if (ampStage == 3 && nEnv < 1e-5 && clkEnv < 1e-4 && t > 64) {
        active = false;
        amp = 0;
    }
}

} // namespace fmdm
