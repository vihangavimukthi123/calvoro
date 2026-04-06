const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Public: get theme settings (for frontend to apply)
router.get('/', async (req, res) => {
    try {
        const settings = await db.getThemeSettings();
        res.json(settings);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch theme settings' });
    }
});

// Admin: update one or multiple theme settings
router.put('/admin', requireAdmin, async (req, res) => {
    try {
        const obj = req.body;
        if (typeof obj !== 'object') return res.status(400).json({ error: 'body must be object' });
        for (const [k, v] of Object.entries(obj)) await db.setThemeSetting(k, v == null ? '' : String(v));
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update theme' });
    }
});

module.exports = router;
