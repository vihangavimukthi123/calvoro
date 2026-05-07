const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Get category images (Public)
router.get('/', async (req, res) => {
    try {
        const raw = await db.getSiteSetting('category_images');
        let data = {};
        if (raw) {
            try {
                data = JSON.parse(raw);
            } catch (e) {
                // Ignore parse error
            }
        }
        res.json(data);
    } catch (error) {
        console.error('Error fetching category images:', error);
        res.status(500).json({ error: 'Failed to fetch category images' });
    }
});

// Update category images (Admin)
router.post('/admin', requireAdmin, async (req, res) => {
    try {
        const payload = req.body;
        await db.setSiteSetting('category_images', JSON.stringify({
            men: payload.men || '',
            women: payload.women || '',
            gifts: payload.gifts || '',
            unisex: payload.unisex || ''
        }));
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving category images:', error);
        res.status(500).json({ error: 'Failed to save category images' });
    }
});

module.exports = router;
