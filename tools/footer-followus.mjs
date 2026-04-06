import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function patchHtml(fp) {
  let t = fs.readFileSync(fp, 'utf8');
  const o = t;

  // If already upgraded, skip
  if (t.includes('footer-social__title') && t.includes('footer-social__icons')) return false;

  // Upgrade:
  // <div class="footer-social"> ...links... </div>
  // ->
  // <div class="footer-social">
  //   <div class="footer-social__title">Follow us below</div>
  //   <div class="footer-social__icons"> ...links... </div>
  // </div>
  t = t.replace(
    /<div class="footer-social">([\s\S]*?)<\/div>\s*<div class="footer-emblem">/m,
    (m, inner) => {
      const trimmed = inner.trim();
      // Inner should be a bunch of <a>...</a> links; wrap them
      return (
        '<div class="footer-social footer-social--stack">\n' +
        '                    <div class="footer-social__title">Follow us below</div>\n' +
        '                    <div class="footer-social__icons">\n' +
        trimmed.replace(/^/gm, '                        ') +
        '\n' +
        '                    </div>\n' +
        '                </div>\n' +
        '                <div class="footer-emblem">'
      );
    }
  );

  if (t !== o) {
    fs.writeFileSync(fp, t, 'utf8');
    return true;
  }
  return false;
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir)) {
    const p = path.join(dir, ent);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (ent.endsWith('.html')) {
      const changed = patchHtml(p);
      if (changed) console.log('updated', path.relative(ROOT, p));
    }
  }
}

walk(ROOT);

