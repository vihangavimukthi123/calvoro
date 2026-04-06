/**
 * Restore 4 footer-trust items across all Calvoro HTML pages.
 * Detects whether the file is in a subfolder (products/) and uses ../images/ accordingly.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// All HTML files to update (relative to ROOT)
const HTML_FILES = [
    'index.html',
    'men.html',
    'women.html',
    'gifts.html',
    'accessories.html',
    'cart.html',
    'checkout.html',
    'account.html',
    'login.html',
    'register.html',
    'faq.html',
    'privacy-policy.html',
    'terms-and-conditions.html',
    'return-exchange-policy.html',
    'return-refund-policy.html',
    'track.html',
    'wishlist.html',
    'products/product.html',
    'products/product1.html',
    'products/product2.html',
];

function buildTrustSection(imgPrefix) {
    return `    <section class="footer-trust" aria-label="Why shop with Calvoro">
        <div class="container footer-trust__inner">
            <article class="footer-trust__item">
                <div class="footer-trust__icon" aria-hidden="true">
                    <img src="${imgPrefix}images/made-in-sri-lanka-icon.png" alt="Made in Sri Lanka" width="80" height="80">
                </div>
                <h3 class="footer-trust__title">Made in Sri Lanka</h3>
                <p class="footer-trust__text">Sustainably Sourced</p>
            </article>
            <article class="footer-trust__item">
                <div class="footer-trust__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                </div>
                <h3 class="footer-trust__title">Free Shipping</h3>
                <p class="footer-trust__text">On orders over LKR 15,000</p>
            </article>
            <article class="footer-trust__item">
                <div class="footer-trust__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/></svg>
                </div>
                <h3 class="footer-trust__title">Free Returns</h3>
                <p class="footer-trust__text">Easy exchanges &amp; returns</p>
            </article>
            <article class="footer-trust__item">
                <div class="footer-trust__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                </div>
                <h3 class="footer-trust__title">Secure Checkout</h3>
                <p class="footer-trust__text">100% protected payments</p>
            </article>
        </div>
    </section>`;
}

// Regex: match the entire <section class="footer-trust"…</section> block
const TRUST_SECTION_RE = /<section\s+class="footer-trust"[\s\S]*?<\/section>/;

let updated = 0;
let skipped = 0;

for (const relPath of HTML_FILES) {
    const filePath = path.join(ROOT, relPath);
    if (!fs.existsSync(filePath)) {
        console.log(`[SKIP - not found] ${relPath}`);
        skipped++;
        continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Determine image prefix based on subfolder depth
    const isSubfolder = relPath.includes('/');
    const imgPrefix = isSubfolder ? '../' : '';

    const replacement = buildTrustSection(imgPrefix);

    if (TRUST_SECTION_RE.test(content)) {
        const newContent = content.replace(TRUST_SECTION_RE, replacement);
        if (newContent !== content) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`[UPDATED] ${relPath}`);
            updated++;
        } else {
            console.log(`[NO CHANGE] ${relPath}`);
            skipped++;
        }
    } else {
        console.log(`[SKIP - no trust section] ${relPath}`);
        skipped++;
    }
}

console.log(`\nDone. ${updated} files updated, ${skipped} skipped.`);
