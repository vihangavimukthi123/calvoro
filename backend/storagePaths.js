const path = require('path');
const fs = require('fs');

const VIDEO_DIR = path.resolve(__dirname, 'storage', 'videos');
if (!fs.existsSync(VIDEO_DIR)) {
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

module.exports = { VIDEO_DIR };
