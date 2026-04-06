const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const { sendGiftVoucherEmail } = require('../lib/mailer');

// In-memory rate limit for validate endpoint (prevent brute-force). Key: IP, value: { count, resetAt }
const validateLimit = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 15;

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

function rateLimitValidate(req, res, next) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = validateLimit.get(ip);
    if (!entry) {
        entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
        validateLimit.set(ip, entry);
    }
    if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + RATE_WINDOW_MS;
    }
    entry.count++;
    if (entry.count > RATE_MAX) {
        return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }
    next();
}

/** Generate a random voucher code (e.g. XXXX-XXXX-XXXX). */
function generateVoucherCode() {
    const bytes = crypto.randomBytes(6);
    const hex = bytes.toString('hex').toUpperCase();
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

// POST /api/vouchers/validate — validate code for current cart subtotal (public, rate-limited)
router.post('/validate', rateLimitValidate, async (req, res) => {
    try {
        const { code, subtotal } = req.body;
        const subtotalNum = parseFloat(subtotal);
        if (subtotalNum < 0 || isNaN(subtotalNum)) {
            return res.status(400).json({ error: 'Invalid subtotal' });
        }
        const userId = req.session && req.session.user ? req.session.user.id : null;
        const result = await db.validateVoucherForCart(code || '', subtotalNum, userId);
        if (!result.valid) {
            return res.status(400).json({ valid: false, message: result.message });
        }
        res.json({
            valid: true,
            message: result.message,
            discount: result.discount,
            voucher: result.voucher
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Validation failed' });
    }
});

// ——— Admin-only routes ———

router.get('/', requireAdmin, async (req, res) => {
    try {
        const list = await db.getVouchersForAdmin();
        res.json(list);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/:id', requireAdmin, async (req, res) => {
    try {
        const voucher = await db.getVoucherById(req.params.id);
        if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
        const redemptions = await db.getRedemptionsByVoucherId(voucher.id);
        res.json({ ...voucher, redemptions });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/', requireAdmin, async (req, res) => {
    try {
        const { code, discount_type, discount_value, min_cart_value, expiry_date, usage_limit, use_per_user_limit, is_active } = req.body;
        const finalCode = (code && String(code).trim()) || generateVoucherCode();
        const existing = await db.getVoucherByCode(finalCode);
        if (existing) {
            return res.status(400).json({ error: 'A voucher with this code already exists.' });
        }
        const voucher = {
            code: finalCode.toUpperCase(),
            discount_type: discount_type || 'fixed_amount',
            discount_value: parseFloat(discount_value) || 0,
            min_cart_value: parseFloat(min_cart_value) || 0,
            expiry_date: expiry_date || null,
            usage_limit: usage_limit === '' || usage_limit === undefined ? null : parseInt(usage_limit, 10),
            use_per_user_limit: use_per_user_limit === '' || use_per_user_limit === undefined ? null : parseInt(use_per_user_limit, 10),
            is_active: is_active !== false,
            created_by: req.session.admin ? req.session.admin.id : null
        };
        const result = await db.createVoucher(voucher);
        res.status(201).json({ success: true, id: result.lastInsertRowid, code: voucher.code });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create voucher' });
    }
});

router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const { code, discount_type, discount_value, min_cart_value, expiry_date, usage_limit, use_per_user_limit, is_active } = req.body;
        const data = {};
        if (code !== undefined) data.code = String(code).trim().toUpperCase();
        if (discount_type !== undefined) data.discount_type = discount_type;
        if (discount_value !== undefined) data.discount_value = parseFloat(discount_value);
        if (min_cart_value !== undefined) data.min_cart_value = parseFloat(min_cart_value);
        if (expiry_date !== undefined) data.expiry_date = expiry_date || null;
        if (usage_limit !== undefined) data.usage_limit = usage_limit === '' ? null : parseInt(usage_limit, 10);
        if (use_per_user_limit !== undefined) data.use_per_user_limit = use_per_user_limit === '' ? null : parseInt(use_per_user_limit, 10);
        if (is_active !== undefined) data.is_active = is_active;
        const { changes } = await db.updateVoucher(req.params.id, data);
        res.json({ success: true, changes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update voucher' });
    }
});

router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { changes } = await db.deleteVoucher(req.params.id);
        res.json({ success: true, changes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete voucher' });
    }
});

// POST /api/vouchers/bulk — generate multiple codes (admin)
router.post('/bulk', requireAdmin, async (req, res) => {
    try {
        const { count, discount_type, discount_value, min_cart_value, expiry_date, usage_limit, use_per_user_limit } = req.body;
        const n = Math.min(100, Math.max(1, parseInt(count, 10) || 1));
        const created = [];
        const usedCodes = new Set((await db.getVouchersForAdmin()).map(v => v.code));
        for (let i = 0; i < n; i++) {
            let code = generateVoucherCode();
            while (usedCodes.has(code)) code = generateVoucherCode();
            usedCodes.add(code);
            const voucher = {
                code,
                discount_type: discount_type || 'fixed_amount',
                discount_value: parseFloat(discount_value) || 0,
                min_cart_value: parseFloat(min_cart_value) || 0,
                expiry_date: expiry_date || null,
                usage_limit: usage_limit === '' ? null : parseInt(usage_limit, 10),
                use_per_user_limit: use_per_user_limit === '' ? null : parseInt(use_per_user_limit, 10),
                is_active: true,
                created_by: req.session.admin ? req.session.admin.id : null
            };
            const result = await db.createVoucher(voucher);
            created.push({ id: result.lastInsertRowid, code: voucher.code });
        }
        res.status(201).json({ success: true, created });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Bulk create failed' });
    }
});

// POST /api/vouchers/send-gift — create voucher and send via email (public)
router.post('/send-gift', async (req, res) => {
    try {
        const userId = req.session && req.session.user ? req.session.user.id : null;
        const { amount, recipient_email, message, sender_name } = req.body;
        const amountNum = parseFloat(amount);
        if (!amountNum || amountNum < 500) {
            return res.status(400).json({ error: 'Amount must be at least LKR 500' });
        }
        if (!recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
            return res.status(400).json({ error: 'Valid recipient email is required' });
        }
        const code = generateVoucherCode();
        const existing = await db.getVoucherByCode(code);
        if (existing) {
            return res.status(500).json({ error: 'Code generation conflict. Please try again.' });
        }
        const voucher = {
            code,
            discount_type: 'fixed_amount',
            discount_value: amountNum,
            min_cart_value: 0,
            expiry_date: null,
            usage_limit: 1,
            use_per_user_limit: 1,
            is_active: true,
            created_by: null
        };
        await db.createVoucher(voucher);
        const emailResult = await sendGiftVoucherEmail(
            recipient_email,
            code,
            amountNum,
            message || '',
            sender_name || ''
        );
        if (!emailResult.sent && !emailResult.devCode) {
            return res.status(500).json({ error: 'Voucher created but email failed: ' + (emailResult.error || 'Unknown error') });
        }
        res.status(201).json({
            success: true,
            voucher_code: code,
            amount: amountNum,
            email_sent: emailResult.sent,
            message: emailResult.sent ? 'Gift voucher sent successfully!' : 'Voucher created. Email is not configured on server yet, so recipient did not receive it.'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send gift voucher' });
    }
});

module.exports = router;
