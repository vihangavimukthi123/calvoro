const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Get all carousel slides
router.get('/', async (req, res) => {
    try {
        if (typeof db.getCarouselSlides === 'function') {
            const slides = await db.getCarouselSlides();
            return res.json(Array.isArray(slides) ? slides.filter(s => s.is_active !== false) : []);
        }
        res.json([]);
    } catch (error) {
        console.error('Error fetching carousel:', error);
        res.status(500).json({ error: 'Failed to fetch carousel' });
    }
});

router.get('/admin', requireAdmin, async (req, res) => {
    try {
        const slides = typeof db.getCarouselSlides === 'function' ? await db.getCarouselSlides() : [];
        res.json({ slides: Array.isArray(slides) ? slides : [] });
    } catch (error) {
        console.error('Error fetching admin carousel:', error);
        res.status(500).json({ error: 'Failed to fetch carousel settings' });
    }
});

async function saveCarousel(req, res) {
    try {
        const slides = req.body && req.body.slides;
        if (typeof db.setCarouselSlides !== 'function') {
            return res.status(500).json({ error: 'Carousel storage not available' });
        }
        const saved = await db.setCarouselSlides({ slides });
        res.json({ slides: Array.isArray(saved) ? saved : [] });
    } catch (error) {
        console.error('Error saving carousel:', error);
        res.status(500).json({ error: 'Failed to save carousel settings' });
    }
}

router.post('/admin', requireAdmin, saveCarousel);
router.put('/admin', requireAdmin, saveCarousel);

module.exports = router;
