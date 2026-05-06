const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const emailService = require('../services/emailService');

const router = express.Router();

function getBaseUrl(req) {
    const configured = (process.env.PUBLIC_BASE_URL || process.env.BASE_URL || '').trim();
    if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, '');
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] || req.get('host') || '').toString().split(',')[0].trim();
    return host ? `${proto}://${host}` : '';
}

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function cleanName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function cleanEmail(email) {
    return String(email || '').trim().toLowerCase().slice(0, 180);
}

function parseAmountLkr(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return null;
    // LKR — keep it simple: enforce whole rupees
    const whole = Math.round(n);
    if (whole < 100) return null; // min LKR 100
    if (whole > 5000000) return null; // cap
    return whole;
}

const PAYHERE_MODE = process.env.PAYHERE_MODE || 'sandbox';
const MERCHANT_ID = process.env.PAYHERE_MERCHANT_ID || '1223807';
const MERCHANT_SECRET = process.env.PAYHERE_MERCHANT_SECRET || '';
const PAYHERE_URL = PAYHERE_MODE === 'live' ? 'https://www.payhere.lk/pay/checkout' : 'https://sandbox.payhere.lk/pay/checkout';

function generatePayHereHash(orderId, amount, currency) {
    const merchantSecretHash = crypto.createHash('md5').update(MERCHANT_SECRET).digest('hex').toUpperCase();
    const amountFormatted = Number(amount).toFixed(2);
    const hashString = MERCHANT_ID + orderId + amountFormatted + currency + merchantSecretHash;
    return crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();
}

// POST /api/donations/checkout-session
router.post('/checkout-session', async (req, res) => {
    try {
        const amountLkr = parseAmountLkr(req.body && req.body.amount);
        const name = cleanName(req.body && req.body.name);
        const email = cleanEmail(req.body && req.body.email);
        const referenceText = String((req.body && req.body.reference_text) || '').trim().slice(0, 500);

        if (!amountLkr) return res.status(400).json({ error: 'Invalid amount (min LKR 100)' });
        if (!name || name.length < 2) return res.status(400).json({ error: 'Name is required' });
        if (!isValidEmail(email)) return res.status(400).json({ error: 'Valid email is required' });

        if (!MERCHANT_ID || !MERCHANT_SECRET) {
            return res.status(500).json({ error: 'PayHere is not configured on server', code: 'payhere_not_configured' });
        }
        const baseUrl = getBaseUrl(req);
        if (!/^https?:\/\//i.test(baseUrl)) {
            return res.status(500).json({ error: 'Server base URL is not configured', code: 'base_url_invalid' });
        }

        const paymentRef = `DON-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        await db.createDonation({
            name,
            email,
            amount: amountLkr,
            currency: 'LKR',
            payment_status: 'pending',
            stripe_session_id: paymentRef,
            reference_text: referenceText || null
        });

        res.json({ url: `${baseUrl}/api/donations/payhere/${encodeURIComponent(paymentRef)}` });
    } catch (e) {
        console.error('donations/checkout-session:', e);
        res.status(500).json({ error: 'Failed to start PayHere donation', code: 'payhere_checkout_failed' });
    }
});

router.get('/payhere/:ref', async (req, res) => {
    try {
        const ref = String(req.params.ref || '').trim();
        if (!ref) return res.status(400).send('Missing donation reference');
        const d = await db.getDonationByStripeSessionId(ref);
        if (!d) return res.status(404).send('Donation not found');

        const baseUrl = getBaseUrl(req);
        const amount = Number(d.amount).toFixed(2);
        const currency = String(d.currency || 'LKR').toUpperCase();
        const nameParts = String(d.name || 'Donor').trim().split(/\s+/);
        const firstName = nameParts[0] || 'Donor';
        const lastName = nameParts.slice(1).join(' ') || 'Supporter';

        res.render('payment-form', {
            merchant_id: MERCHANT_ID,
            return_url: `${baseUrl}/api/donations/return?session_id=${encodeURIComponent(ref)}`,
            cancel_url: `${baseUrl}/api/donations/cancel?session_id=${encodeURIComponent(ref)}`,
            notify_url: `${baseUrl}/api/donations/notify`,
            order_id: ref,
            items: 'Donation (Calvoro)',
            currency,
            amount,
            first_name: firstName,
            last_name: lastName,
            email: d.email || '',
            phone: '',
            address: '',
            city: 'Colombo',
            country: 'Sri Lanka',
            hash: generatePayHereHash(ref, amount, currency),
            payhere_url: PAYHERE_URL
        });
    } catch (e) {
        console.error('donations/payhere:', e);
        res.status(500).send('Failed to initialize donation payment');
    }
});

const requirePermission = require('../middleware/requirePermission');

// Admin list
router.get('/admin/list', requirePermission('donations'), async (req, res) => {
    try {
        const limit = req.query && req.query.limit;
        const rows = await db.getDonationsForAdmin(limit || 200);
        res.json(rows || []);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load donations' });
    }
});

// PayHere webhook: POST /api/donations/notify
router.post('/notify', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        const {
            merchant_id,
            order_id,
            payhere_amount,
            payhere_currency,
            status_code,
            md5sig
        } = req.body || {};
        if (String(merchant_id) !== String(MERCHANT_ID)) return res.status(400).send('Invalid merchant');

        const merchantSecretHash = crypto.createHash('md5').update(MERCHANT_SECRET).digest('hex').toUpperCase();
        const amountFormatted = Number(payhere_amount || 0).toFixed(2);
        const localHash = crypto.createHash('md5')
            .update(String(merchant_id) + String(order_id) + amountFormatted + String(payhere_currency) + String(status_code) + merchantSecretHash)
            .digest('hex')
            .toUpperCase();
        if (localHash !== String(md5sig || '').toUpperCase()) return res.status(400).send('Hash verification failed');

        const ref = String(order_id || '');
        const existing = await db.getDonationByStripeSessionId(ref);
        if (!existing) return res.status(404).send('Donation not found');

        if (String(status_code) === '2') {
            await db.updateDonationByStripeSessionId(ref, { payment_status: 'paid' });
            try {
                await emailService.queueEmail({
                    type: 'donation_confirmation',
                    to: existing.email,
                    subject: 'Thank You for Your Donation! - Calvoro',
                    templateName: 'donation-confirmation',
                    data: {
                        name: existing.name,
                        amount: existing.amount,
                        currency: (existing.currency || 'LKR').toUpperCase(),
                        reference: existing.reference_text || 'None provided'
                    }
                });
            } catch (queueErr) {
                console.error('Failed to queue donation email:', queueErr);
            }
        } else if (String(status_code) === '0') {
            await db.updateDonationByStripeSessionId(ref, { payment_status: 'pending' });
        } else {
            await db.updateDonationByStripeSessionId(ref, { payment_status: 'payment_failed' });
        }

        res.status(200).send('OK');
    } catch (e) {
        console.error('PayHere donation notify error:', e);
        res.status(500).send('Error processing notification');
    }
});

router.get('/return', (req, res) => {
    const sid = encodeURIComponent(String(req.query.session_id || ''));
    res.redirect(`/donation-success.html${sid ? `?session_id=${sid}` : ''}`);
});

router.get('/cancel', (req, res) => {
    const sid = encodeURIComponent(String(req.query.session_id || ''));
    res.redirect(`/donation-cancel.html${sid ? `?session_id=${sid}` : ''}`);
});

module.exports = router;

