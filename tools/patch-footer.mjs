import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const TRUST = `    <section class="footer-trust" aria-label="Why shop with Calvoro">
        <div class="container footer-trust__inner">
            <article class="footer-trust__item">
                <div class="footer-trust__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h8V5H3v12h3"/><path d="M2 17h2"/><path d="M14 17V9h3l3 3v5"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
                </div>
                <h3 class="footer-trust__title">Shipping</h3>
                <p class="footer-trust__text">Standard shipping (Estimated 3-5 days)</p>
            </article>
            <article class="footer-trust__item">
                <div class="footer-trust__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <h3 class="footer-trust__title">Payments</h3>
                <p class="footer-trust__text">Payment is 100% secure</p>
            </article>
            <article class="footer-trust__item">
                <div class="footer-trust__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </div>
                <h3 class="footer-trust__title">Easy Returns</h3>
                <p class="footer-trust__text">30 days to change your mind!</p>
            </article>
            <article class="footer-trust__item">
                <div class="footer-trust__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7"/><path d="M4 15s4-4 8-4 8 4 8 4"/><path d="M6 10s3-3 6-3 6 3 6 3"/></svg>
                </div>
                <h3 class="footer-trust__title">Made in Sri Lanka</h3>
                <p class="footer-trust__text">Sustainably Sourced</p>
            </article>
        </div>
    </section>

`;

function bar(img) {
  return `        <div class="footer-bar">
            <div class="container footer-bar__row">
                <div class="footer-social">
                    <a href="https://www.instagram.com/calvoro_sl?igsh=MWphc2ozMzV6bnA5Ng==" class="footer-social__link" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                        <img src="${img}social-instagram.png" alt="" class="footer-social__img" width="32" height="32" loading="lazy" decoding="async">
                    </a>
                    <a href="https://www.facebook.com/share/1N3FAQwgDZ/?mibextid=wwXIfr" class="footer-social__link" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                        <img src="${img}social-facebook.png" alt="" class="footer-social__img footer-social__img--fb" width="32" height="32" loading="lazy" decoding="async">
                    </a>
                    <a href="https://www.tiktok.com/@calvoro.clothing?_r=1&amp;_t=ZS-946fy7SrlVB" class="footer-social__link" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
                        <img src="${img}social-tiktok.png" alt="" class="footer-social__img" width="32" height="32" loading="lazy" decoding="async">
                    </a>
                </div>
                <div class="footer-emblem">
                    <img src="${img}lion-sri-lanka.png" alt="Sri Lankan lion emblem" width="180" height="180" loading="lazy" decoding="async" class="footer-emblem__img">
                </div>
            </div>
        </div>
`;
}

function bottom(priv) {
  return `© 2026 | CALVORO | All Rights Reserved | <a href="${priv}privacy-policy.html">Privacy Policy</a> | <a href="${priv}terms-and-conditions.html">Terms &amp; Conditions</a> | <a href="${priv}return-exchange-policy.html">Return &amp; Exchange Policy</a> | <a href="${priv}return-refund-policy.html">Return &amp; Refund Policy</a>`;
}

function patchFile(fp, products) {
  let t = fs.readFileSync(fp, 'utf8');
  const base = path.basename(fp);
  if (base === 'index.html' || base === 'return-exchange-policy.html') return;

  const priv = products ? '../' : '';
  const img = products ? '../images/' : 'images/';

  if (!t.includes('footer-trust')) {
    if (t.includes('\n    <footer>')) t = t.replace('\n    <footer>', '\n' + TRUST + '\n    <footer>', 1);
    else if (t.includes('\n<footer>')) t = t.replace('\n<footer>', '\n' + TRUST + '<footer>', 1);
  }

  const emblemOld =
    `        <div class="footer-emblem">
            <img src="${img}sri-lanka-lion-emblem.jpeg" alt="Sri Lankan lion emblem" width="160" height="160" loading="lazy" decoding="async" class="footer-emblem__img">
        </div>`;
  if (t.includes(emblemOld)) t = t.replace(emblemOld, bar(img), 1);
  else if (!t.includes('class="footer-bar"') && t.includes('footer-emblem')) {
    t = t.replace(/<div class="footer-emblem">[\s\S]*?<\/div>\s*(?=<div class="footer-bottom">)/, bar(img).trim() + '\n', 1);
  }

  t = t.replace(
    /<div class="social-links">\s*<a href="#">FB<\/a>\s*<a href="#">IG<\/a>\s*<a href="#">TW<\/a>\s*<\/div>/g,
    '<p class="footer-connect-hint">Follow us below</p>'
  );

  if (!t.includes('return-exchange-policy.html')) {
    const fb = t.indexOf('<div class="footer-bottom">');
    if (fb >= 0) {
      const p0 = t.indexOf('<p>', fb);
      const p1 = t.indexOf('</p>', p0);
      if (p0 >= 0 && p1 > p0) {
        t = t.slice(0, p0 + 3) + bottom(priv) + t.slice(p1);
      }
    }
  }

  fs.writeFileSync(fp, t, 'utf8');
  console.log('ok', path.relative(ROOT, fp));
}

const rootHtml = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
for (const f of rootHtml) patchFile(path.join(ROOT, f), false);
const prodDir = path.join(ROOT, 'products');
if (fs.existsSync(prodDir)) {
  for (const f of fs.readdirSync(prodDir).filter((x) => x.endsWith('.html'))) {
    patchFile(path.join(prodDir, f), true);
  }
}
