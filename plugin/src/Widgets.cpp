#include "Widgets.h"
#include "Sequencer.h"
#include "IRs.h"
#include "BinaryData.h"

namespace fmdm {

juce::Font lcdFont(float height) {
    static const juce::Typeface::Ptr tf =
        juce::Typeface::createSystemTypefaceFor(BinaryData::VT323Regular_ttf, (size_t) BinaryData::VT323Regular_ttfSize);
    return juce::Font(juce::FontOptions(tf).withHeight(height));
}

// ---- value readouts, in the browser version's style
static const char* const ALGOS[] = { "D>C>B>A", "C+D>B>A", "D>C B>A", "B+C+D>A", "D>ABC", "D>C>A B>A", "D>C A B", "A B C D" };
static const char* const FILTER_TYPES[] = { "off", "lp", "bp", "hp" };
static const char* const NOISE_TYPES[] = { "lp", "bp", "hp" };
static const char* const CLICK_TYPES[] = { "pulse", "tick", "blip" };
static const char* const LFO_SHAPES[] = { "sine", "tri", "saw", "square", "s&h" };
static const char* const LFO_DESTS[] = { "off", "pitch", "fm", "cutoff", "level", "pan", "noise", "ratio" };
static const char* const ECHO_DIVS[] = { "1/32", "1/16t", "1/16", "1/8t", "1/16d", "1/8", "1/4t", "1/8d", "1/4", "1/2t", "1/4d", "1/2", "1 bar" };
static const char* const DIST_TYPES[] = { "tube", "fold", "clip", "tape" };
static const char* const GROOVES[] = { "swing 16", "swing 8", "shuffle", "drunk" };
static const char* const RUSH_NAMES[] = { "off", "1 bar", "2 bars", "4 bars", "8 bars" };

static juce::String pick(const char* const* names, int n, float x) {
    const int i = juce::jlimit(0, n - 1, (int) std::lround(x));
    return names[i];
}
static juce::String hz(float x) { return x >= 1000 ? juce::String(x / 1000, x >= 10000 ? 1 : 2) + "k" : juce::String((int) std::lround(x)) + "hz"; }
static juce::String ms(float x) { return x >= 1000 ? juce::String(x / 1000, 2) + "s" : x < 10 ? juce::String(x, 1) + "ms" : juce::String(juce::roundToInt(x)) + "ms"; }
static juce::String pct(float x) { return juce::String((int) std::lround(x * 100)) + "%"; }

juce::String paramLabel(int g) { return specOf(g).label; }

juce::String formatValue(int g, float x) {
    const juce::String id = specOf(g).id;
    const auto& s = specOf(g);
    if (g < NV) {
        if (id == "algo") return pick(ALGOS, 8, x);
        if (id == "fType") return pick(FILTER_TYPES, 4, x);
        if (id == "nType") return pick(NOISE_TYPES, 3, x);
        if (id == "clkType") return pick(CLICK_TYPES, 3, x);
        if (id == "lShape") return pick(LFO_SHAPES, 5, x);
        if (id == "lDest" || id == "lDest2") return pick(LFO_DESTS, 8, x);
        if (id == "tune" || id == "nCut" || id == "fCut") return hz(x);
        if (id.startsWith("r") && id.length() == 2) return juce::String(x, 3);
        if (id == "trim") return juce::String(x, 1) + "db";
        if (id == "pAmt") return juce::String(x, 1) + "st";
        if (id == "lRate") return juce::String(x, 2) + "hz";
        if (id == "bits") return juce::String(x, 1);
        if (id == "srDiv") return juce::String(x, 1) + "x";
        if (id == "nBurst") return juce::String((int) std::lround(x));
        if (id == "fb" || id == "fEnv" || id == "pan" || id == "drift") return juce::String((int) std::lround(x * 100));
    } else {
        if (id == "bpm") return juce::String(x, 1) + " bpm";
        if (id == "eDiv") return pick(ECHO_DIVS, 13, x);
        if (id == "rType") return x >= 0.5f ? "ir" : "algo";
        if (id == "rIr") return irName((int) std::lround(x));
        if (id == "mdType") return pick(DIST_TYPES, 4, x);
        if (id == "swType") return pick(GROOVES, 4, x);
        if (id == "rushEvery") return pick(RUSH_NAMES, 5, x);
        if (id == "rmHz" || id == "eTone" || id == "rTone" || id == "sdTone" || id == "mHp" || id == "mdTone" || id == "rushHp") return hz(x);
        if (id == "rDecay") return juce::String(x, 2) + "s";
        if (id == "cThr" || id == "cMake") return juce::String(x, 1) + "db";
        if (id == "cRatio") return juce::String(x, 1) + ":1";
        if (id == "patLen" || id == "rushLen" || id == "rushRate") return juce::String((int) std::lround(x));
        if (id == "rushVoice") return VOICE_NAMES[juce::jlimit(0, 5, (int) std::lround(x))];
        if (id == "eFine" || id == "mdColour") return juce::String((int) std::lround(x * 100));
        if (id == "mdVol" || id == "mVol") return pct(x);
    }
    if (s.curve == CURVE_INT && s.min == 0 && s.max == 1) return x >= 0.5f ? "on" : "off";
    if (id.containsIgnoreCase("atk") || id.containsIgnoreCase("dec") || id.containsIgnoreCase("hold") || id.containsIgnoreCase("rel") ||
        id == "nSpace" || id == "eMs" || id == "rPre" || id.startsWith("d") || id.startsWith("a"))
        if (s.max > 1.5f) return ms(x);
    if (s.min >= 0 && s.max <= 1.0f) return pct(x);
    return juce::String(x, 2);
}

// ---- look and feel
LcdLook::LcdLook() {
    setColour(juce::PopupMenu::backgroundColourId, col::lcd);
    setColour(juce::PopupMenu::textColourId, col::ink);
    setColour(juce::PopupMenu::highlightedBackgroundColourId, col::ink);
    setColour(juce::PopupMenu::highlightedTextColourId, col::lcd);
}

void LcdLook::drawPopupMenuBackground(juce::Graphics& g, int w, int h) {
    g.fillAll(col::lcd);
    g.setColour(col::ink);
    g.drawRect(0, 0, w, h, 2);
}

void LcdLook::drawButtonBackground(juce::Graphics& g, juce::Button& b, const juce::Colour&, bool over, bool) {
    auto r = b.getLocalBounds().toFloat().reduced(1.f);
    const bool on = b.getToggleState();
    const bool spot = dynamic_cast<LcdButton*>(&b) && static_cast<LcdButton&>(b).spot;
    if (on) g.setColour(spot ? col::spot : col::ink), g.fillRoundedRectangle(r, 3.f);
    else if (over && b.isEnabled()) g.setColour(col::dim()), g.fillRoundedRectangle(r, 3.f);
    g.setColour(on && spot ? col::spot : col::ink.withAlpha(b.isEnabled() ? 1.f : 0.3f));
    g.drawRoundedRectangle(r, 3.f, 2.f);
}

void LcdLook::drawButtonText(juce::Graphics& g, juce::TextButton& b, bool, bool) {
    const bool on = b.getToggleState();
    g.setFont(getTextButtonFont(b, b.getHeight()));
    g.setColour((on ? col::lcd : col::ink).withAlpha(b.isEnabled() ? 1.f : 0.3f));
    g.drawFittedText(b.getButtonText().toUpperCase(), b.getLocalBounds().reduced(4, 0), juce::Justification::centred, 1);
}

// ---- knob
Knob::Knob() { setRepaintsOnMouseActivity(false); }

void Knob::setParam(int flatIndex, float x) {
    g = flatIndex;
    value = x;
    repaint();
}

void Knob::setValue(float x) {
    if (x != value) {
        value = x;
        repaint();
    }
}

void Knob::paint(juce::Graphics& gr) {
    if (g < 0) return;
    const auto b = getLocalBounds();
    const float d = (float) juce::jmin(b.getWidth() - 10, b.getHeight() - 36);
    const float cx = b.getCentreX(), cy = 20.f + d * 0.5f, rad = d * 0.5f - 3.f;
    const float span = juce::MathConstants<float>::pi * 1.5f;
    const auto& s = specOf(g);
    const float n = (float) juce::jlimit(0.0, 1.0, normOf(g, value));
    const bool bip = s.curve == CURVE_BIP;
    // greyed track, lit arc (from the centre for bipolar knobs), pointer
    juce::Path t2;
    t2.addCentredArc(cx, cy, rad, rad, 0, -span * 0.5f, span * 0.5f, true);
    gr.setColour(col::dim());
    gr.strokePath(t2, juce::PathStrokeType(4.5f));
    const float from = bip ? 0.f : -span * 0.5f;
    const float to = -span * 0.5f + span * n;
    juce::Path arc;
    arc.addCentredArc(cx, cy, rad, rad, 0, juce::jmin(from, to), juce::jmax(from, to), true);
    const juce::Colour c = dragging ? col::spot : col::ink;
    gr.setColour(c);
    gr.strokePath(arc, juce::PathStrokeType(4.5f));
    const float pa = -span * 0.5f + span * n;
    gr.drawLine(cx + std::sin(pa) * rad * 0.2f, cy - std::cos(pa) * rad * 0.2f, cx + std::sin(pa) * (rad - 1), cy - std::cos(pa) * (rad - 1), 2.5f);
    gr.setColour(col::ink);
    gr.setFont(lcdFont(17.f));
    gr.drawFittedText(formatValue(g, value), b.withHeight(18), juce::Justification::centred, 1);
    gr.setFont(lcdFont(18.f));
    gr.drawFittedText(paramLabel(g).toUpperCase(), b.withTop(b.getBottom() - 18), juce::Justification::centred, 1);
}

void Knob::setNorm(double n) {
    const float x = (float) denormOf(g, n);
    if (x != value) {
        value = x;
        repaint();
        if (onChange) onChange(g, x);
    }
}

void Knob::mouseDown(const juce::MouseEvent&) {
    dragNorm = juce::jlimit(0.0, 1.0, normOf(g, value));
    dragging = true;
    repaint();
}

void Knob::mouseDrag(const juce::MouseEvent& e) {
    const double sens = e.mods.isShiftDown() ? 1200.0 : 200.0;
    const double dy = -(e.getDistanceFromDragStartY()) + e.getDistanceFromDragStartX() * 0.5;
    setNorm(juce::jlimit(0.0, 1.0, dragNorm + dy / sens));
}

void Knob::mouseUp(const juce::MouseEvent&) {
    dragging = false;
    repaint();
}

void Knob::mouseDoubleClick(const juce::MouseEvent&) {
    const float def = g >= NV ? MASTER_SPEC[g - NV].def : INIT_KIT[g];
    value = def;
    repaint();
    if (onChange) onChange(g, def);
}

void Knob::mouseWheelMove(const juce::MouseEvent&, const juce::MouseWheelDetails& w) {
    const auto& s = specOf(g);
    double n = normOf(g, value);
    if (s.curve == CURVE_INT) n += (w.deltaY > 0 ? 1 : -1) / juce::jmax(1.0, (double) s.max - s.min);
    else n += w.deltaY * 0.05;
    setNorm(juce::jlimit(0.0, 1.0, n));
}

// ---- knob panel
void KnobPanel::setSections(std::vector<Section> s, const float* values) {
    sections = std::move(s);
    knobs.clear();
    for (auto& sec : sections)
        for (int p : sec.params) {
            auto k = std::make_unique<Knob>();
            k->setParam(p, values[p]);
            k->onChange = [this](int gg, float x) { if (onChange) onChange(gg, x); };
            addAndMakeVisible(*k);
            knobs.push_back(std::move(k));
        }
    resized();
    repaint();
}

void KnobPanel::refresh(const float* values) {
    for (auto& k : knobs) k->setValue(values[k->param()]);
}

void KnobPanel::resized() {
    titles.clear();
    ruleYs.clear();
    const int kw = 68, kh = 82, titleW = 74;
    const int perRow = juce::jmax(1, (getWidth() - titleW) / kw);
    int y = 0;
    size_t ki = 0;
    for (auto& sec : sections) {
        titles.push_back({ sec.title, { 0, y + 8, titleW - 6, 20 } });
        int col = 0;
        for (size_t j = 0; j < sec.params.size(); j++) {
            if (col == perRow) {
                col = 0;
                y += kh;
            }
            knobs[ki++]->setBounds(titleW + col * kw, y, kw, kh);
            col++;
        }
        y += kh + 4;
        ruleYs.push_back(y - 3);
    }
}

void KnobPanel::paint(juce::Graphics& g) {
    g.setColour(col::ink);
    g.setFont(lcdFont(21.f));
    for (auto& [t, r] : titles) g.drawText(t.toUpperCase(), r, juce::Justification::topLeft);
    for (size_t i = 0; i + 1 < ruleYs.size(); i++) g.fillRect(0, ruleYs[i], getWidth(), 1);
}

} // namespace fmdm
