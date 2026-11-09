// Windows: starts the standalone app and checks, from the page's own log line (plugin page.log), that
// the editor page built its UI in WebView2 with no script errors. Prints the log and a small screenshot
// (base64 JPEG between markers) of the desktop. CI runs this after the Windows build.
//   node plugin/test/webview-check.mjs <fm-dm.exe>
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const exe = process.argv[2];
const log = join(process.env.APPDATA, 'fm-dm', 'page.log');
rmSync(log, { force: true });
const app = spawn(exe, [], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 25000));
console.log('app still running:', app.exitCode === null);
try {
  const jpg = join(process.env.RUNNER_TEMP || process.env.TEMP, 'shot.jpg');
  execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Windows.Forms,System.Drawing;
    $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $i=New-Object System.Drawing.Bitmap $b.Width,$b.Height;
    [System.Drawing.Graphics]::FromImage($i).CopyFromScreen(0,0,0,0,$i.Size);
    $s=New-Object System.Drawing.Bitmap $i,([int]($b.Width/2)),([int]($b.Height/2)); $s.Save('${jpg}',[System.Drawing.Imaging.ImageFormat]::Jpeg)`], { stdio: 'inherit' });
  console.log('---SHOT-BEGIN---\n' + readFileSync(jpg).toString('base64').replace(/.{1,4000}/g, '$&\n') + '---SHOT-END---');
} catch (e) { console.log('screenshot failed:', e.message); }
app.kill();
const text = existsSync(log) ? readFileSync(log, 'utf8') : '';
console.log('page.log:\n' + (text || '(missing)'));
const m = /header=(\d+) perf=(\d+) tabs=(\d+) errors=(\w+)/.exec(text);
const ok = !!m && +m[1] > 0 && +m[2] > 0 && +m[3] > 0 && m[4] === 'no';
console.log(ok ? 'UI built in WebView2' : 'UI did NOT build in WebView2');
process.exit(ok ? 0 : 1);
