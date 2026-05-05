const fs = require('fs');
const path = require('path');

function replaceInDir(dir, isSubDir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file === 'products' || file === 'js') {
                replaceInDir(fullPath, true);
            }
        } else if (fullPath.endsWith('.html') || fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            // HTML Promos
            if (content.includes('LKR 10,000')) {
                content = content.replace(/LKR 10,000/g, 'LKR 10,000');
                modified = true;
            }
            if (content.includes('10,000')) {
                 // catch any other variations
                 content = content.replace(/10,000/g, '10,000');
                 modified = true;
            }

            // JS code thresholds
            if (content.includes('FREE_SHIPPING_THRESHOLD = 10000')) {
                content = content.replace(/FREE_SHIPPING_THRESHOLD = 10000/g, 'FREE_SHIPPING_THRESHOLD = 10000');
                modified = true;
            }
            if (content.includes('>= 10000')) {
                content = content.replace(/>= 10000/g, '>= 10000');
                modified = true;
            }

            if (modified) {
                fs.writeFileSync(fullPath, content);
                console.log('Updated', fullPath);
            }
        }
    }
}

replaceInDir(__dirname, false);
