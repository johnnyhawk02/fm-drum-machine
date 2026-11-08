// fm/dm — the editor is the browser version's own page (dist/index.html, built from src/ by build.mjs),
// shown in a web view, so the plugin always looks and works exactly like the latest prototype.
#pragma once
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

namespace fmdm {

// shown at once while the page loads: the logo and a sweeping segment bar, on the screen colour
class Splash : public juce::Component, private juce::Timer {
public:
    Splash();
    void paint(juce::Graphics&) override;

private:
    void timerCallback() override { phase++; repaint(); }
    juce::Image logo;
    int phase = 0;
};

class WebEditor : public juce::AudioProcessorEditor, private juce::Timer {
public:
    explicit WebEditor(FmDmProcessor&);
    ~WebEditor() override;
    void resized() override;
    void pageReady();

private:
    void timerCallback() override { pageReady(); } // never leave the splash up for good
    bool ready = false;
    Splash splash;
    std::optional<juce::WebBrowserComponent::Resource> resource(const juce::String& url);
    FmDmProcessor& proc;
    juce::WebBrowserComponent web;
};

} // namespace fmdm
