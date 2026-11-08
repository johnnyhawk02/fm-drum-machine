#include "Engine.h"
#include <cstring>

namespace fmdm {

static constexpr int E_CTRL = 32;

Engine::Engine(double sampleRate, uint32_t seed)
    : sr(sampleRate), echo(sampleRate), reverb(sampleRate), sendDist(sampleRate), mdist(sampleRate), comp(sampleRate) {
    std::memcpy(params, INIT_KIT, sizeof(params));
    for (int i = 0; i < MP; i++) master[i] = MASTER_SPEC[i].def;
    for (int v = 0; v < NUM_VOICES; v++) voices.push_back(std::make_unique<Voice>(sr, (uint32_t) (seed * 7919u + v * 104729u)));
}

// Mutes act on notes, so tails ring on.
void Engine::trigger(int v, double vel, int alt) {
    if (v < 0 || v >= NUM_VOICES) return;
    if (master[M::mute0 + v * 4] >= 0.5f) return;
    voices[v]->trigger(params + v * NP, vel, alt);
    if (v == 0) duck = 1;
}

void Engine::control() {
    const float* m = master;
    const double beat = 60.0 / m[M::bpm];
    int div = (int) m[M::eDiv];
    div = div < 0 ? 0 : div > 12 ? 12 : div;
    double dSec = m[M::eSync] >= 0.5f ? ECHO_DIV_BEATS[div] * beat : m[M::eMs] / 1000.0;
    dSec *= 1 + m[M::eFine] * 0.01;
    echo.set(dSec * sr, m[M::eTone]);
    reverb.set(m[M::rPre], m[M::rDecay], m[M::rTone], m[M::rEarly]);
    irTone = 1 - std::exp(-TWO_PI * m[M::rTone] / sr);
    sendDist.set(m[M::sdTone]);
    mdist.set(m[M::mdTone]);
    comp.set(m[M::cAtk], m[M::cRel]);
    const double hp = m[M::mHp];
    hpOn = hp > 21;
    if (hpOn) {
        hpL.set(hp, 0.1, sr);
        hpR.set(hp, 0.1, sr);
    }
    duckC = std::exp(-6.9 / (m[M::dkRel] * sr / 1000));
    bool s = false;
    for (int v = 0; v < NUM_VOICES; v++) if (m[M::solo0 + v * 4] >= 0.5f) s = true;
    anySolo = s;
}

static inline double safety(double x) {
    // gentle safety clip: transparent below ~0.9
    if (x > 0.9 || x < -0.9) return sgn(x) * (0.9 + 0.1 * softclip((std::fabs(x) - 0.9) * 10));
    return x;
}

void Engine::process(float* outL, float* outR, int n, int off) {
    const float* p = params;
    const float* m = master;
    for (int s = 0; s < n; s++) {
        if (ctr == 0) control();
        ctr = (ctr + 1) % E_CTRL;

        // crossfeed: each voice's base operator (op A's pitch, pitch envelope included while it plays)
        // runs all the time as a sine, so the 6x6 table works even when the source drum is silent
        for (int v = 0; v < NUM_VOICES; v++) {
            const Voice& vo = *voices[v];
            const float* b = p + v * NP;
            double ph = xPh[v] + (vo.active ? vo.inc[0] : (double) b[P::tune] * b[P::rA] / sr);
            ph -= std::floor(ph);
            xPh[v] = ph;
            xSrc[v] = sinc(ph);
        }
        for (int d = 0; d < NUM_VOICES; d++) {
            double xf = 0, xc = 0, xr = 0;
            for (int src = 0; src < NUM_VOICES; src++) {
                const int k = M::xa00 + (src * NUM_VOICES + d) * 2;
                const double a = m[k];
                if (a > 0) {
                    const int t = (int) m[k + 1];
                    const double x = xSrc[src] * a;
                    if (t == 0) xf += x;
                    else if (t == 1) xc += x;
                    else xr += x;
                }
            }
            Voice& vo = *voices[d];
            vo.xPm = xf * 1.5;
            vo.xCut = xc * 2;
            vo.xRing = xr * 2;
        }

        const double duckE = duck;
        duck *= duckC;
        const double dAmt = m[M::dkAmt];
        const double gDry = 1 - dAmt * duckE;
        const double gFx = 1 - dAmt * m[M::dkSpace] * duckE;

        double l = 0, r = 0, eL = 0, eR = 0, rL = 0, rR = 0, dL = 0, dR = 0, ring = 0;
        for (int v = 0; v < NUM_VOICES; v++) {
            Voice& vo = *voices[v];
            const float* b = p + v * NP;
            vo.process(b);
            if (!vo.active && vo.L == 0) continue;
            if (anySolo && m[M::solo0 + v * 4] < 0.5f) continue;
            const double g = v == 0 ? 1 : gDry;
            const double vl = vo.L, vr = vo.R;
            l += vl * g;
            r += vr * g;
            if (m[M::eMute0 + v * 4] < 0.5f) {
                eL += vl * b[P::sEcho];
                eR += vr * b[P::sEcho];
            }
            if (m[M::rMute0 + v * 4] < 0.5f) {
                rL += vl * b[P::sRev];
                rR += vr * b[P::sRev];
            }
            dL += vl * b[P::sDist];
            dR += vr * b[P::sDist];
            ring += vo.mono * b[P::sRing];
        }

        // echo feeds a little into the reverb
        echo.tick(eL, eR, m[M::eFb], m[M::eWidth], m[M::ePing] >= 0.5f);
        const double echoL = echo.L * m[M::eLvl];
        const double echoR = echo.R * m[M::eLvl];
        double revL, revR;
        if (m[M::rType] >= 0.5f) {
            // impulse response: send out, take the wet back in, tone it with a gentle low-pass
            const int i = off + s;
            if (irOutL) {
                irOutL[i] = (float) (rL + echoL * 0.2);
                irOutR[i] = (float) (rR + echoR * 0.2);
            }
            const double wl = irInL ? irInL[i] : 0;
            const double wr = irInR ? irInR[i] : 0;
            irLpL += (wl - irLpL) * irTone;
            irLpR += (wr - irLpR) * irTone;
            revL = irLpL;
            revR = irLpR;
        } else {
            if (irOutL) irOutL[off + s] = irOutR[off + s] = 0;
            reverb.tick(rL + echoL * 0.2, rR + echoR * 0.2);
            revL = reverb.L;
            revR = reverb.R;
        }
        sendDist.tick(dL, dR, 0, m[M::sdDrive], 0.2, 1, 1);
        ringPh += m[M::rmHz] / sr;
        if (ringPh >= 1) ringPh -= 1;
        const double rm = ring * sinc(ringPh) * m[M::rmLvl];

        l += (echoL + revL * m[M::rLvl] + sendDist.L * m[M::sdLvl] + rm) * gFx;
        r += (echoR + revR * m[M::rLvl] + sendDist.R * m[M::sdLvl] + rm) * gFx;

        // master: hp, distortion, compressor, volume, safety clip
        if (hpOn) {
            hpL.tick(l);
            hpR.tick(r);
            l = hpL.hp;
            r = hpR.hp;
        }
        if (m[M::mdMix] > 0 || m[M::mdVol] != 1) {
            mdist.tick(l, r, (int) m[M::mdType], m[M::mdDrive], m[M::mdColour], m[M::mdMix], m[M::mdVol]);
            l = mdist.L;
            r = mdist.R;
        }
        comp.tick(l, r, m[M::cThr], m[M::cRatio], m[M::cMake], m[M::cMix]);
        const double mv = m[M::mVol];
        l = safety(comp.L * mv);
        r = safety(comp.R * mv);
        outL[off + s] = (float) l;
        outR[off + s] = (float) r;
        const double al = std::fabs(l), ar = std::fabs(r);
        peakL = al > peakL ? al : peakL * 0.9998;
        peakR = ar > peakR ? ar : peakR * 0.9998;
    }
    gr = comp.gr;
}

} // namespace fmdm
