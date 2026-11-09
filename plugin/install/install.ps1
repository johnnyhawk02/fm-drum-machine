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

  # the app: per user, no admin
  $app = Join-Path $env:LOCALAPPDATA 'Programs\fm-dm'
  New-Item -ItemType Directory -Force -Path $app | Out-Null
  Copy-Item "$tmp\x\fm-dm.exe" $app -Force
  $lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'fm-dm.lnk'
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  $s.TargetPath = Join-Path $app 'fm-dm.exe'
  $s.Save()

  # the VST3: the standard folder every host scans (FL Studio, Ableton, Cubase, Reaper...).
  # It's under Program Files, so Windows asks for admin once.
  $vst3 = Join-Path $env:CommonProgramFiles 'VST3'
  $src = "$tmp\x\fm-dm.vst3"
  $copy = "New-Item -ItemType Directory -Force -Path '$vst3' | Out-Null; " +
          "Remove-Item -Recurse -Force '$vst3\fm-dm.vst3' -ErrorAction SilentlyContinue; " +
          "Copy-Item -Recurse '$src' '$vst3'"
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($admin) {
    Invoke-Expression $copy
  } else {
    Write-Host 'fm/dm: Windows will ask for admin to put the VST3 in the shared VST3 folder...'
    $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes("`$ErrorActionPreference='Stop'; $copy"))
    $p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile', '-EncodedCommand', $enc
    if ($p.ExitCode -ne 0) { throw 'fm/dm: copying the VST3 needs admin (cancelled or failed).' }
  }
  if (-not (Test-Path "$vst3\fm-dm.vst3\Contents\x86_64-win\fm-dm.vst3")) { throw "fm/dm: the VST3 didn't land in $vst3." }

  # older installers used a per-user folder that FL Studio doesn't scan; remove that copy
  Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA 'Programs\Common\VST3\fm-dm.vst3') -ErrorAction SilentlyContinue

  Write-Host "fm/dm installed: VST3 in $vst3, the app in $app (and the Start menu)."
  Write-Host 'In your DAW, rescan plug-ins (FL Studio: Options > Manage plugins > Find more plugins).'
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
