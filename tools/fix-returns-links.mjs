import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (f.endsWith('.html')) {
      let t = fs.readFileSync(p, 'utf8');
      const o = t;
      t = t.replace(
        /href="return-refund-policy\.html">Returns<\/a>/g,
        'href="return-exchange-policy.html">Returns &amp; Exchange</a>'
      );
      t = t.replace(
        /href="\.\.\/return-refund-policy\.html">Returns<\/a>/g,
        'href="../return-exchange-policy.html">Returns &amp; Exchange</a>'
      );
      if (t !== o) {
        fs.writeFileSync(p, t);
        console.log('updated', path.relative(ROOT, p));
      }
    }
  }
}
walk(ROOT);
