const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const folders = ['', 'products'];

const patterns = [
    {
        // Support: Remove Delivery
        regex: /<a href="#"[^>]*>Delivery<\/a>\s*/gi,
        replacement: ''
    },
    {
        // My Account: Remove Track Order
        regex: /<a href="#"[^>]*>Track Order<\/a>\s*/gi,
        replacement: ''
    },
    {
        // Connect: Remove Track Your Order button (active or commented)
        regex: /(<!--\s*)?<button[^>]*>TRACK YOUR ORDER<\/button>(\s*-->)?\s*/gi,
        replacement: ''
    },
    {
        // Connect: Remove Follow us below hint
        regex: /(<!--\s*)?<p class="footer-connect-hint">Follow us below<\/p>(\s*-->)?\s*/gi,
        replacement: ''
    },
    {
        // Social: Remove Follow us below title
        regex: /<div class="footer-social__title">Follow us below<\/div>\s*/gi,
        replacement: ''
    },
    {
        // Made in Sri Lanka (Trust Section): Replace SVG with PNG icon
        // More robust: search for the whole article or just the svg before the title
        regex: /<div class="footer-trust__icon"[^>]*>[\s\S]*?<svg[\s\S]*?<\/svg>[\s\S]*?<\/div>(\s*<h3 class="footer-trust__title">Made in Sri Lanka<\/h3>)/gi,
        replacement: '<div class="footer-trust__icon" aria-hidden="true">\n                    <img src="images/made-in-sri-lanka-icon.png" alt="Made in Sri Lanka" width="100" height="100">\n                </div>$1'
    },
    {
        // Footer Emblem (Bottom): Replace large lion with 100x100 PNG
        regex: /<div class="footer-emblem">\s*<img src="images\/lion-sri-lanka\.png"[^>]*>\s*<\/div>/gi,
        replacement: '<div class="footer-emblem">\n                    <img src="images/made-in-sri-lanka-icon.png" alt="Made in Sri Lanka" width="100" height="100" loading="lazy" decoding="async" class="footer-emblem__img">\n                </div>'
    },
    {
        // Size Guide: Ensure it's there (User mentioned adding it, but it seems to be in the footer already. 
        // Wait, user said: "add the option in admin panel when a product give the option to add a for that size guide")
        // That's a separate task.
    }
];

// Special handle for index.html emblem size if already changed to made-in-sri-lanka-icon.png but maybe wrong size or similar
patterns.push({
    regex: /<img src="images\/made-in-sri-lanka-icon\.png" alt="Made in Sri Lanka" width="180" height="180"/gi,
    replacement: '<img src="images/made-in-sri-lanka-icon.png" alt="Made in Sri Lanka" width="100" height="100"'
});

folders.forEach(folder => {
    const dir = path.join(rootDir, folder);
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    files.forEach(file => {
        if (file.endsWith('.html')) {
            const filePath = path.join(dir, file);
            let content = fs.readFileSync(filePath, 'utf8');
            let changed = false;

            patterns.forEach(p => {
                if (!p.regex) return;
                const newContent = content.replace(p.regex, p.replacement);
                if (newContent !== content) {
                    content = newContent;
                    changed = true;
                }
            });

            if (changed) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Updated: ${folder}/${file}`);
            }
        }
    });
});
