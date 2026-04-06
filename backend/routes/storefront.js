const express = require('express');
const router = express.Router();
const db = require('../db');

// Single endpoint for frontend to bootstrap: banners, categories, cms, theme, featured/trending products
router.get('/', async (req, res) => {
    try {
        const [banners, categories, cms, theme, products] = await Promise.all([
            db.getBanners(true),
            db.getAllCategories ? db.getAllCategories() : Promise.resolve([]),
            db.getCmsContent(),
            db.getThemeSettings(),
            db.getAllProducts ? db.getAllProducts() : Promise.resolve([])
        ]);
        const featured = Array.isArray(products) ? products.filter(p => p.featured) : [];
        const trending = Array.isArray(products) && products.some(p => p.trending) ? products.filter(p => p.trending) : featured.slice(0, 8);
        res.json({
            banners,
            categories,
            cms,
            theme,
            featured: featured.slice(0, 12),
            trending: trending.slice(0, 8)
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch storefront data' });
    }
});

module.exports = router;
