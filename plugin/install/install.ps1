# fm/dm plugin installer for Windows (PowerShell):
#   irm https://github.com/johnnyhawk02/fm-drum-machine/releases/download/plugin-latest/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$base = 'https://github.com/johnnyhawk02/fm-drum-machine/releases/download/plugin-latest'
$tmp = Join-Path $env:TEMP ('fm-dm-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host 'fm/dm: downloading for Windows...'
  Invoke-WebRequest "$base/fm-dm-windows.zip" -OutFile "$tmp\fm-dm.zip" -UseBasicParsing
  Expand-Archive "$tmp\fm-dm.zip" -DestinationPath "$tmp\x"
  # per-user folders, no admin needed (hosts scan %LOCALAPPDATA%\Programs\Common\VST3)
  $vst3 = Join-Path $env:LOCALAPPDATA 'Programs\Common\VST3'
  $app = Join-Path $env:LOCALAPPDATA 'Programs\fm-dm'
  New-Item -ItemType Directory -Force -Path $vst3, $app | Out-Null
  Remove-Item -Recurse -Force (Join-Path $vst3 'fm-dm.vst3') -ErrorAction SilentlyContinue
  Copy-Item -Recurse "$tmp\x\fm-dm.vst3" $vst3
  Copy-Item "$tmp\x\fm-dm.exe" $app -Force
  # a Start menu shortcut for the standalone app
  $lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'fm-dm.lnk'
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  $s.TargetPath = Join-Path $app 'fm-dm.exe'
  $s.Save()
  Write-Host "fm/dm installed: VST3 in $vst3, the app in $app (and the Start menu)."
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
