// fm/dm — flat LCD widgets: outlined buttons that invert when on, ring knobs with greyed unlit track.
// One beige screen colour, dark ink, and one orange spot for live / selected things.
#pragma once
#include <juce_gui_basics/juce_gui_basics.h>
#include "ParamsGen.h"

namespace fmdm {

namespace col {
const juce::Colour lcd { 0xffd1c7ac };
const juce::Colour ink { 0xff17200e };
const juce::Colour spot { 0xffe0532a };
const juce::Colour bezel { 0xff0b0c0a };
inline juce::Colour dim() { return ink.withAlpha(0.16f); }
inline juce::Colour mid() { return ink.withAlpha(0.45f); }
}

juce::Font lcdFont(float height);
juce::String formatValue(int g, float x); // the readout above a knob
juce::String paramLabel(int g);

class LcdLook : public juce::LookAndFeel_V4 {
public:
    LcdLook();
    void drawButtonBackground(juce::Graphics&, juce::Button&, const juce::Colour&, bool over, bool down) override;
    void drawButtonText(juce::Graphics&, juce::TextButton&, bool over, bool down) override;
    juce::Font getTextButtonFont(juce::TextButton&, int h) override { return lcdFont((float) h * 0.62f); }
    juce::Font getPopupMenuFont() override { return lcdFont(20.f); }
    void drawPopupMenuBackground(juce::Graphics&, int w, int h) override;
};

// an outlined button; set "spot" to true to fill it with the spot colour when on (play)
class LcdButton : public juce::TextButton {
public:
    explicit LcdButton(const juce::String& text = {}) : juce::TextButton(text) {}
    bool spot = false;
};

// a knob for one flat parameter (voice v*NP+i or NV+master i)
class Knob : public juce::Component {
public:
    Knob();
    void setParam(int flatIndex, float value);
    int param() const { return g; }
    void setValue(float x); // from the model, no callback
    std::function<void(int g, float x)> onChange;

    void paint(juce::Graphics&) override;
    void mouseDown(const juce::MouseEvent&) override;
    void mouseDrag(const juce::MouseEvent&) override;
    void mouseUp(const juce::MouseEvent&) override;
    void mouseDoubleClick(const juce::MouseEvent&) override;
    void mouseWheelMove(const juce::MouseEvent&, const juce::MouseWheelDetails&) override;

private:
    void setNorm(double n);
    int g = -1;
    float value = 0;
    double dragNorm = 0;
    bool dragging = false;
};

// rows of knobs under section titles; knobs flow left to right and wrap
class KnobPanel : public juce::Component {
public:
    struct Section { juce::String title; std::vector<int> params; };
    void setSections(std::vector<Section> s, const float* values);
    void refresh(const float* values);
    std::function<void(int g, float x)> onChange;
    void resized() override;
    void paint(juce::Graphics&) override;

private:
    std::vector<Section> sections;
    std::vector<std::unique_ptr<Knob>> knobs;
    std::vector<std::pair<juce::String, juce::Rectangle<int>>> titles;
    std::vector<int> ruleYs;
};

} // namespace fmdm
