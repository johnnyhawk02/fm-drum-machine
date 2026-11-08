#include "IRs.h"
#include "Dsp.h"
#include "BinaryData.h"

namespace fmdm {

static const char* const FILE_IRS[IR_FILES][2] = {
    { "drum room", "nice_drum_room_flac" }, { "small drums", "small_drum_room_flac" }, { "bottle hall", "bottle_hall_flac" },
    { "garage", "parking_garage_flac" }, { "silo", "in_the_silo_revised_flac" }, { "church", "st_nicolaes_church_flac" },
    { "deep space", "deep_space_flac" }, { "on a star", "on_a_star_flac" }, { "rays", "rays_flac" }, { "five columns", "five_columns_flac" },
    { "echo hall", "large_wide_echo_hall_flac" }, { "cement", "cement_blocks_1_flac" }, { "block", "block_inside_flac" },
    { "cave", "small_prehistoric_cave_flac" }, { "bumpy", "narrow_bumpy_space_flac" }, { "la scala", "scala_milan_opera_hall_flac" },
    { "musikverein", "musikvereinsaal_flac" }, { "lodge", "masonic_lodge_flac" }, { "trig room", "trig_room_flac" }, { "going home", "going_home_flac" },
};
static const char* const SYNTH_NAMES[IR_SYNTH] = { "room", "studio", "chamber", "plate", "hall", "cathedral", "spring", "gated", "reverse", "tin can" };
// seconds, brightness at start (Hz), brightness at end (Hz), early reflections, width
static const double IR_SHAPE[IR_SYNTH][5] = {
    { 0.45, 9000, 2500, 0.8, 0.6 }, { 0.9, 12000, 3500, 0.6, 0.8 }, { 1.6, 8000, 2000, 0.7, 0.9 }, { 2.2, 14000, 5000, 0, 1 },
    { 3.4, 9000, 1500, 0.5, 1 },    { 6.5, 6000, 800, 0.4, 1 },     { 1.8, 7000, 2500, 0, 0.7 },    { 0.38, 12000, 6000, 0, 0.9 },
    { 1.4, 9000, 3000, 0, 0.9 },    { 0.6, 16000, 9000, 0, 0.5 },
};

juce::String irName(int k) {
    if (k < IR_SYNTH) return SYNTH_NAMES[juce::jmax(0, k)];
    if (k < IR_USER) return FILE_IRS[k - IR_SYNTH][0];
    return "your ir";
}

// the same energy for every IR, so switching keeps a similar level
static void normalise(juce::AudioBuffer<float>& b) {
    double e = 0;
    for (int c = 0; c < b.getNumChannels(); c++) {
        const float* d = b.getReadPointer(c);
        for (int i = 0; i < b.getNumSamples(); i++) e += (double) d[i] * d[i];
    }
    const float g = (float) (1 / std::sqrt(e / juce::jmax(1, b.getNumChannels()) + 1e-9) * 0.35);
    b.applyGain(g);
}

static juce::AudioBuffer<float> synthIR(int k, double sr) {
    const double* s = IR_SHAPE[k];
    const double sec = s[0], b0 = s[1], b1 = s[2], early = s[3], width = s[4];
    const int n = (int) std::lround(sec * sr);
    juce::AudioBuffer<float> out(2, n);
    out.clear();
    Rng r(1000 + k);
    for (int c = 0; c < 2; c++) {
        float* o = out.getWritePointer(c);
        double lp = 0, lp2 = 0;
        for (int i = 0; i < n; i++) {
            const double t = (double) i / n;
            double env;
            if (k == 7) env = t < 0.85 ? 1 : (1 - t) / 0.15;                              // gated: flat, then cut
            else if (k == 8) env = std::pow(t, 2.2) * (t > 0.97 ? (1 - t) / 0.03 : 1); // reverse: swells up
            else env = std::exp(-6.9 * i / n);                                           // -60 dB over the length
            const double fc = b0 * std::pow(b1 / b0, t);
            const double a = 1 - std::exp(-TWO_PI * fc / sr);
            const double mono = r.bi(), side = r.bi();
            lp += (mono * (1 - width * 0.5) + (c ? -side : side) * width * 0.5 - lp) * a;
            lp2 += (lp - lp2) * a;
            o[i] = (float) (lp2 * env);
        }
        // early reflections: a handful of taps in the first 70 ms
        if (early > 0) {
            Rng er(77 + k * 3 + c);
            for (int j = 0; j < 14; j++) {
                const int d = (int) std::lround((0.004 + er.uni() * 0.066) * sr);
                if (d < n) o[d] += (float) ((er.uni() < 0.5 ? -1 : 1) * early * (1 - d / (0.07 * sr)) * 0.9);
            }
        }
        // spring: a dispersive "boing" (a falling chirp repeated every 35 ms)
        if (k == 6) {
            const int per = (int) std::lround(0.035 * sr);
            for (int rep = 0; rep * per < n; rep++) {
                const double g = std::pow(0.72, rep) * 0.5;
                double ph = 0;
                for (int i = 0; i < per && rep * per + i < n; i++) {
                    const double f = 4000 * std::exp(-i / (0.004 * sr)) + 300;
                    ph += f / sr;
                    o[rep * per + i] += (float) (std::sin(TWO_PI * ph) * g * std::exp(-i / (0.012 * sr)));
                }
            }
        }
        // tin can: strong metallic resonances (feedback combs)
        if (k == 9) {
            for (double ms : { 1.13, 1.71, 2.37 }) {
                const int d = (int) std::lround(ms / 1000 * sr);
                for (int i = d; i < n; i++) o[i] += o[i - d] * 0.62f;
            }
        }
    }
    normalise(out);
    return out;
}

static bool readStream(std::unique_ptr<juce::InputStream> in, juce::AudioBuffer<float>& out, double& rate) {
    juce::AudioFormatManager fm;
    fm.registerBasicFormats();
    std::unique_ptr<juce::AudioFormatReader> rd(fm.createReaderFor(std::move(in)));
    if (!rd || rd->lengthInSamples <= 0) return false;
    const int n = (int) juce::jmin<juce::int64>(rd->lengthInSamples, (juce::int64) (rd->sampleRate * 20));
    const int ch = (int) juce::jlimit<unsigned>(1, 2, rd->numChannels);
    out.setSize(ch, n);
    rd->read(&out, 0, n, 0, true, ch > 1);
    rate = rd->sampleRate;
    return true;
}

bool readAudioFile(const juce::File& f, juce::AudioBuffer<float>& out, double& rate) {
    return readStream(f.createInputStream(), out, rate);
}

juce::AudioBuffer<float> makeIR(int k, double sr, double& irRate, const juce::AudioBuffer<float>* user, double userRate) {
    if (k < 0) k = 0;
    irRate = sr;
    if (k < IR_SYNTH) return synthIR(k, sr);
    juce::AudioBuffer<float> b;
    double rate = sr;
    if (k < IR_USER) {
        int size = 0;
        const char* data = BinaryData::getNamedResource(FILE_IRS[k - IR_SYNTH][1], size);
        if (!data || !readStream(std::make_unique<juce::MemoryInputStream>(data, (size_t) size, false), b, rate)) return {};
    } else {
        if (!user || user->getNumSamples() == 0) return {};
        b.makeCopyOf(*user);
        rate = userRate;
    }
    // the convolver resamples to the playback rate; level matches the factory ones
    if (b.getNumChannels() == 1) {
        b.setSize(2, b.getNumSamples(), true);
        b.copyFrom(1, 0, b, 0, 0, b.getNumSamples());
    }
    normalise(b);
    irRate = rate;
    return b;
}

} // namespace fmdm
