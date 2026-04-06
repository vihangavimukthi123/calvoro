const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireUser } = require('../middleware/requireUser');

// Get recent reviews with product info (public, no auth - for home page)
router.get('/recent', async (req, res) => {
    try {
        const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
        const reviews = await db.getRecentReviewsWithProducts(limit);
        res.json(reviews);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get reviews for a product
router.get('/product/:productId', async (req, res) => {
    try {
        const reviews = await db.getReviewsByProductId(req.params.productId);
        res.json(reviews);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create a review (requires signed-in user)
router.post('/', requireUser, async (req, res) => {
    const { product_id, rating, body } = req.body;
    if (!product_id) {
        return res.status(400).json({ error: 'product_id is required' });
    }
    const user = req.session.user;
    const author_name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Customer';
    try {
        const result = await db.createReview({ product_id, author_name, rating, body });
        res.status(201).json({
            success: true,
            id: result.lastInsertRowid,
            message: 'Review submitted'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to submit review' });
    }
});

module.exports = router;
