// Writes the page as plain ASCII for the plugin's web view: characters past 127 become \uXXXX in the
// script (valid anywhere in JS: strings, templates, regexes, identifiers) and \XXXXXX in the CSS.
//   node plugin/tools/ascii-page.mjs <in.html> <out.html>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const [src, dst] = process.argv.slice(2);
const s = readFileSync(src, 'utf8');
const s0 = s.indexOf('<style>'), s1 = s.indexOf('</style>');
let out = '';
let i = 0;
for (const ch of s) {
  const c = ch.codePointAt(0);
  if (c < 128) out += ch;
  else if (i > s0 && i < s1) out += '\\' + c.toString(16).padStart(6, '0');
  else for (let k = 0; k < ch.length; k++) out += '\\u' + ch.charCodeAt(k).toString(16).padStart(4, '0');
  i += ch.length;
}
mkdirSync(dirname(dst), { recursive: true });
writeFileSync(dst, out);
