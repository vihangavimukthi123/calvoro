import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) {
      let t = fs.readFileSync(p, 'utf8');
      const o = t;
      const prod = p.includes(`${path.sep}products${path.sep}`);
      const ex = prod ? '../return-exchange-policy.html' : 'return-exchange-policy.html';
      const add = `<a href="${ex}">Return &amp; Exchange Policy</a>`;
      t = t.replace(
        /(<a href="(?:\.\.\/)?terms-and-conditions\.html">Terms(?: &amp;| &) Conditions<\/a>)\s*(<\/div>)/g,
        (m, a, b) => a + add + b
      );
      if (t !== o) {
        fs.writeFileSync(p, t);
        console.log('legal+', path.relative(ROOT, p));
      }
    }
  }
}
walk(ROOT);
