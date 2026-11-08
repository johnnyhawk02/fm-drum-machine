// fm/dm — the editor is the browser version's own page (dist/index.html, built from src/ by build.mjs),
// shown in a web view, so the plugin always looks and works exactly like the latest prototype.
#pragma once
#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

namespace fmdm {

class WebEditor : public juce::AudioProcessorEditor {
public:
    explicit WebEditor(FmDmProcessor&);
    ~WebEditor() override;
    void resized() override;

private:
    std::optional<juce::WebBrowserComponent::Resource> resource(const juce::String& url);
    FmDmProcessor& proc;
    juce::WebBrowserComponent web;
};

} // namespace fmdm
