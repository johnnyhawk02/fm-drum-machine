# fm/dm quickstart

fm/dm (frequency modulated drum machine) is a free six-voice FM drum machine. Every sound is made from scratch with 4-operator FM, a pitch envelope, click, noise, filter and crush. It runs in your browser and as a VST3 / AU plug-in and standalone app.

- **Web:** open [fm-dm.johnnyhawk.org](https://fm-dm.johnnyhawk.org) and press **▶ play** (or space).
- **Plug-in:** install with one line (below), then load **fm-dm** as an instrument in your DAW.

## Install the plug-in

Run the same line again any time to update.

**macOS** (Terminal):

```sh
curl -fsSL https://github.com/johnnyhawk02/fm-drum-machine/releases/download/plugin-latest/install.sh | sh
```

VST3 and AU go to `~/Library/Audio/Plug-Ins`, the app to `~/Applications`. Apple Silicon and Intel, macOS 10.13+.

**Windows** (PowerShell, no admin needed):

```powershell
irm https://github.com/johnnyhawk02/fm-drum-machine/releases/download/plugin-latest/install.ps1 | iex
```

The VST3 goes to `%LOCALAPPDATA%\Programs\Common\VST3` (add it to your DAW's VST3 paths if needed), and the app is added to the Start menu. Windows 10/11, 64-bit.

**Linux** (terminal):

```sh
curl -fsSL https://github.com/johnnyhawk02/fm-drum-machine/releases/download/plugin-latest/install.sh | sh
```

The VST3 goes to `~/.vst3`, the app to `~/.local/bin/fm-dm`. Needs WebKitGTK 4.1 (`sudo apt install libwebkit2gtk-4.1-0`). 64-bit x86.

Prefer a manual install? Download `fm-dm-mac.zip`, `fm-dm-windows.zip` or `fm-dm-linux.zip` from the [plugin-latest release](https://github.com/johnnyhawk02/fm-drum-machine/releases/tag/plugin-latest). On a Mac, clear the quarantine flag after unzipping:

```sh
xattr -dr com.apple.quarantine ~/Library/Audio/Plug-Ins/VST3/fm-dm.vst3 ~/Library/Audio/Plug-Ins/Components/fm-dm.component
```

Restart your DAW or rescan plug-ins afterwards.

### In your DAW

- The plug-in has no play or rec buttons. Your DAW's transport starts and stops it, and it follows the DAW tempo. Record its output on a track as usual. In the standalone app, press space to play and stop.
- MIDI notes play the drums. General MIDI drum notes work (36 kick, 38 snare, 42 closed hat, 46 open hat, 49 cymbal, toms for drum 2 and drum 3). From MIDI note 60 (C3 in most DAWs) upwards, each run of six notes plays the six drums in order.
- Presets move freely between the web version and the plug-in.

## The screen

The header holds **randomise ▾**, **options**, **?** (help) and, on the web, **▶ play** and **● rec**. Along the left are 24 **perf** knobs and the mutes. The pages on the right are:

| page | what it does |
|---|---|
| **beat** | Pattern generator: tempo, genre (techno, house, electro, breaks, dnb, hiphop, garage, minimal), beat, energy, fills and length. **feel · rush** sets swing, accent and drum rolls near the end of every n bars. **density** per drum, then the **step grid** (click toggles, shift-click accents, right-click a hat step for open). |
| **voice** | Pick a drum (kick, drum 2, drum 3, snare, cymbal, hihat). Click to audition, shift-click the hat for open. Tabs: **tone/fm** (algorithm, tune, FM, operators A to D), **shape** (pitch env, click, amp, crush), **filter** (filter, noise, bursts), **mod** (LFO, velocity, wobble, sends). |
| **fx** | **echo** (sync, ping-pong), **reverb** with an algorithmic or impulse response mode (30 factory IRs, including recorded spaces from Voxengo, or **load your own ir**), and the **distortion** and **ring mod** send buses. |
| **xmod** | A 6×6 patchbay where each drum's base operator modulates the others. Randomise or clear it. |
| **mix** | A strip per drum: sends, pan, level fader with meter, mute and solo. |
| **mstr** | Kick sidechain duck, master distortion, compressor with gain-reduction meter, output. |
| **prst** | Presets: built-ins plus your own (saved in the browser under two-word names). Favourite, search, save new or save over, export and import. Loading while playing waits for the next bar. |

## Knobs and motion

- Drag up and down (shift for fine), scroll, or click a knob and use the arrow keys. Double-click resets.
- Right-click any knob or fader to assign it to a perf knob, give it a step sequencer, MIDI-learn it, or reset it.
- **Step sequencer:** click a knob, then paint steps in the strip under perf. Length 2 to 64, slew, speed (a 16th up to 8 bars a step), depth, shapes, and slide or env mode. Sequencers follow the swing.

## Randomise

Open **randomise ▾**: **everything**, **kit**, **alter**, **pattern**, **xmod**, **random fx**, **alter fx** and **motion** (puts step sequences on a few random knobs), plus **undo**.

- Drag a button up or down to set its depth. Hold it for its ranges and chances.
- **go mental** runs every randomiser at full depth with wild ranges.
- Right-click (or long-press on touch) a drum on the **voice** page to randomise just that drum.
- In **options**: randomise on next bar, wild ranges (not drum-safe), and auto-level drums after randomise. Options also sets the screen colour.

## Keyboard shortcuts

| key | action |
|---|---|
| space | play / stop (web and standalone app) |
| 1 to 8 | everything, kit, alter, pattern, xmod, random fx, alter fx, motion |
| u | undo |
| z x c v b n | mute each drum |
| a s d f g h | mute each drum's echo send |
| q w e r t y | mute each drum's reverb send |
| [ and ] | previous / next page |
| shift+1 to 6 | open a drum on the voice page |
| o | presets |
| / | search presets |
| ↑ ↓ (on prst) | previous / next preset |
| arrows | turn the selected knob |
| ? | help |
| esc | close a dialog or menu |

Mutes act on notes, so tails ring on.

## MIDI

CC 1 to 24 drive the perf knobs on any channel. CC 25 to 28 set the selected sequencer's length, slew, speed and depth. Right-click a knob and pick **midi learn** to map your own CC.

## Recording (web)

**● rec** records a WAV, either free-running or an exact loop of 1 to 128 bars starting on the next bar.

---

fm/dm is MIT licensed. Source: [github.com/johnnyhawk02/fm-drum-machine](https://github.com/johnnyhawk02/fm-drum-machine).
