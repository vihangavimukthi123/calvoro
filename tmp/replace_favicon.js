const fs = require('fs');
const path = 'd:\\calvorooooo';
const files = fs.readdirSync(path).filter(f => f.endsWith('.html'));
files.forEach(f => {
    let fp = path + '\\' + f;
    let content = fs.readFileSync(fp, 'utf8');
    let modified = false;
    if (content.includes('href="/logo.png"')) {
        content = content.replace(/<link rel="icon" type="image\/png" href="\/logo\.png">/g, '<link rel="icon" type="image/png" href="/favicon.png">');
        content = content.replace(/<link rel="apple-touch-icon" href="\/logo\.png">/g, '<link rel="apple-touch-icon" href="/favicon.png">');
        modified = true;
    }
    if (modified) {
        fs.writeFileSync(fp, content, 'utf8');
    }
});
