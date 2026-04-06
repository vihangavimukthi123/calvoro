const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { VIDEO_DIR } = require('../storagePaths');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Check if it's a video file
        const ext = (path.extname(file.originalname) || '').toLowerCase();
        if (ext.match(/^\.(mp4|webm|mov)$/)) {
            cb(null, VIDEO_DIR);
        } else {
            cb(null, UPLOAD_DIR);
        }
    },
    filename: (req, file, cb) => {
        const ext = (path.extname(file.originalname) || '').toLowerCase() || '.jpg';
        const isVideo = ext.match(/^\.(mp4|webm|mov)$/);
        const safe = isVideo ? ext : (ext.match(/^\.(jpe?g|png|gif|webp)$/) ? ext : '.jpg');
        const prefix = isVideo ? 'video-' : 'product-';
        cb(null, prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + safe);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 80 * 1024 * 1024 }, // 80MB (videos need more than images)
    fileFilter: (req, file, cb) => {
        const ext = (path.extname(file.originalname) || '').toLowerCase();
        const isImage = ext.match(/^\.(jpe?g|png|gif|webp)$/);
        const isVideo = ext.match(/^\.(mp4|webm|mov)$/);
        if (isImage || isVideo) {
            cb(null, true);
        } else {
            cb(new Error('Only image (jpg, png, gif, webp) and video (mp4, webm, mov) files are allowed'));
        }
    }
});

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

router.post('/', requireAdmin, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File too large. Max 80MB for videos.' });
            }
            if (err.message && err.message.includes('allowed')) {
                return res.status(400).json({ error: err.message });
            }
            return res.status(400).json({ error: err.message || 'Upload failed' });
        }
        next();
    });
}, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.file.path;
    if (!fs.existsSync(filePath)) {
        console.error('Upload: file missing at', filePath, '| VIDEO_DIR=', VIDEO_DIR);
        return res.status(500).json({ error: 'File was not saved. Check server storage path.' });
    }
    const ext = (path.extname(req.file.filename) || '').toLowerCase();
    const isVideo = ext.match(/^\.(mp4|webm|mov)$/);
    const basePath = isVideo ? '/storage/videos/' : '/uploads/';
    const url = basePath + req.file.filename;
    res.json({
        url,
        type: isVideo ? 'video' : 'image',
        filename: req.file.filename
    });
});

module.exports = router;
