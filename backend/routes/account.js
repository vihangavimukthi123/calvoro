const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const { requireUser } = require('../middleware/requireUser');

// All routes require authenticated user
router.use(requireUser);

// ---- My Data (consolidated: profile, cart, wishlist, orders) ----
router.get('/my-data', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [profile, addresses, paymentMethods, settings, wishlist, orders] = await Promise.all([
            db.getProfile(userId),
            db.getAddresses(userId),
            db.getPaymentMethods(userId),
            db.getSettings(userId),
            db.getWishlistProducts(userId),
            db.getOrdersByUserId(userId)
        ]);
        const items = await db.getCartItems(userId, req.sessionID);
        const subtotal = items.reduce((sum, item) => {
            const price = item.is_on_sale ? item.sale_price : item.base_price;
            return sum + (price * item.quantity);
        }, 0);
        const cart = {
            items,
            subtotal,
            shipping: subtotal >= 15000 ? 0 : 500,
            total: subtotal + (subtotal >= 15000 ? 0 : 500),
            itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
        };
        res.json({
            user: { id: userId, email: req.session.user.email, first_name: req.session.user.first_name, last_name: req.session.user.last_name },
            profile,
            addresses,
            paymentMethods,
            settings,
            cart,
            wishlist,
            orders
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get account data' });
    }
});

// ---- Profile ----
router.get('/profile', async (req, res) => {
    try {
        const profile = await db.getProfile(req.session.user.id);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        res.json(profile);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

router.put('/profile', async (req, res) => {
    try {
        const { first_name, last_name, phone, address, city, profile_picture_url } = req.body;
        const data = {};
        if (first_name !== undefined) data.first_name = String(first_name || '').trim().slice(0, 100);
        if (last_name !== undefined) data.last_name = String(last_name || '').trim().slice(0, 100);
        if (phone !== undefined) data.phone = String(phone || '').trim().slice(0, 50);
        if (address !== undefined) data.address = String(address || '').trim().slice(0, 500);
        if (city !== undefined) data.city = String(city || '').trim().slice(0, 100);
        if (profile_picture_url !== undefined) data.profile_picture_url = String(profile_picture_url || '').trim().slice(0, 500);

        await db.updateProfile(req.session.user.id, data);
        const updated = await db.getProfile(req.session.user.id);
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ---- Change Password ----
router.put('/password', async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }
        if (new_password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        const user = await db.getUserByEmail(req.session.user.email);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const valid = await bcrypt.compare(current_password, user.password_hash);
        if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

        const password_hash = await bcrypt.hash(new_password, 10);
        await db.updatePassword(req.session.user.id, password_hash);
        res.json({ success: true, message: 'Password updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update password' });
    }
});

// ---- Addresses ----
router.get('/addresses', async (req, res) => {
    try {
        const addresses = await db.getAddresses(req.session.user.id);
        res.json(addresses);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get addresses' });
    }
});

router.post('/addresses', async (req, res) => {
    try {
        const { label, full_name, phone, address_line1, address_line2, city, postal_code, is_default } = req.body;
        if (!full_name || !address_line1 || !city) {
            return res.status(400).json({ error: 'Full name, address line 1, and city are required' });
        }
        const data = {
            label: (label || '').trim().slice(0, 100),
            full_name: String(full_name).trim().slice(0, 255),
            phone: (phone || '').trim().slice(0, 50),
            address_line1: String(address_line1).trim().slice(0, 255),
            address_line2: (address_line2 || '').trim().slice(0, 255),
            city: String(city).trim().slice(0, 100),
            postal_code: (postal_code || '').trim().slice(0, 20),
            is_default: !!is_default
        };
        const result = await db.addAddress(req.session.user.id, data);
        const addresses = await db.getAddresses(req.session.user.id);
        res.status(201).json({ id: result.id, addresses });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add address' });
    }
});

router.put('/addresses/:id', async (req, res) => {
    try {
        const { label, full_name, phone, address_line1, address_line2, city, postal_code, is_default } = req.body;
        const data = {};
        if (label !== undefined) data.label = String(label || '').trim().slice(0, 100);
        if (full_name !== undefined) data.full_name = String(full_name).trim().slice(0, 255);
        if (phone !== undefined) data.phone = String(phone || '').trim().slice(0, 50);
        if (address_line1 !== undefined) data.address_line1 = String(address_line1).trim().slice(0, 255);
        if (address_line2 !== undefined) data.address_line2 = String(address_line2 || '').trim().slice(0, 255);
        if (city !== undefined) data.city = String(city).trim().slice(0, 100);
        if (postal_code !== undefined) data.postal_code = String(postal_code || '').trim().slice(0, 20);
        if (is_default !== undefined) data.is_default = !!is_default;

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        await db.updateAddress(req.session.user.id, parseInt(req.params.id, 10), data);
        const addresses = await db.getAddresses(req.session.user.id);
        res.json({ addresses });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update address' });
    }
});

router.delete('/addresses/:id', async (req, res) => {
    try {
        const result = await db.deleteAddress(req.session.user.id, parseInt(req.params.id, 10));
        if (result.changes === 0) return res.status(404).json({ error: 'Address not found' });
        const addresses = await db.getAddresses(req.session.user.id);
        res.json({ addresses });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete address' });
    }
});

router.post('/addresses/:id/default', async (req, res) => {
    try {
        const result = await db.setDefaultAddress(req.session.user.id, parseInt(req.params.id, 10));
        if (result.changes === 0) return res.status(404).json({ error: 'Address not found' });
        const addresses = await db.getAddresses(req.session.user.id);
        res.json({ addresses });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to set default address' });
    }
});

// ---- Payment Methods (masked only - never store full card numbers) ----
router.get('/payment-methods', async (req, res) => {
    try {
        const methods = await db.getPaymentMethods(req.session.user.id);
        res.json(methods);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get payment methods' });
    }
});

router.post('/payment-methods', async (req, res) => {
    try {
        const { card_brand, last_four, exp_month, exp_year, is_default } = req.body;
        if (!last_four || !/^\d{4}$/.test(String(last_four))) {
            return res.status(400).json({ error: 'Valid last 4 digits of card are required' });
        }
        const data = {
            card_brand: (card_brand || 'Card').trim().slice(0, 50),
            last_four: String(last_four).slice(-4),
            exp_month: exp_month ? parseInt(exp_month, 10) : null,
            exp_year: exp_year ? parseInt(exp_year, 10) : null,
            is_default: !!is_default
        };
        const result = await db.addPaymentMethod(req.session.user.id, data);
        if (result.error) return res.status(400).json({ error: result.error });
        const methods = await db.getPaymentMethods(req.session.user.id);
        res.status(201).json({ id: result.id, methods });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add payment method' });
    }
});

router.delete('/payment-methods/:id', async (req, res) => {
    try {
        const result = await db.deletePaymentMethod(req.session.user.id, parseInt(req.params.id, 10));
        if (result.changes === 0) return res.status(404).json({ error: 'Payment method not found' });
        const methods = await db.getPaymentMethods(req.session.user.id);
        res.json({ methods });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete payment method' });
    }
});

// ---- Settings ----
router.get('/settings', async (req, res) => {
    try {
        const settings = await db.getSettings(req.session.user.id);
        res.json(settings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const { notifications_email, notifications_sms, marketing_emails } = req.body;
        const data = {};
        if (notifications_email !== undefined) data.notifications_email = !!notifications_email;
        if (notifications_sms !== undefined) data.notifications_sms = !!notifications_sms;
        if (marketing_emails !== undefined) data.marketing_emails = !!marketing_emails;
        await db.updateSettings(req.session.user.id, data);
        const settings = await db.getSettings(req.session.user.id);
        res.json(settings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ---- Wishlist ----
router.get('/wishlist', async (req, res) => {
    try {
        const products = await db.getWishlistProducts(req.session.user.id);
        res.json(products);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get wishlist' });
    }
});

// ---- Cart (delegate to cart API; returns cart for current user) ----
router.get('/cart', async (req, res) => {
    try {
        const items = await db.getCartItems(req.session.user.id, req.sessionID);
        const subtotal = items.reduce((sum, item) => {
            const price = item.is_on_sale ? item.sale_price : item.base_price;
            return sum + (price * item.quantity);
        }, 0);
        const shipping = subtotal >= 15000 ? 0 : 500;
        res.json({
            items,
            subtotal,
            shipping,
            total: subtotal + shipping,
            itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get cart' });
    }
});

// ---- Orders ----
router.get('/orders', async (req, res) => {
    try {
        const orders = await db.getOrdersByUserId(req.session.user.id);
        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get orders' });
    }
});

module.exports = router;
