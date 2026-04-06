const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const db = require('../db');

const publicRouter = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (_req, file, cb) {
        const ext = (path.extname(file.originalname) || '').toLowerCase();
        const safe = ext.match(/^\.(jpe?g|png|gif|webp)$/) ? ext : '.jpg';
        cb(null, 'promo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + safe);
    }
});

const uploadImage = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (_req, file, cb) {
        const ext = (path.extname(file.originalname) || '').toLowerCase();
        if (ext.match(/^\.(jpe?g|png|gif|webp)$/)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG, GIF, or WebP images are allowed'));
        }
    }
});

function wrapUpload(mw) {
    return function (req, res, next) {
        mw(req, res, function (err) {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ error: 'Image too large (max 5MB)' });
                }
                return res.status(400).json({ error: err.message || 'Upload failed' });
            }
            next();
        });
    };
}

/** Multer middleware for single promo image (field name: image) */
const uploadPromoImage = wrapUpload(uploadImage.single('image'));

function parseBool(v) {
    if (v === true || v === '1' || v === 'true' || v === 'on') return true;
    if (v === false || v === '0' || v === 'false') return false;
    return undefined;
}

// GET /api/promotions/active
publicRouter.get('/active', async (req, res) => {
    try {
        if (typeof db.getActivePromotion !== 'function') {
            return res.json(null);
        }
        const row = await db.getActivePromotion();
        if (!row || !String(row.image_path || '').trim()) {
            return res.json(null);
        }
        res.json({
            id: row.id,
            image_path: String(row.image_path).trim(),
            redirect_link: String(row.redirect_link || '').trim()
        });
    } catch (e) {
        console.error('promotions/active', e);
        res.status(500).json({ error: 'Failed to load promotion' });
    }
});

// ---- Admin handlers (registered explicitly on app in server.js to avoid nested-router 404s) ----

async function adminList(req, res) {
    try {
        if (typeof db.getAllPromotions !== 'function') {
            return res.json({ promotions: [] });
        }
        const promotions = await db.getAllPromotions();
        res.json({ promotions: Array.isArray(promotions) ? promotions : [] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to list promotions' });
    }
}

async function adminCreate(req, res) {
    try {
        if (typeof db.createPromotion !== 'function') {
            return res.status(500).json({ error: 'Promotions storage not available' });
        }
        const redirect_link = req.body && req.body.redirect_link != null ? String(req.body.redirect_link) : '';
        const b = parseBool(req.body && req.body.is_active);
        const is_active = b === undefined ? false : b;
        let image_path = '';
        if (req.file) {
            image_path = '/uploads/' + req.file.filename;
        }
        const created = await db.createPromotion({ image_path, redirect_link, is_active });
        if (!created) {
            return res.status(500).json({ error: 'Failed to create promotion' });
        }
        res.status(201).json(created);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to create promotion' });
    }
}

async function adminUpdate(req, res) {
    try {
        if (typeof db.updatePromotion !== 'function') {
            return res.status(500).json({ error: 'Promotions storage not available' });
        }
        const id = parseInt(req.params.id, 10);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }
        const patch = {};
        if (req.body && req.body.redirect_link !== undefined) {
            patch.redirect_link = String(req.body.redirect_link);
        }
        if (req.body && req.body.is_active !== undefined) {
            patch.is_active = !!req.body.is_active;
        }
        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        const updated = await db.updatePromotion(id, patch);
        if (!updated) {
            return res.status(404).json({ error: 'Promotion not found' });
        }
        res.json(updated);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update promotion' });
    }
}

async function adminReplaceImage(req, res) {
    try {
        if (typeof db.updatePromotion !== 'function') {
            return res.status(500).json({ error: 'Promotions storage not available' });
        }
        const id = parseInt(req.params.id, 10);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }
        const image_path = '/uploads/' + req.file.filename;
        const updated = await db.updatePromotion(id, { image_path });
        if (!updated) {
            return res.status(404).json({ error: 'Promotion not found' });
        }
        res.json(updated);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to replace image' });
    }
}

async function adminDelete(req, res) {
    try {
        if (typeof db.deletePromotion !== 'function') {
            return res.status(500).json({ error: 'Promotions storage not available' });
        }
        const id = parseInt(req.params.id, 10);
        if (!id) {
            return res.status(400).json({ error: 'Invalid id' });
        }
        const r = await db.deletePromotion(id);
        if (!r || !r.changes) {
            return res.status(404).json({ error: 'Promotion not found' });
        }
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete promotion' });
    }
}

module.exports = {
    publicRouter,
    uploadPromoImage,
    adminList,
    adminCreate,
    adminUpdate,
    adminReplaceImage,
    adminDelete
};
