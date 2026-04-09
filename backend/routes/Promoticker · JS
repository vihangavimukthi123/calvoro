const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// GET /api/admin/promo-ticker
router.get('/', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.pool.query(
            "SELECT setting_value FROM site_settings WHERE setting_key = 'promo_ticker' LIMIT 1"
        );
        if (rows && rows[0]) {
            try {
                const data = JSON.parse(rows[0].setting_value);
                return res.json(data);
            } catch (_) {}
        }
        res.json({ lines: [], durationSeconds: 22 });
    } catch (e) {
        res.json({ lines: [], durationSeconds: 22 });
    }
});

// POST /api/admin/promo-ticker
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { lines, durationSeconds } = req.body;
        const value = JSON.stringify({
            lines: Array.isArray(lines) ? lines : [],
            durationSeconds: Number(durationSeconds) || 22
        });
        await db.pool.query(
            "INSERT INTO site_settings (setting_key, setting_value) VALUES ('promo_ticker', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
            [value, value]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save' });
    }
});

module.exports = router;
