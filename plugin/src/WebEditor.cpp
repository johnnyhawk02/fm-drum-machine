#include "WebEditor.h"
#include "BinaryData.h"

namespace fmdm {

static juce::WebBrowserComponent::Options webOptions(WebEditor* ed, FmDmProcessor& p,
                                                      std::function<std::optional<juce::WebBrowserComponent::Resource>(const juce::String&)> res) {
    juce::ignoreUnused(ed);
    return juce::WebBrowserComponent::Options {}
        .withBackend(juce::WebBrowserComponent::Options::Backend::webview2)
        .withWinWebView2Options(juce::WebBrowserComponent::Options::WinWebView2 {}.withUserDataFolder(
            juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("fm-dm")))
        .withNativeIntegrationEnabled()
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withResourceProvider(std::move(res))
        .withEventListener("fmdm", [&p](const juce::var& m) { p.fromPage(m); });
}

WebEditor::WebEditor(FmDmProcessor& p)
    : AudioProcessorEditor(&p), proc(p), web(webOptions(this, p, [this](const juce::String& u) { return resource(u); })) {
    addAndMakeVisible(web);
    proc.toPage = [this](const juce::var& m) { web.emitEventIfBrowserIsVisible("fmdm", m); };
    // the page lays itself out for any size (1440x900 design pixels, scaled to fit)
    setResizable(true, true);
    setResizeLimits(720, 450, 2880, 1800);
    setSize(1152, 720);
    web.goToURL(juce::WebBrowserComponent::getResourceProviderRoot());
}

WebEditor::~WebEditor() { proc.toPage = nullptr; }

void WebEditor::resized() { web.setBounds(getLocalBounds()); }

// Some web views read a served page as Latin-1 whatever its charset says, so the page goes out as plain
// ASCII: characters past 127 become \uXXXX in the script (valid anywhere in JS) and \XXXXXX in the CSS.
static std::vector<std::byte> asciiPage() {
    const auto src = juce::String::fromUTF8(BinaryData::index_html, BinaryData::index_htmlSize);
    juce::String out;
    out.preallocateBytes((size_t) BinaryData::index_htmlSize + 4096);
    const int styleStart = src.indexOf("<style>"), styleEnd = src.indexOf("</style>");
    int i = 0;
    for (auto p = src.getCharPointer(); !p.isEmpty(); ++i) {
        const juce::juce_wchar c = p.getAndAdvance();
        if (c < 128) out << juce::String::charToString(c);
        else if (i > styleStart && i < styleEnd) out << "\\" << juce::String::toHexString((int) c).paddedLeft('0', 6);
        else if (c < 0x10000) out << "\\u" << juce::String::toHexString((int) c).paddedLeft('0', 4);
        else {
            const int v = (int) c - 0x10000;
            out << "\\u" << juce::String::toHexString(0xd800 + (v >> 10)) << "\\u" << juce::String::toHexString(0xdc00 + (v & 0x3ff));
        }
    }
    const auto* d = reinterpret_cast<const std::byte*>(out.toRawUTF8());
    return std::vector<std::byte>(d, d + out.getNumBytesAsUTF8());
}

std::optional<juce::WebBrowserComponent::Resource> WebEditor::resource(const juce::String& url) {
    const auto path = url.fromFirstOccurrenceOf("/", false, false).upToFirstOccurrenceOf("?", false, false);
    if (path.isEmpty() || path == "index.html") {
        static const std::vector<std::byte> page = asciiPage();
        return juce::WebBrowserComponent::Resource { page, "text/html; charset=utf-8" };
    }
    return std::nullopt;
}

} // namespace fmdm
