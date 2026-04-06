/**
 * Seasonal offers & discount engine — public storefront + admin CRUD.
 * Admin paths mirror spec: /api/admin/discount-engine/*
 */
const express = require('express');
const db = require('../db');
const { createRateLimiter } = require('../lib/adminRateLimit');

const router = express.Router();
const publicRouter = express.Router();

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

const adminDiscountLimiter = createRateLimiter({ windowMs: 60_000, max: 200 });

// ============ Public ============
publicRouter.get('/offers/active', async (req, res) => {
    try {
        if (typeof db.getActiveOffersForStorefront !== 'function') {
            return res.json({ campaigns: [], settings: {} });
        }
        const data = await db.getActiveOffersForStorefront();
        res.json(data || { campaigns: [], settings: {} });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to load offers' });
    }
});

publicRouter.get('/price/calculate/:productId', async (req, res) => {
    try {
        const id = parseInt(req.params.productId, 10);
        if (!id) return res.status(400).json({ error: 'Invalid product id' });
        const product = await db.getProductById(id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const coupon = req.query.coupon || req.query.code;
        if (typeof db.enrichSingleProductWithPricing !== 'function') {
            return res.json({ product });
        }
        const enriched = await db.enrichSingleProductWithPricing(product, coupon || null);
        res.json(enriched);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Price calculation failed' });
    }
});

// ============ Admin ============
router.use(requireAdmin);
router.use(adminDiscountLimiter);

router.get('/settings', async (req, res) => {
    try {
        const s = await db.getPricingEngineSettings();
        res.json(s);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

router.put('/settings', async (req, res) => {
    try {
        if (typeof db.updatePricingEngineSettings !== 'function') {
            return res.status(500).json({ error: 'Not available' });
        }
        const saved = await db.updatePricingEngineSettings(req.body || {});
        res.json(saved);
    } catch (e) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

router.get('/campaigns', async (req, res) => {
    try {
        const rows = typeof db.listSeasonalCampaignsAdmin === 'function' ? await db.listSeasonalCampaignsAdmin() : [];
        res.json({ campaigns: rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to list campaigns' });
    }
});

router.post('/campaigns', async (req, res) => {
    try {
        const id = await db.createSeasonalCampaign(req.body || {});
        res.status(201).json({ id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to create campaign' });
    }
});

router.put('/campaigns/:id', async (req, res) => {
    try {
        const r = await db.updateSeasonalCampaign(parseInt(req.params.id, 10), req.body || {});
        res.json(r);
    } catch (e) {
        res.status(500).json({ error: 'Failed to update campaign' });
    }
});

router.delete('/campaigns/:id', async (req, res) => {
    try {
        const r = await db.deleteSeasonalCampaign(parseInt(req.params.id, 10));
        res.json(r);
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete' });
    }
});

router.get('/rules', async (req, res) => {
    try {
        const rows = typeof db.listDiscountRulesAdmin === 'function' ? await db.listDiscountRulesAdmin() : [];
        res.json({ rules: rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to list rules' });
    }
});

router.post('/rules', async (req, res) => {
    try {
        const id = await db.createDiscountRule(req.body || {});
        res.status(201).json({ id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to create rule' });
    }
});

router.put('/rules/:id', async (req, res) => {
    try {
        const r = await db.updateDiscountRule(parseInt(req.params.id, 10), req.body || {});
        res.json(r);
    } catch (e) {
        res.status(500).json({ error: 'Failed to update rule' });
    }
});

router.delete('/rules/:id', async (req, res) => {
    try {
        const r = await db.deleteDiscountRule(parseInt(req.params.id, 10));
        res.json(r);
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete' });
    }
});

router.get('/coupons', async (req, res) => {
    try {
        const rows = typeof db.listCouponsAdmin === 'function' ? await db.listCouponsAdmin() : [];
        res.json({ coupons: rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to list coupons' });
    }
});

router.post('/coupons', async (req, res) => {
    try {
        const id = await db.createCoupon(req.body || {});
        res.status(201).json({ id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to create coupon' });
    }
});

router.get('/analytics/summary', async (req, res) => {
    try {
        const s = await db.getDiscountAnalyticsSummary();
        res.json(s);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});

module.exports = { router, publicRouter };
