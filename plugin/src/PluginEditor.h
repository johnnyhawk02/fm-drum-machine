// fm/dm — plugin editor: header (presets, play, tempo, master), the 6x16 step grid with meters, and
// knob pages for the selected drum and the effects.
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"
#include "Widgets.h"

namespace fmdm {

class StepGrid : public juce::Component {
public:
    explicit StepGrid(FmDmProcessor& p) : proc(p) {}
    void paint(juce::Graphics&) override;
    void mouseDown(const juce::MouseEvent&) override;
    void mouseDrag(const juce::MouseEvent&) override;
    int page = 0, playStep = -1, selVoice = 0;
    std::function<void(int)> onVoice;
    static constexpr int NAME_W = 96, METER_W = 14;

private:
    juce::Rectangle<int> cell(int v, int k) const;
    bool hit(juce::Point<int> p, int& v, int& k) const;
    FmDmProcessor& proc;
    int paintVel = -1; // drag paints the state set by the first click
};

class FmDmEditor : public juce::AudioProcessorEditor, private juce::Timer {
public:
    explicit FmDmEditor(FmDmProcessor&);
    ~FmDmEditor() override;
    void paint(juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void selectVoice(int v);
    void showPage(int p);
    void refreshAll();
    void presetMenu();
    void stepPreset(int d);
    void savePresetFile();
    void loadPresetFile();

    FmDmProcessor& proc;
    LcdLook look;
    LcdButton prevB { "<" }, nextB { ">" }, presetB, saveB { "save" }, loadB { "load" }, irB { "ir file" };
    LcdButton playB { "play" };
    Knob bpmK, volK, lenK, swingK, grooveK, accentK;
    LcdButton pageB[8];
    LcdButton voiceTab { "voice" }, fxTab { "fx" };
    StepGrid grid;
    KnobPanel panel;
    int voice = 0, pageShown = 0, seenVersion = -1, presetIdx = 0;
    std::unique_ptr<juce::FileChooser> chooser;
};

} // namespace fmdm
