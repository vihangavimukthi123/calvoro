const fs = require('fs');
const path = require('path');

function replaceIconsInDir(dir, isSubDir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file === 'products') {
                replaceIconsInDir(fullPath, true);
            }
        } else if (fullPath.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            const prefix = isSubDir ? '../' : '';

            // Free Shipping
            const freeShippingRegex = /<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1\.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"\/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"\/><\/svg>/g;
            if (freeShippingRegex.test(content)) {
                content = content.replace(freeShippingRegex, '<img src="' + prefix + 'free-removebg-preview.png" alt="Free Shipping">');
                modified = true;
            }

            // Free Returns
            const freeReturnsRegex = /<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1\.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"\/><path d="M3\.51 15a9 9 0 1 0 \.49-3"\/><\/svg>/g;
            if (freeReturnsRegex.test(content)) {
                content = content.replace(freeReturnsRegex, '<img src="' + prefix + 'returns1-removebg-preview.png" alt="Free Returns">');
                modified = true;
            }

            // Secure Checkout
            const secureCheckoutRegex = /<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1\.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"\/><line x1="1" y1="10" x2="23" y2="10"\/><\/svg>/g;
            if (secureCheckoutRegex.test(content)) {
                content = content.replace(secureCheckoutRegex, '<img src="' + prefix + 'secure-removebg-preview.png" alt="Secure Checkout">');
                modified = true;
            }

            // Also clean up any trust-icon-img classes that we previously added to images to standardize
            content = content.replace(/class="trust-icon-img"/g, '');
            // Update any img tags that don't have the correct path prefix
            const imgRegex = new RegExp('<img src="((?:\\.\\.\\/)?)(free|returns1|secure)-removebg-preview\\.png"', 'g');
            content = content.replace(imgRegex, (match, currentPrefix, name) => {
                if (currentPrefix !== prefix) {
                    modified = true;
                    return '<img src="' + prefix + name + '-removebg-preview.png"';
                }
                return match;
            });

            if (modified) {
                fs.writeFileSync(fullPath, content);
                console.log('Updated', fullPath);
            }
        }
    }
}

replaceIconsInDir(__dirname, false);
