// Windows: starts the standalone app with WebView2's remote debugging on, then checks the editor page
// really built its UI (and prints any page errors). CI runs this after the Windows build.
//   node plugin/test/webview-check.mjs <fm-dm.exe> <screenshot.png>
// Needs playwright-core (it only connects to the app's web view, no browser download).
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const [exe, shot] = process.argv.slice(2);
const port = 9333;
const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  stdio: 'inherit',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
try {
  let browser;
  for (let i = 0; i < 60 && !browser; i++) {
    await sleep(1000);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null);
  }
  if (!browser) throw new Error('no WebView2 debug port: the editor never opened a web view');
  let page;
  for (let i = 0; i < 30 && !page; i++) {
    page = browser.contexts().flatMap((c) => c.pages())[0];
    if (!page) await sleep(1000);
  }
  if (!page) throw new Error('no page in the web view');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  page.on('console', (m) => console.log(`[page ${m.type()}] ${m.text()}`));
  console.log('page url:', page.url());
  const report = async (label) => {
    const r = await page.evaluate(() => ({
      href: location.href,
      header: document.getElementById('hdr')?.children.length ?? -1,
      perf: document.getElementById('perf')?.children.length ?? -1,
      tabs: document.getElementById('tabs')?.children.length ?? -1,
      juce: !!(window.__JUCE__ && window.__JUCE__.backend),
      err: window.__fmdmErr || null,
    }));
    console.log(label, JSON.stringify(r));
    return r;
  };
  await sleep(3000);
  let r = await report('first load:');
  // reload with the listeners attached, so errors thrown while the page starts are caught too
  await page.reload();
  await sleep(5000);
  r = await report('after reload:');
  if (errors.length) console.log('page errors:\n' + errors.join('\n---\n'));
  await page.screenshot({ path: shot }).catch((e) => console.log('screenshot failed:', e.message));
  ok = r.header > 0 && r.perf > 0 && r.tabs > 0 && !errors.length;
  await browser.close().catch(() => {});
} catch (e) {
  console.log('check failed:', e.message);
}
app.kill();
console.log(ok ? 'UI built in WebView2' : 'UI did NOT build in WebView2');
process.exit(ok ? 0 : 1);
