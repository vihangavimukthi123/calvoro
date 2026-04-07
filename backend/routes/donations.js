const express = require('express');
const Stripe = require('stripe');
const db = require('../db');
const emailService = require('../services/emailService');

const router = express.Router();

function getBaseUrl(req) {
    return process.env.BASE_URL || (req && req.protocol && req.get ? (req.protocol + '://' + req.get('host')) : '/api');
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

function stripeClient() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY missing');
    return new Stripe(key, { apiVersion: '2024-06-20' });
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

        const stripe = stripeClient();
        const baseUrl = getBaseUrl(req);

        // Create donation record first (pending); set session id after session created
        const created = await db.createDonation({
            name,
            email,
            amount: amountLkr,
            currency: 'LKR',
            payment_status: 'pending',
            reference_text: referenceText || null
        });

        const donationId = created && (created.lastInsertRowid || (created.donation && created.donation.id));

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: email,
            line_items: [
                {
                    price_data: {
                        currency: 'lkr',
                        product_data: { name: 'Donation (Calvoro)' },
                        unit_amount: amountLkr * 100
                    },
                    quantity: 1
                }
            ],
            success_url: `${baseUrl}/donation-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/donation-cancel.html`,
            metadata: {
                donation_id: String(donationId || ''),
                donor_name: name,
                donor_email: email
            }
        });

        // Persist Stripe session id for webhook lookup
        if (typeof db.updateDonationById === 'function' && donationId && session && session.id) {
            await db.updateDonationById(donationId, { stripe_session_id: session.id }).catch(() => { });
        }

        res.json({ url: session.url });
    } catch (e) {
        console.error('donations/checkout-session:', e);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// GET /api/donations/session/:sessionId (public; session ids are unguessable)
router.get('/session/:sessionId', async (req, res) => {
    try {
        const sessionId = String(req.params.sessionId || '').trim();
        if (!sessionId) return res.status(400).json({ error: 'Missing session id' });
        const d = await db.getDonationByStripeSessionId(sessionId);
        if (!d) return res.status(404).json({ error: 'Donation not found' });
        res.json({
            name: d.name,
            email: d.email,
            amount: d.amount,
            currency: d.currency,
            payment_status: d.payment_status,
            created_at: d.created_at
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load donation' });
    }
});

// Admin list
router.get('/admin/list', async (req, res) => {
    try {
        if (!(req.session && req.session.admin)) return res.status(401).json({ error: 'Unauthorized' });
        const limit = req.query && req.query.limit;
        const rows = await db.getDonationsForAdmin(limit || 200);
        res.json(rows || []);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load donations' });
    }
});

// Stripe webhook: POST /api/donations/webhook
router.post('/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const whsec = process.env.STRIPE_WEBHOOK_SECRET;

    if (!whsec) return res.status(500).send('Webhook secret missing');
    if (!sig) return res.status(400).send('Missing signature');

    let event;
    try {
        const stripe = stripeClient();
        const raw = req.rawBody;
        event = stripe.webhooks.constructEvent(raw, sig, whsec);
    } catch (err) {
        console.error('Stripe webhook verify failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const s = event.data.object;
            const sessionId = s.id;
            const paymentIntent = s.payment_intent || null;
            const amountTotal = s.amount_total != null ? Math.round(Number(s.amount_total) / 100) : null;
            const currency = (s.currency || 'lkr').toUpperCase();

            // If record exists by session id, update it
            const existing = await db.getDonationByStripeSessionId(sessionId);
            let finalAmount = amountTotal != null ? amountTotal : (existing ? existing.amount : 0);
            
            if (existing) {
                await db.updateDonationByStripeSessionId(sessionId, {
                    payment_status: 'paid',
                    stripe_payment_intent: paymentIntent,
                    amount: finalAmount,
                    currency: currency || existing.currency
                });

                // Enqueue Donation Confirmation Email
                try {
                    await emailService.queueEmail({
                        type: 'donation_confirmation',
                        to: existing.email,
                        subject: 'Thank You for Your Donation! - Calvoro',
                        templateName: 'donation-confirmation',
                        data: {
                            name: existing.name,
                            amount: finalAmount,
                            currency: (currency || existing.currency).toUpperCase(),
                            reference: existing.reference_text || 'None provided'
                        }
                    });
                } catch(queueErr) {
                    console.error('Failed to queue donation email:', queueErr);
                }
            }
        }

        // Always ACK so Stripe doesn't retry forever
        res.json({ received: true });
    } catch (e) {
        console.error('Stripe webhook handler error:', e);
        res.status(500).send('Webhook handler failed');
    }
});

module.exports = router;

