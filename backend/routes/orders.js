const express = require('express');
const router = express.Router();
const db = require('../db');
const emailService = require('../services/emailService');

// Middleware to check admin auth
function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// Get all orders (admin only) or current user's orders (customer)
router.get('/', async (req, res) => {
    try {
        if (req.session && req.session.user) {
            const orders = await db.getOrdersByUserId(req.session.user.id);
            return res.json(orders);
        }
        if (req.session && req.session.admin) {
            let orders = await db.getAllOrders();
            const { status } = req.query;
            if (status) orders = orders.filter(o => o.status === status);
            return res.json(orders);
        }
        res.status(401).json({ error: 'Unauthorized' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get single order
router.get('/:id', async (req, res) => {
    try {
        const order = await db.getOrderById(req.params.id);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create order (supports optional voucher_code; discount applied server-side)
router.post('/', async (req, res) => {
    const { customer_name, customer_email, customer_phone, customer_address, items, payment_method, notes, voucher_code, delivery_method_id, shipping_zone_id } = req.body;

    if (!customer_name || !customer_email || !items || items.length === 0) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Calculate subtotal and base shipping (discount applied after)
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let shipping = subtotal >= 15000 ? 0 : 500; // default rule if delivery engine is not configured
    const user_id = req.session && req.session.user ? req.session.user.id : null;

    let voucherDiscount = 0;
    let voucherId = null;
    if (voucher_code && String(voucher_code).trim()) {
        try {
            const validation = await db.validateVoucherForCart(voucher_code, subtotal, user_id);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.message || 'Invalid voucher' });
            }
            voucherDiscount = validation.discount;
            voucherId = validation.voucher && validation.voucher.id;
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Voucher validation failed' });
        }
    }

    const total = Math.max(0, subtotal + shipping - voucherDiscount);
    const order_number = 'ORD-' + Date.now();

    const order = {
        order_number,
        customer_name,
        customer_email,
        customer_phone: customer_phone || '',
        customer_address: customer_address || '',
        user_id,
        items,
        subtotal,
        shipping,
        total,
        status: 'pending',
        payment_method: payment_method || 'COD',
        notes: notes || '',
        voucher_code: voucher_code && voucherDiscount > 0 ? String(voucher_code).trim().toUpperCase() : null,
        voucher_discount: voucherDiscount
    };

    try {
        const result = await db.createOrder(order);
        const orderId = result.lastInsertRowid;
        if (voucherId != null && voucherDiscount > 0) {
            await db.recordRedemption(voucherId, orderId, user_id, voucherDiscount);
        }

        // Send order confirmation email
        try {
            const fullOrder = await db.getOrderById(orderId);
            if (fullOrder) {
                await emailService.sendOrderConfirmationEmail(fullOrder, items);
            }
        } catch (emailErr) {
            console.error('Failed to send order confirmation email:', emailErr);
        }

        res.json({
            success: true,
            id: orderId,
            order_id: orderId,
            order_number,
            message: 'Order created successfully'
        });
    } catch (error) {
        console.error(error);
        const msg = error && error.message ? String(error.message) : '';
        if (msg.includes('Insufficient stock') || msg.includes('Product not found')) {
            return res.status(400).json({ error: msg });
        }
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Update order status (admin only)
router.put('/:id/status', requireAdmin, async (req, res) => {
    const { status } = req.body;

    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        await db.updateOrderStatus(req.params.id, status);

        // Send shipping update email if status is 'completed'
        if (status === 'completed') {
            try {
                const order = await db.getOrderById(req.params.id);
                if (order) {
                    await emailService.queueEmail({
                        type: 'shipping-update',
                        to: order.customer_email,
                        subject: `Great news! Your order #${order.order_number} has shipped!`,
                        templateName: 'shipping-update',
                        data: {
                            username: order.customer_name || 'there',
                            orderNumber: order.order_number,
                            trackUrl: `https://calvoro.com/track.html?id=${order.id}`
                        }
                    });
                }
            } catch (emailErr) {
                console.error('Failed to send shipping update email:', emailErr);
            }
        }

        res.json({ success: true, message: 'Order status updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

/**
 * Update tracking number and notify customer (Admin only)
 */
router.post('/:id/tracking', requireAdmin, async (req, res) => {
    const { tracking_number } = req.body;
    if (!tracking_number) {
        return res.status(400).json({ error: 'Tracking number is required' });
    }

    try {
        const order = await db.getOrderById(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const rawCourier = typeof db.getSiteSetting === 'function' ? await db.getSiteSetting('defaultCourier') : null;
        let courierName = rawCourier || 'Standard Courier';
        try { const p = JSON.parse(rawCourier); if(p && p.name) courierName = p.name; } catch(e) {}

        if (typeof db.updateOrderTracking === 'function') {
            await db.updateOrderTracking(req.params.id, tracking_number, courierName);
        }
        
        // Trigger the tracking email
        try {
            await emailService.queueEmail({
                type: 'order_shipped',
                to: order.customer_email,
                subject: `Your Order #${order.order_number} has shipped!`,
                templateName: 'order-shipped',
                data: {
                    name: order.customer_name || 'there',
                    order_number: order.order_number,
                    tracking_number: tracking_number,
                    courier: courierName
                }
            });
        } catch (emailErr) {
            console.error('Failed to send tracking email:', emailErr);
        }

        res.json({ success: true, message: 'Tracking updated and email sent' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update tracking' });
    }
});


/**
 * Get default courier (Admin only)
 */
router.get('/settings/courier', requireAdmin, async (req, res) => {
    try {
        const rawCourier = typeof db.getSiteSetting === 'function' ? await db.getSiteSetting('defaultCourier') : null;
        let courierName = rawCourier || 'Standard Courier';
        try { 
            const p = JSON.parse(rawCourier); 
            if(p && p.name) courierName = p.name; 
        } catch(e) {}
        res.json({ name: courierName });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch courier setting' });
    }
});

/**
 * Update default courier (Admin only)
 */
router.post('/settings/courier', requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Courier name is required' });

    try {
        if (typeof db.setSiteSetting === 'function') {
            await db.setSiteSetting('defaultCourier', JSON.stringify({ name }));
            res.json({ success: true, message: 'Courier updated successfully' });
        } else {
            res.status(500).json({ error: 'Settings storage not available' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to update courier setting' });
    }
});

module.exports = router;
