const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

router.get('/', requireAdmin, async (req, res) => {
    try {
        const data = await db.getPromoTicker();
        res.json(data);
    } catch (e) {
        res.json({ lines: [], durationSeconds: 22 });
    }
});

router.post('/', requireAdmin, async (req, res) => {
    try {
        const { lines, durationSeconds } = req.body;
        const result = await db.setPromoTicker({ lines, durationSeconds });
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save' });
    }
});

module.exports = router;
