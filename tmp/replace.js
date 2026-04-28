const fs = require('fs');
const path = 'd:\\calvorooooo';
const files = fs.readdirSync(path).filter(f => f.endsWith('.html'));
files.forEach(f => {
    let fp = path + '\\' + f;
    let content = fs.readFileSync(fp, 'utf8');
    if (content.includes('âœ•')) {
        fs.writeFileSync(fp, content.replace(/âœ•/g, '&times;'), 'utf8');
    }
});
