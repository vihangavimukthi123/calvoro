const express = require('express');
const router = express.Router();
const db = require('../db');

// Get cart items (user-specific; returns empty if not logged in)
// GET / and GET /my-cart both return current user's cart
async function getCartHandler(req, res) {
    try {
        const userId = req.session?.user?.id || null;
        const sessionId = req.sessionID;

        const items = await db.getCartItems(userId, sessionId);

        // Calculate totals
        const subtotal = items.reduce((sum, item) => {
            const price = item.is_on_sale ? item.sale_price : item.base_price;
            return sum + (price * item.quantity);
        }, 0);

        const shipping = subtotal >= 15000 ? 0 : 500;
        const total = subtotal + shipping;

        res.json({
            items,
            subtotal,
            shipping,
            total,
            itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get cart items' });
    }
}

router.get('/', getCartHandler);
router.get('/my-cart', getCartHandler);

// Add item to cart (user-specific; requires login)
router.post('/add', async (req, res) => {
    try {
        const { product_id, product_variant_id, quantity, color, size } = req.body;
        const userId = req.session?.user?.id || null;

        if (!userId) {
            return res.status(401).json({ error: 'Please log in to add to cart' });
        }
        if (!product_id || !quantity) {
            return res.status(400).json({ error: 'Missing required fields: product_id, quantity' });
        }
        const sessionId = req.sessionID;
        await db.addToCart(userId, sessionId, product_id, product_variant_id, quantity, color || '', size || '');

        // Get updated cart
        const items = await db.getCartItems(userId, sessionId);
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        res.json({
            success: true,
            message: 'Item added to cart',
            itemCount
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add item to cart' });
    }
});

// Update cart item quantity (user-scoped)
router.put('/:id', async (req, res) => {
    try {
        const { quantity } = req.body;
        const userId = req.session?.user?.id || null;

        if (!quantity || quantity < 1) {
            return res.status(400).json({ error: 'Invalid quantity' });
        }
        if (!userId) return res.status(401).json({ error: 'Please log in to update cart' });

        await db.updateCartItem(userId, req.params.id, quantity);

        res.json({ success: true, message: 'Cart updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update cart' });
    }
});

// Remove item from cart (user-scoped)
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.session?.user?.id || null;
        if (!userId) return res.status(401).json({ error: 'Please log in to manage cart' });
        await db.removeFromCart(userId, req.params.id);

        // Get updated cart
        const sessionId = req.sessionID;
        const items = await db.getCartItems(userId, sessionId);
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        res.json({
            success: true,
            message: 'Item removed from cart',
            itemCount
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to remove item from cart' });
    }
});

// Clear cart
router.delete('/', async (req, res) => {
    try {
        const userId = req.session?.user?.id || null;
        const sessionId = req.sessionID;

        await db.clearCart(userId, sessionId);

        res.json({ success: true, message: 'Cart cleared' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to clear cart' });
    }
});

module.exports = router;
