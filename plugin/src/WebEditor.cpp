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

// ---- splash
Splash::Splash() {
    // the logo artwork is a mask (grey + alpha), printed in ink like the page does
    logo = juce::ImageCache::getFromMemory(BinaryData::logo_png, BinaryData::logo_pngSize);
    setOpaque(true);
    startTimerHz(30);
}

void Splash::paint(juce::Graphics& g) {
    const juce::Colour lcd(0xffd1c7ac), ink(0xff17200e), dim = ink.withAlpha(0.16f);
    g.fillAll(lcd);
    const auto b = getLocalBounds().toFloat();
    const float lw = juce::jmin(b.getWidth() * 0.36f, 420.f), lh = lw * (float) logo.getHeight() / (float) juce::jmax(1, logo.getWidth());
    const juce::Rectangle<float> lr(b.getCentreX() - lw / 2, b.getCentreY() - lh / 2 - 24, lw, lh);
    if (logo.isValid()) {
        g.setColour(ink);
        g.drawImage(logo, lr, juce::RectanglePlacement::centred, true); // alpha-only fill in the current colour
    }
    // loading: a row of greyed segments with a lit block sweeping across
    const int segs = 16;
    const float sw = lw / segs, sh = 10.f, y = lr.getBottom() + 28;
    const int head = phase % (segs + 4);
    for (int i = 0; i < segs; i++) {
        const bool lit = i <= head && i > head - 4;
        g.setColour(lit ? ink : dim);
        g.fillRect(lr.getX() + i * sw + 1, y, sw - 3, sh);
    }
}

// ---- editor
WebEditor::WebEditor(FmDmProcessor& p)
    : AudioProcessorEditor(&p), proc(p), web(webOptions(this, p, [this](const juce::String& u) { return resource(u); })) {
    addAndMakeVisible(web);
    addAndMakeVisible(splash);
    proc.toPage = [this](const juce::var& m) { web.emitEventIfBrowserIsVisible("fmdm", m); };
    proc.onPageReady = [this] { pageReady(); };
    startTimer(20000);
    // the page lays itself out for any size (1440x900 design pixels, scaled to fit)
    setResizable(true, true);
    setResizeLimits(720, 450, 2880, 1800);
    if (auto* c = getConstrainer()) c->setFixedAspectRatio(1440.0 / 900.0); // 16:10, like the page
    setSize(1152, 720);
    pageLog("editor: opening " + juce::WebBrowserComponent::getResourceProviderRoot());
    web.goToURL(juce::WebBrowserComponent::getResourceProviderRoot());
    // ask the page directly (not through its messages) how it's doing, a few times, into page.log
    for (int ms : { 5000, 20000 }) {
        juce::Component::SafePointer<WebEditor> sp(this);
        juce::Timer::callAfterDelay(ms, [sp, ms] {
            if (sp == nullptr) return;
            sp->web.evaluateJavascript(
                "JSON.stringify({rs:document.readyState,href:location.href,w:innerWidth,h:innerHeight,"
                "juce:!!(window.__JUCE__&&window.__JUCE__.backend),hdr:(document.getElementById('hdr')||{children:[]}).children.length,"
                "perf:(document.getElementById('perf')||{children:[]}).children.length,err:window.__fmdmErr||null,"
                "html:document.documentElement.outerHTML.length,js:(document.scripts[0]||{text:''}).text.length,"
                "tail:(document.scripts[0]||{text:''}).text.slice(-60),"
                "parse:(()=>{try{new Function((document.scripts[0]||{text:''}).text);return 'ok'}catch(e){return String(e)}})()})",
                [ms](juce::WebBrowserComponent::EvaluationResult r) {
                    if (auto* v = r.getResult()) pageLog("probe " + juce::String(ms) + "ms: " + v->toString());
                    else pageLog("probe " + juce::String(ms) + "ms failed: " + (r.getError() ? r.getError()->message : juce::String("?")));
                });
        });
    }
}

WebEditor::~WebEditor() {
    proc.toPage = nullptr;
    proc.onPageReady = nullptr;
}

// The web view is a native view that would cover the splash, so until the page has started it sits in a
// one-pixel corner (still "visible", so messages reach it); then it takes the whole editor.
void WebEditor::resized() {
    splash.setBounds(getLocalBounds());
    web.setBounds(ready ? getLocalBounds() : juce::Rectangle<int>(0, 0, 1, 1));
}

void WebEditor::pageReady() {
    if (ready) return;
    ready = true;
    stopTimer();
    splash.setVisible(false);
    resized();
}

std::optional<juce::WebBrowserComponent::Resource> WebEditor::resource(const juce::String& url) {
    const auto path = url.fromFirstOccurrenceOf("/", false, false).upToFirstOccurrenceOf("?", false, false);
    if (path.isEmpty() || path == "index.html") {
        // already plain ASCII (plugin/tools/ascii-page.mjs)
        const auto* d = reinterpret_cast<const std::byte*>(BinaryData::index_html);
        static const std::vector<std::byte> page(d, d + BinaryData::index_htmlSize);
        return juce::WebBrowserComponent::Resource { page, "text/html; charset=utf-8" };
    }
    return std::nullopt;
}

} // namespace fmdm
