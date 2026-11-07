#include "PluginEditor.h"

namespace fmdm {

static constexpr int W = 1240, H = 780, BEZEL = 8;

// ---- step grid
juce::Rectangle<int> StepGrid::cell(int v, int k) const {
    const int x0 = NAME_W + METER_W + 10;
    const float cw = (getWidth() - x0) / 16.f;
    const float rh = getHeight() / (float) NUM_VOICES;
    const int gap = (k % 4 == 3) ? 6 : 3;
    return juce::Rectangle<float>(x0 + k * cw, v * rh, cw - gap, rh - 6).toNearestInt();
}

bool StepGrid::hit(juce::Point<int> p, int& v, int& k) const {
    const int x0 = NAME_W + METER_W + 10;
    if (p.x < x0 || p.y < 0 || p.y >= getHeight()) return false;
    v = juce::jlimit(0, NUM_VOICES - 1, (int) (p.y / (getHeight() / (float) NUM_VOICES)));
    k = juce::jlimit(0, 15, (int) ((p.x - x0) / ((getWidth() - x0) / 16.f)));
    return true;
}

void StepGrid::paint(juce::Graphics& g) {
    const int len = (int) proc.model.base[NV + M::patLen];
    const float rh = getHeight() / (float) NUM_VOICES;
    for (int v = 0; v < NUM_VOICES; v++) {
        // drum name: inverted when selected
        auto nr = juce::Rectangle<float>(0, v * rh, (float) NAME_W, rh - 6).reduced(1);
        if (v == selVoice) g.setColour(col::ink), g.fillRoundedRectangle(nr, 3.f);
        g.setColour(col::ink);
        g.drawRoundedRectangle(nr, 3.f, 2.f);
        g.setColour(v == selVoice ? col::lcd : col::ink);
        g.setFont(lcdFont(22.f));
        g.drawText(juce::String(VOICE_NAMES[v]).toUpperCase(), nr.toNearestInt(), juce::Justification::centred);
        // meter: greyed segments, lit from the bottom
        const float lvl = proc.meters[v].load();
        const int segs = 8;
        const float segH = (rh - 6) / segs;
        const int lit = (int) std::ceil(juce::jlimit(0.f, 1.f, std::sqrt(lvl)) * segs - 0.01f);
        for (int s = 0; s < segs; s++) {
            g.setColour(s < lit ? col::ink : col::dim());
            g.fillRect(juce::Rectangle<float>((float) NAME_W + 6, v * rh + (rh - 6) - (s + 1) * segH + 1, (float) METER_W - 4, segH - 2));
        }
        // steps
        for (int k = 0; k < 16; k++) {
            const int step = page * 16 + k;
            const auto r = cell(v, k).toFloat();
            const int i = v * MAX_STEPS + step;
            const bool inLen = step < len;
            const int vl = proc.model.vel[i], fl = proc.model.flag[i];
            g.setColour(inLen ? col::ink : col::dim());
            if (vl && inLen) {
                g.fillRoundedRectangle(r, 2.f);
                g.setColour(col::lcd);
                if (fl & F_ACCENT) g.fillRect(r.getCentreX() - 4, r.getY() + 5, 8.f, 3.f); // accent: a bar on top
                if (fl & F_OPEN) g.drawEllipse(r.withSizeKeepingCentre(12, 12), 2.f);     // open hat: a ring
            } else {
                g.drawRoundedRectangle(r.reduced(1), 2.f, inLen ? 1.5f : 1.f);
            }
            if (step == playStep) {
                g.setColour(col::spot);
                g.fillRect(r.getX(), r.getBottom() + 1, r.getWidth(), 3.f);
            }
        }
    }
}

void StepGrid::mouseDown(const juce::MouseEvent& e) {
    const auto p = e.getPosition();
    if (p.x < NAME_W) {
        const int v = juce::jlimit(0, NUM_VOICES - 1, (int) (p.y / (getHeight() / (float) NUM_VOICES)));
        if (onVoice) onVoice(v);
        proc.trigger(v, 1.f, e.mods.isShiftDown() && v == 5 ? 1 : 0);
        return;
    }
    int v, k;
    if (!hit(p, v, k)) return;
    const int step = page * 16 + k;
    const int i = v * MAX_STEPS + step;
    int vl = proc.model.vel[i], fl = proc.model.flag[i];
    if (e.mods.isPopupMenu() || e.mods.isAltDown()) {
        // right click (or alt): accent; on the hihat row it toggles open first
        if (!vl) vl = 100;
        if (v == 5 && !(fl & F_OPEN)) fl |= F_OPEN;
        else if (!(fl & F_ACCENT)) fl = (fl & ~F_OPEN) | F_ACCENT;
        else fl = 0;
        paintVel = -1;
    } else {
        vl = vl ? 0 : 100;
        fl = vl ? fl : 0;
        paintVel = vl;
    }
    proc.setStep(v, step, vl, fl);
    repaint();
}

void StepGrid::mouseDrag(const juce::MouseEvent& e) {
    int v, k;
    if (paintVel < 0 || !hit(e.getPosition(), v, k)) return;
    const int step = page * 16 + k;
    const int i = v * MAX_STEPS + step;
    if ((proc.model.vel[i] != 0) == (paintVel != 0)) return;
    proc.setStep(v, step, paintVel, paintVel ? proc.model.flag[i] : 0);
    repaint();
}

// ---- editor
static std::vector<KnobPanel::Section> voiceSections(int v) {
    const int b = v * NP;
    auto ps = [b](std::initializer_list<int> ids) {
        std::vector<int> out;
        for (int i : ids) out.push_back(b + i);
        return out;
    };
    using namespace P;
    return {
        { "fm", ps({ algo, tune, fmLvl, fb, fmEnd, drift, fmNoise, hum }) },
        { "op a b", ps({ rA, lA, aA, dA, rB, lB, aB, dB }) },
        { "op c d", ps({ rC, lC, aC, dC, rD, lD, aD, dD }) },
        { "pitch", ps({ pAmt, pDec, clk, clkType, clkDec, vPitch, vFm, vLvl }) },
        { "noise", ps({ nLvl, nType, nCut, nRes, nDec, nBurst }) },
        { "filter", ps({ fType, fCut, fRes, fDrive, fEnv, fEnvDec }) },
        { "amp", ps({ aAtk, aHold, aDec, aCurve, level, pan, sEcho, sRev }) },
    };
}

static std::vector<KnobPanel::Section> fxSections() {
    auto ps = [](std::initializer_list<int> ids) {
        std::vector<int> out;
        for (int i : ids) out.push_back(NV + i);
        return out;
    };
    using namespace M;
    return {
        { "echo", ps({ eSync, eDiv, eMs, eFb, eTone, eWidth, ePing, eLvl }) },
        { "reverb", ps({ rType, rIr, rPre, rDecay, rTone, rEarly, rLvl }) },
        { "dist/ring", ps({ sdDrive, sdTone, sdLvl, rmHz, rmLvl }) },
        { "duck", ps({ dkAmt, dkRel, dkSpace, mHp }) },
        { "drive", ps({ mdType, mdDrive, mdColour, mdTone, mdMix, mdVol }) },
        { "comp", ps({ cThr, cRatio, cAtk, cRel, cMake, cMix }) },
        { "rush", ps({ rushEvery, rushLen, rushVoice, rushRate, rushHp }) },
    };
}

FmDmEditor::FmDmEditor(FmDmProcessor& p) : AudioProcessorEditor(&p), proc(p), grid(p) {
    setLookAndFeel(&look);
    for (auto* b : { &prevB, &nextB, &presetB, &saveB, &loadB, &irB, &playB, &voiceTab, &fxTab }) addAndMakeVisible(*b);
    playB.spot = true;
    prevB.onClick = [this] { stepPreset(-1); };
    nextB.onClick = [this] { stepPreset(1); };
    presetB.onClick = [this] { presetMenu(); };
    saveB.onClick = [this] { savePresetFile(); };
    loadB.onClick = [this] { loadPresetFile(); };
    irB.onClick = [this] {
        chooser = std::make_unique<juce::FileChooser>("your impulse response", juce::File(), "*.wav;*.aif;*.aiff;*.flac;*.mp3;*.ogg");
        chooser->launchAsync(juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles, [this](const juce::FileChooser& fc) {
            if (fc.getResult().existsAsFile() && proc.loadUserIR(fc.getResult())) refreshAll();
        });
    };
    playB.onClick = [this] { proc.play(!proc.playing.load()); };
    voiceTab.onClick = [this] { showPage(0); };
    fxTab.onClick = [this] { showPage(1); };

    const auto setG = [this](int g, float x) {
        proc.setParam(g, x);
        if (g == NV + M::patLen) grid.repaint();
    };
    struct KS { Knob* k; int g; };
    for (auto [k, g] : { KS { &bpmK, NV + M::bpm }, KS { &volK, NV + M::mVol }, KS { &lenK, NV + M::patLen }, KS { &swingK, NV + M::swDepth },
                         KS { &grooveK, NV + M::swType }, KS { &accentK, NV + M::accent } }) {
        k->setParam(g, proc.model.base[g]);
        k->onChange = setG;
        addAndMakeVisible(*k);
    }
    for (int i = 0; i < 8; i++) {
        pageB[i].setButtonText(juce::String(i + 1));
        pageB[i].onClick = [this, i] { grid.page = i; refreshAll(); };
        addAndMakeVisible(pageB[i]);
    }
    grid.onVoice = [this](int v) { selectVoice(v); };
    addAndMakeVisible(grid);
    panel.onChange = setG;
    addAndMakeVisible(panel);

    setSize(W, H);
    showPage(0);
    refreshAll();
    startTimerHz(30);
}

FmDmEditor::~FmDmEditor() { setLookAndFeel(nullptr); }

void FmDmEditor::paint(juce::Graphics& g) {
    g.fillAll(col::bezel);
    const auto lcd = getLocalBounds().reduced(BEZEL).toFloat();
    g.setColour(col::lcd);
    g.fillRoundedRectangle(lcd, 10.f);
    g.setColour(col::ink);
    g.setFont(lcdFont(40.f));
    g.drawText("fm dm", BEZEL + 18, BEZEL + 8, 110, 44, juce::Justification::centredLeft);
    // section frames
    g.drawRoundedRectangle(juce::Rectangle<float>(BEZEL + 14.f, 74.f, 540.f, (float) H - 74 - BEZEL - 14), 8.f, 2.f);
    g.fillRect(BEZEL + 572, 80, 2, H - 80 - BEZEL - 20);
    g.setFont(lcdFont(22.f));
    g.drawText("BEAT", BEZEL + 34, 84, 200, 24, juce::Justification::centredLeft);
    g.setColour(col::mid());
    g.setFont(lcdFont(18.f));
    const juce::String hint = proc.hostSync.load() ? "following host tempo" : "click: step  right click: accent / open";
    g.drawText(hint.toUpperCase(), BEZEL + 120, 84, 420, 24, juce::Justification::centredRight);
}

void FmDmEditor::resized() {
    const int top = BEZEL + 14;
    int x = BEZEL + 140;
    prevB.setBounds(x, top, 34, 36);
    presetB.setBounds(x + 40, top, 260, 36);
    nextB.setBounds(x + 306, top, 34, 36);
    loadB.setBounds(x + 356, top, 76, 36);
    saveB.setBounds(x + 438, top, 76, 36);
    irB.setBounds(x + 520, top, 96, 36);
    playB.setBounds(W - BEZEL - 18 - 150, top - 2, 150, 44);
    bpmK.setBounds(W - BEZEL - 18 - 150 - 170, BEZEL + 2, 78, 64);
    volK.setBounds(W - BEZEL - 18 - 150 - 88, BEZEL + 2, 78, 64);
    // beat section
    const int bx = BEZEL + 28, bw = 512;
    grid.setBounds(bx, 116, bw, 420);
    for (int i = 0; i < 8; i++) pageB[i].setBounds(bx + StepGrid::NAME_W + StepGrid::METER_W + 10 + i * 40, 546, 34, 28);
    int kx = bx + 40;
    for (auto* k : { &lenK, &swingK, &grooveK, &accentK }) {
        k->setBounds(kx, 600, 90, 96);
        kx += 110;
    }
    // right side
    const int rx = BEZEL + 590;
    voiceTab.setBounds(rx, 80, 120, 34);
    fxTab.setBounds(rx + 128, 80, 120, 34);
    panel.setBounds(rx, 124, W - rx - BEZEL - 16, H - 124 - BEZEL - 10);
}

void FmDmEditor::selectVoice(int v) {
    voice = v;
    grid.selVoice = v;
    grid.repaint();
    if (pageShown == 0) panel.setSections(voiceSections(v), proc.model.base);
}

void FmDmEditor::showPage(int p) {
    pageShown = p;
    voiceTab.setToggleState(p == 0, juce::dontSendNotification);
    fxTab.setToggleState(p == 1, juce::dontSendNotification);
    panel.setSections(p == 0 ? voiceSections(voice) : fxSections(), proc.model.base);
}

void FmDmEditor::refreshAll() {
    panel.refresh(proc.model.base);
    for (auto* k : { &bpmK, &volK, &lenK, &swingK, &grooveK, &accentK }) k->setValue(proc.model.base[k->param()]);
    presetB.setButtonText(proc.model.name.isEmpty() ? "untitled" : proc.model.name);
    const int len = (int) proc.model.base[NV + M::patLen];
    const int pages = juce::jlimit(1, 8, (len + 15) / 16);
    if (grid.page >= pages) grid.page = 0;
    for (int i = 0; i < 8; i++) {
        pageB[i].setEnabled(i < pages);
        pageB[i].setToggleState(i == grid.page, juce::dontSendNotification);
    }
    grid.repaint();
    repaint();
}

void FmDmEditor::timerCallback() {
    if (proc.modelVersion.load() != seenVersion) {
        seenVersion = proc.modelVersion.load();
        refreshAll();
    }
    const bool pl = proc.playing.load();
    playB.setToggleState(pl, juce::dontSendNotification);
    playB.setButtonText(pl ? "stop" : "play");
    const int st = proc.curStep.load();
    // follow the playhead across pages
    if (pl && st >= 0 && st / 16 != grid.page && (int) proc.model.base[NV + M::patLen] > 16) {
        grid.page = st / 16;
        refreshAll();
    }
    grid.playStep = pl ? st : -1;
    grid.repaint();
    // the host's tempo shows on the bpm knob
    const float hb = proc.hostBpm.load();
    if (proc.hostSync.load() && hb > 0) bpmK.setValue(hb);
    static bool lastSync = false;
    if (lastSync != proc.hostSync.load()) {
        lastSync = proc.hostSync.load();
        repaint();
    }
}

// ---- presets
void FmDmEditor::presetMenu() {
    juce::PopupMenu m;
    const auto& all = factoryPresets();
    for (int i = 0; i < all.size(); i++) m.addItem(i + 1, all[i]["name"].toString(), true, all[i]["name"].toString() == proc.model.name);
    m.showMenuAsync(juce::PopupMenu::Options().withTargetComponent(&presetB), [this](int r) {
        if (r > 0) {
            presetIdx = r - 1;
            proc.setCurrentProgram(presetIdx);
        }
    });
}

void FmDmEditor::stepPreset(int d) {
    const int n = factoryPresets().size();
    if (!n) return;
    presetIdx = (presetIdx + d + n) % n;
    proc.setCurrentProgram(presetIdx);
}

void FmDmEditor::savePresetFile() {
    chooser = std::make_unique<juce::FileChooser>("save preset", juce::File::getSpecialLocation(juce::File::userDocumentsDirectory)
                                                                     .getChildFile(proc.model.name.isEmpty() ? "fm-dm" : proc.model.name)
                                                                     .withFileExtension("json"),
                                                  "*.json");
    chooser->launchAsync(juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles, [this](const juce::FileChooser& fc) {
        auto f = fc.getResult();
        if (f == juce::File()) return;
        const auto name = f.getFileNameWithoutExtension();
        proc.model.name = name;
        // the browser's import reads { presets: [...] }
        auto* o = new juce::DynamicObject();
        o->setProperty("app", "fm dm");
        o->setProperty("v", 1);
        o->setProperty("presets", juce::Array<juce::var> { proc.model.toPreset(name) });
        f.replaceWithText(juce::JSON::toString(juce::var(o), true));
        refreshAll();
    });
}

void FmDmEditor::loadPresetFile() {
    chooser = std::make_unique<juce::FileChooser>("load preset", juce::File::getSpecialLocation(juce::File::userDocumentsDirectory), "*.json");
    chooser->launchAsync(juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles, [this](const juce::FileChooser& fc) {
        const auto f = fc.getResult();
        if (!f.existsAsFile()) return;
        const auto list = presetsInJson(juce::JSON::parse(f));
        if (list.isEmpty()) return;
        if (list.size() == 1) {
            proc.loadPreset(list[0]);
            return;
        }
        // a bundle (the browser's export): pick one
        auto shared = std::make_shared<juce::Array<juce::var>>(list);
        juce::PopupMenu m;
        for (int i = 0; i < list.size(); i++) m.addItem(i + 1, list[i]["name"].toString());
        m.showMenuAsync(juce::PopupMenu::Options().withTargetComponent(&loadB), [this, shared](int r) {
            if (r > 0) proc.loadPreset((*shared)[r - 1]);
        });
    });
}

} // namespace fmdm
