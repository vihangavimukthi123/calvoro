const express = require('express');
const router = express.Router();
const db = require('../db');

// Delivery options for checkout
router.get('/options', async (req, res) => {
    try {
        const {
            country_code = 'LK',
            province = '',
            city = '',
            cart_total = 0,
            cart_weight = 0,
            cod_selected = 'false'
        } = req.query;

        if (!db.getDeliveryOptions) {
            return res.json([]);
        }

        const options = await db.getDeliveryOptions({
            country_code,
            province,
            city,
            cart_total,
            cart_weight,
            cod_selected: cod_selected === 'true' || cod_selected === '1'
        });

        res.json(options);
    } catch (e) {
        console.error('delivery/options error:', e);
        res.status(500).json({ error: 'Failed to load delivery options' });
    }
});

// Public tracking by tracking number
router.get('/track/:trackingNumber', async (req, res) => {
    try {
        const tracking = (req.params.trackingNumber || '').trim();
        if (!tracking) return res.status(400).json({ error: 'Tracking number required' });
        if (!db.getOrderByTrackingNumber || !db.getOrderTrackingTimeline) {
            return res.status(404).json({ error: 'Tracking not available' });
        }
        const order = await db.getOrderByTrackingNumber(tracking);
        if (!order) return res.status(404).json({ error: 'Tracking not found' });

        const timeline = await db.getOrderTrackingTimeline(order.id);
        res.json({
            tracking_number: tracking,
            status: order.delivery_status || order.status,
            estimated_delivery_date: order.estimated_delivery_date || null,
            courier_id: order.courier_id || null,
            timeline
        });
    } catch (e) {
        console.error('delivery/track error:', e);
        res.status(500).json({ error: 'Failed to load tracking info' });
    }
});

module.exports = router;

