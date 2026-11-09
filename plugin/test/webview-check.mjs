// Windows: starts the standalone app and checks, from the page's own log line (plugin page.log), that
// the editor page built its UI in WebView2 with no script errors. Prints the log. CI runs this after the Windows build.
//   node plugin/test/webview-check.mjs <fm-dm.exe>
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const exe = process.argv[2];
const log = join(process.env.APPDATA, 'fm-dm', 'page.log');
rmSync(log, { force: true });
const app = spawn(exe, [], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 25000));
console.log('app still running:', app.exitCode === null);
app.kill();
const text = existsSync(log) ? readFileSync(log, 'utf8') : '';
console.log('page.log:\n' + (text || '(missing)'));
const m = /header=(\d+) perf=(\d+) tabs=(\d+) errors=(\w+)/.exec(text);
const ok = !!m && +m[1] > 0 && +m[2] > 0 && +m[3] > 0 && m[4] === 'no';
console.log(ok ? 'UI built in WebView2' : 'UI did NOT build in WebView2');
process.exit(ok ? 0 : 1);
