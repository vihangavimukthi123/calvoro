const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { VIDEO_DIR, UPLOAD_DIR } = require('../storagePaths');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, file, cb) => {
        const ext = (path.extname(file.originalname) || '').toLowerCase();
        cb(null, ext.match(/^\.(mp4|webm|mov)$/) ? VIDEO_DIR : UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
        const ext = (path.extname(file.originalname) || '').toLowerCase() || '.mp4';
        cb(null, 'videostrip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 80 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = (path.extname(file.originalname) || '').toLowerCase();
        if (ext.match(/^\.(mp4|webm|mov)$/)) return cb(null, true);
        cb(new Error('Only MP4, WebM, or MOV files are allowed'));
    }
});

router.get('/', requireAdmin, async (req, res) => {
    try {
        const items = await db.getVideoStrip();
        res.json({ items });
    } catch (e) {
        res.json({ items: [] });
    }
});

router.post('/videos', requireAdmin, (req, res, next) => {
    upload.fields([
        { name: 'video1', maxCount: 1 },
        { name: 'video2', maxCount: 1 },
        { name: 'video3', maxCount: 1 }
    ])(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
        next();
    });
}, async (req, res) => {
    try {
        let existingItems = [];
        try {
            existingItems = await db.getVideoStrip();
        } catch (_) {}

        const files = req.files || {};
        const items = [1, 2, 3].map((n, i) => {
            const existing = existingItems[i] || {};
            let videoSrc = existing.videoSrc || '';
            const uploaded = files['video' + n] && files['video' + n][0];
            if (uploaded) {
                const ext = (path.extname(uploaded.filename) || '').toLowerCase();
                const isVideo = ext.match(/^\.(mp4|webm|mov)$/);
                videoSrc = (isVideo ? '/storage/videos/' : '/uploads/') + uploaded.filename;
            }
            return {
                label: String(req.body['label' + n] || '').trim(),
                href: String(req.body['href' + n] || '').trim(),
                videoSrc
            };
        });

        await db.setVideoStrip({ items });
        res.json({ success: true, items });
    } catch (e) {
        console.error('Video strip save error:', e.message);
        res.status(500).json({ error: 'Failed to save' });
    }
});

module.exports = router;
