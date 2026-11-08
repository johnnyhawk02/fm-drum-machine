#include "Model.h"
#include "BinaryData.h"

namespace fmdm {

static constexpr int PRESET_V = 1;

int keyToFlat(const juce::String& key) {
    if (key.startsWith("m.")) {
        const auto id = key.substring(2);
        for (int i = 0; i < MP; i++) if (id == MASTER_SPEC[i].id) return NV + i;
        return -1;
    }
    if (key.length() < 4 || key[0] != 'v' || key[2] != '.') return -1;
    const int v = key[1] - '0';
    if (v < 0 || v >= NUM_VOICES) return -1;
    const auto id = key.substring(3);
    for (int i = 0; i < NP; i++) if (id == VOICE_SPEC[i].id) return v * NP + i;
    return -1;
}

juce::String flatToKey(int g) {
    if (g >= NV) return juce::String("m.") + MASTER_SPEC[g - NV].id;
    return "v" + juce::String(g / NP) + "." + VOICE_SPEC[g % NP].id;
}

float defaultFor(int g) { return g >= NV ? MASTER_SPEC[g - NV].def : INIT_KIT[g]; }

Model::Model() { reset(); }

void Model::reset() {
    for (int g = 0; g < NG; g++) base[g] = defaultFor(g);
    std::fill(std::begin(vel), std::end(vel), 0);
    std::fill(std::begin(flag), std::end(flag), 0);
    for (auto& l : lanes) l = Lane();
    name = "init";
}

static float num(const juce::var& v, float fallback) {
    return v.isDouble() || v.isInt() || v.isInt64() || v.isBool() ? (float) (double) v : fallback;
}

bool Model::fromPreset(const juce::var& pr, bool keepTempo) {
    if (!pr.isObject() || (int) pr["v"] != PRESET_V) return false;
    const float bpm0 = base[NV + M::bpm];
    const auto voices = pr["voices"];
    for (int v = 0; v < NUM_VOICES; v++) {
        const auto o = voices.isArray() && v < voices.size() ? voices[v] : juce::var();
        for (int i = 0; i < NP; i++) base[v * NP + i] = num(o.getProperty(VOICE_SPEC[i].id, {}), INIT_KIT[v * NP + i]);
    }
    const auto ms = pr["master"];
    for (int i = 0; i < MP; i++) base[NV + i] = num(ms.getProperty(MASTER_SPEC[i].id, {}), MASTER_SPEC[i].def);
    if (keepTempo) base[NV + M::bpm] = bpm0;
    std::fill(std::begin(vel), std::end(vel), 0);
    std::fill(std::begin(flag), std::end(flag), 0);
    if (auto* pat = pr["pat"].getArray())
        for (int t = 0; t < juce::jmin(NUM_VOICES, pat->size()); t++)
            if (auto* row = (*pat)[t].getArray())
                for (int k = 0; k < juce::jmin(MAX_STEPS, row->size()); k++) {
                    const int x = (int) (*row)[k];
                    vel[t * MAX_STEPS + k] = (uint8_t) (x & 127);
                    flag[t * MAX_STEPS + k] = (uint8_t) (x >> 7);
                }
    for (auto& l : lanes) l = Lane();
    if (auto* ls = pr["lanes"].getArray()) {
        int l = 0;
        for (auto& ln : *ls) {
            if (l >= NUM_LANES) break;
            const int g = keyToFlat(ln["key"].toString());
            if (g < 0) continue;
            Lane& d = lanes[l++];
            d.g = g;
            if (auto* st = ln["steps"].getArray())
                for (int k = 0; k < juce::jmin(MAX_STEPS, st->size()); k++) d.steps[k] = num((*st)[k], 0);
            if (auto* sh = ln["shapes"].getArray())
                for (int k = 0; k < juce::jmin(MAX_STEPS, sh->size()); k++) d.shapes[k] = (uint8_t) (int) (*sh)[k];
            d.mode = (int) ln.getProperty("mode", 0);
            d.len = juce::jlimit(1, MAX_STEPS, (int) ln.getProperty("len", 16));
            d.slew = num(ln["slew"], 0);
            d.speed = juce::jlimit(0, 7, (int) ln.getProperty("speed", 0));
            d.depth = num(ln["depth"], 0.5f);
            d.groove = (bool) ln.getProperty("groove", true);
        }
    }
    gen = pr["gen"];
    perf = pr["perf"];
    name = pr["name"].toString();
    return true;
}


static juce::var round5(float x) {
    // toPrecision(5), like the browser version
    if (x == 0) return 0;
    const double p = std::pow(10.0, 4 - (int) std::floor(std::log10(std::fabs((double) x))));
    return std::round(x * p) / p;
}

juce::var Model::toPreset(const juce::String& presetName) const {
    auto* o = new juce::DynamicObject();
    o->setProperty("v", PRESET_V);
    o->setProperty("name", presetName);
    o->setProperty("ts", juce::Time::currentTimeMillis());
    juce::Array<juce::var> voices;
    for (int v = 0; v < NUM_VOICES; v++) {
        auto* vo = new juce::DynamicObject();
        for (int i = 0; i < NP; i++) vo->setProperty(VOICE_SPEC[i].id, round5(base[v * NP + i]));
        voices.add(juce::var(vo));
    }
    o->setProperty("voices", voices);
    auto* mo = new juce::DynamicObject();
    for (int i = 0; i < MP; i++) mo->setProperty(MASTER_SPEC[i].id, round5(base[NV + i]));
    o->setProperty("master", juce::var(mo));
    juce::Array<juce::var> pat;
    for (int t = 0; t < NUM_VOICES; t++) {
        juce::Array<juce::var> row;
        for (int k = 0; k < MAX_STEPS; k++) {
            const int i = t * MAX_STEPS + k;
            row.add(vel[i] ? vel[i] + flag[i] * 128 : 0);
        }
        while (!row.isEmpty() && (int) row.getLast() == 0) row.removeLast();
        pat.add(row);
    }
    o->setProperty("pat", pat);
    juce::Array<juce::var> ls;
    for (auto& l : lanes) {
        if (l.g < 0) continue;
        auto* lo = new juce::DynamicObject();
        lo->setProperty("key", flatToKey(l.g));
        juce::Array<juce::var> st;
        for (int k = 0; k < l.len; k++) st.add(round5(l.steps[k]));
        lo->setProperty("steps", st);
        lo->setProperty("len", l.len);
        lo->setProperty("slew", round5(l.slew));
        lo->setProperty("speed", l.speed);
        lo->setProperty("depth", round5(l.depth));
        lo->setProperty("groove", l.groove);
        if (l.mode) {
            lo->setProperty("mode", 1);
            juce::Array<juce::var> sh;
            for (int k = 0; k < l.len; k++) sh.add((int) l.shapes[k]);
            lo->setProperty("shapes", sh);
        }
        ls.add(juce::var(lo));
    }
    o->setProperty("lanes", ls);
    if (!gen.isVoid()) o->setProperty("gen", gen);
    if (!perf.isVoid()) o->setProperty("perf", perf);
    return juce::var(o);
}

juce::Array<juce::var> presetsInJson(const juce::var& v) {
    juce::Array<juce::var> out;
    if (auto* a = v["presets"].getArray()) {
        for (auto& p : *a) if (p.isObject()) out.add(p);
    } else if (v.isObject() && v.hasProperty("voices")) out.add(v);
    return out;
}

const juce::Array<juce::var>& factoryPresets() {
    static const juce::Array<juce::var> all = [] {
        // presets/*.json, sorted by file name like the browser build
        juce::StringArray files;
        for (int i = 0; i < BinaryData::namedResourceListSize; i++)
            if (juce::String(BinaryData::originalFilenames[i]).endsWithIgnoreCase(".json")) files.add(BinaryData::namedResourceList[i]);
        juce::Array<std::pair<juce::String, juce::String>> byName;
        for (auto& r : files) byName.add({ BinaryData::getNamedResourceOriginalFilename(r.toRawUTF8()), r });
        std::sort(byName.begin(), byName.end(), [](auto& a, auto& b) { return a.first < b.first; });
        juce::Array<juce::var> out;
        for (auto& [fname, res] : byName) {
            int size = 0;
            const char* d = BinaryData::getNamedResource(res.toRawUTF8(), size);
            out.addArray(presetsInJson(juce::JSON::parse(juce::String::fromUTF8(d, size))));
        }
        return out;
    }();
    return all;
}

} // namespace fmdm
