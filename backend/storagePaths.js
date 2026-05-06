const path = require('path');
const fs = require('fs');

const MEDIA_ROOT = process.env.MEDIA_ROOT
    ? path.resolve(process.env.MEDIA_ROOT)
    : (process.env.RAILWAY_VOLUME_MOUNT_PATH
        ? path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH)
        : path.resolve(__dirname));

const UPLOAD_DIR = path.resolve(MEDIA_ROOT, 'uploads');
const VIDEO_DIR = path.resolve(MEDIA_ROOT, 'storage', 'videos');

[UPLOAD_DIR, VIDEO_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

module.exports = { MEDIA_ROOT, UPLOAD_DIR, VIDEO_DIR };
