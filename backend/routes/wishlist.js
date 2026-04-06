/**
 * Wishlist API - User-specific wishlist
 * POST /add - Add product to wishlist (requires login)
 * GET / - Get current user's wishlist products
 * DELETE /:productId - Remove from wishlist (requires login)
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/wishlist and GET /api/wishlist/my-wishlist - Get wishlist for logged-in user (returns [] if not logged in)
async function getWishlistHandler(req, res) {
    try {
        const userId = req.session?.user?.id || null;
        if (!userId) {
            return res.json([]);
        }
        const products = await db.getWishlistProducts(userId);
        res.json(products);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get wishlist' });
    }
}
router.get('/', getWishlistHandler);
router.get('/my-wishlist', getWishlistHandler);

// POST /api/wishlist/add - Add product to wishlist (requires login)
router.post('/add', async (req, res) => {
    try {
        const userId = req.session?.user?.id || null;
        if (!userId) {
            return res.status(401).json({ error: 'Please log in to add to wishlist' });
        }
        const { product_id } = req.body;
        if (!product_id) {
            return res.status(400).json({ error: 'product_id is required' });
        }
        await db.addToWishlist(userId, parseInt(product_id, 10));
        const products = await db.getWishlistProducts(userId);
        res.json({ success: true, products });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add to wishlist' });
    }
});

// DELETE /api/wishlist/:productId - Remove from wishlist (requires login)
router.delete('/:productId', async (req, res) => {
    try {
        const userId = req.session?.user?.id || null;
        if (!userId) {
            return res.status(401).json({ error: 'Please log in to manage wishlist' });
        }
        const productId = parseInt(req.params.productId, 10);
        await db.removeFromWishlist(userId, productId);
        const products = await db.getWishlistProducts(userId);
        res.json({ success: true, products });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to remove from wishlist' });
    }
});

module.exports = router;
