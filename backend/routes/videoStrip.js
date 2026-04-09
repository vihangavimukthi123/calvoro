const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Video upload storage
let VIDEO_DIR;
try {
    VIDEO_DIR = require('../storagePaths').VIDEO_DIR;
} catch (_) {
    VIDEO_DIR = path.join(__dirname, '..', 'uploads');
}

if (!fs.existsSync(VIDEO_DIR)) {
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, file, cb) => {
        const ext = (path.extname(file.originalname) || '').toLowerCase();
        cb(null, ext.match(/^\.(mp4|webm|mov)$/) ? VIDEO_DIR : path.join(__dirname, '..', 'uploads'));
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

// GET /api/admin/video-strip
router.get('/', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.pool.query(
            "SELECT setting_value FROM site_settings WHERE setting_key = 'video_strip' LIMIT 1"
        );
        if (rows && rows[0]) {
            try {
                const data = JSON.parse(rows[0].setting_value);
                return res.json(data);
            } catch (_) {}
        }
        res.json({ items: [] });
    } catch (e) {
        res.json({ items: [] });
    }
});

// POST /api/admin/video-strip/videos  (labels + optional video file uploads)
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
        // Load existing items first so we keep old video_url if no new file uploaded
        let existingItems = [];
        try {
            const [rows] = await db.pool.query(
                "SELECT setting_value FROM site_settings WHERE setting_key = 'video_strip' LIMIT 1"
            );
            if (rows && rows[0]) {
                const d = JSON.parse(rows[0].setting_value);
                existingItems = Array.isArray(d.items) ? d.items : [];
            }
        } catch (_) {}

        const files = req.files || {};
        const items = [1, 2, 3].map((n, i) => {
            const existing = existingItems[i] || {};
            let video_url = existing.video_url || '';
            const uploaded = files['video' + n] && files['video' + n][0];
            if (uploaded) {
                const ext = (path.extname(uploaded.filename) || '').toLowerCase();
                const isVideo = ext.match(/^\.(mp4|webm|mov)$/);
                video_url = (isVideo ? '/storage/videos/' : '/uploads/') + uploaded.filename;
            }
            return {
                label: String(req.body['label' + n] || '').trim(),
                href: String(req.body['href' + n] || '').trim(),
                video_url
            };
        });

        const value = JSON.stringify({ items });
        await db.pool.query(
            "INSERT INTO site_settings (setting_key, setting_value) VALUES ('video_strip', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
            [value, value]
        );
        res.json({ success: true, items });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save' });
    }
});

module.exports = router;
