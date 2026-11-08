#!/bin/sh
# fm/dm plugin installer for macOS and Linux:
#   curl -fsSL https://github.com/johnnyhawk02/fm-drum-machine/releases/download/plugin-latest/install.sh | sh
set -e
BASE="https://github.com/johnnyhawk02/fm-drum-machine/releases/download/plugin-latest"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

case "$(uname -s)" in
  Darwin)
    echo "fm/dm: downloading for macOS..."
    curl -fsSL "$BASE/fm-dm-mac.zip" -o "$tmp/fm-dm.zip"
    unzip -q "$tmp/fm-dm.zip" -d "$tmp/x"
    mkdir -p "$HOME/Library/Audio/Plug-Ins/VST3" "$HOME/Library/Audio/Plug-Ins/Components" "$HOME/Applications"
    rm -rf "$HOME/Library/Audio/Plug-Ins/VST3/fm-dm.vst3" "$HOME/Library/Audio/Plug-Ins/Components/fm-dm.component" "$HOME/Applications/fm-dm.app"
    cp -R "$tmp/x/fm-dm.vst3" "$HOME/Library/Audio/Plug-Ins/VST3/"
    cp -R "$tmp/x/fm-dm.component" "$HOME/Library/Audio/Plug-Ins/Components/"
    cp -R "$tmp/x/fm-dm.app" "$HOME/Applications/"
    xattr -dr com.apple.quarantine "$HOME/Library/Audio/Plug-Ins/VST3/fm-dm.vst3" "$HOME/Library/Audio/Plug-Ins/Components/fm-dm.component" "$HOME/Applications/fm-dm.app" 2>/dev/null || true
    killall -9 AudioComponentRegistrar 2>/dev/null || true # so hosts see the new AU
    echo "fm/dm installed: VST3 and AU in ~/Library/Audio/Plug-Ins, the app in ~/Applications."
    ;;
  Linux)
    echo "fm/dm: downloading for Linux..."
    curl -fsSL "$BASE/fm-dm-linux.zip" -o "$tmp/fm-dm.zip"
    unzip -q "$tmp/fm-dm.zip" -d "$tmp/x"
    mkdir -p "$HOME/.vst3" "$HOME/.local/bin"
    rm -rf "$HOME/.vst3/fm-dm.vst3"
    cp -R "$tmp/x/fm-dm.vst3" "$HOME/.vst3/"
    cp "$tmp/x/fm-dm" "$HOME/.local/bin/fm-dm"
    chmod +x "$HOME/.local/bin/fm-dm"
    echo "fm/dm installed: VST3 in ~/.vst3, the app as ~/.local/bin/fm-dm."
    echo "It needs WebKitGTK 4.1 (Debian/Ubuntu: sudo apt install libwebkit2gtk-4.1-0)."
    ;;
  *)
    echo "fm/dm: this installer is for macOS and Linux. On Windows use install.ps1." >&2
    exit 1
    ;;
esac
