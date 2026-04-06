const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const emailService = require('../services/emailService');
const { OAuth2Client } = require('google-auth-library');

const NEWSLETTER_FILE = path.join(__dirname, '..', 'data', 'newsletter_subscribers.json');
function ensureNewsletterFile() {
    const dir = path.dirname(NEWSLETTER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(NEWSLETTER_FILE)) fs.writeFileSync(NEWSLETTER_FILE, '[]', 'utf8');
}
function addToNewsletter(email) {
    ensureNewsletterFile();
    const list = JSON.parse(fs.readFileSync(NEWSLETTER_FILE, 'utf8'));
    const lower = (email || '').trim().toLowerCase();
    if (lower && !list.includes(lower)) {
        list.push(lower);
        fs.writeFileSync(NEWSLETTER_FILE, JSON.stringify(list, null, 2), 'utf8');
    }
}

// Register: create account, then user can sign in
router.post('/register', async (req, res) => {
    try {
        const { email, password, first_name, last_name, phone, address, city } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const existing = await db.getUserByEmail(email);
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const password_hash = await bcrypt.hash(password, 10);

        await db.createUser({
            email,
            password_hash,
            first_name: first_name || '',
            last_name: last_name || '',
            phone: phone || '',
            address: address || '',
            city: city || '',
            email_verified: true,
            verification_code: null,
            verification_code_expires_at: null
        });

        const user = await db.getUserByEmail(email);
        if (user) {
            await emailService.sendWelcomeEmail(user);
        }

        res.json({
            success: true,
            message: 'Account created. You can now sign in.',
            email
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        req.session.user = {
            id: user.id,
            email: user.email,
            first_name: user.first_name || '',
            last_name: user.last_name || ''
        };

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name || '',
                last_name: user.last_name || ''
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Newsletter signup: create account if needed, add to newsletter, set session (user can do everything a signed-up customer does)
router.post('/newsletter-signup', async (req, res) => {
    try {
        const email = (req.body && req.body.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Valid email is required' });
        }
        let user = await db.getUserByEmailCaseInsensitive(email);
        if (!user) {
            try {
                const password_hash = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);
                await db.createUser({
                    email,
                    password_hash,
                    first_name: '',
                    last_name: '',
                    phone: '',
                    address: '',
                    city: '',
                    email_verified: true,
                    verification_code: null,
                    verification_code_expires_at: null
                });
                user = await db.getUserByEmailCaseInsensitive(email);
            } catch (createErr) {
                if (createErr.code === 'ER_DUP_ENTRY' || (createErr.message && (createErr.message + '').indexOf('Duplicate') !== -1)) {
                    user = await db.getUserByEmailCaseInsensitive(email);
                }
                if (!user) throw createErr;
            }
        }
        if (!user) return res.status(500).json({ error: 'Could not create account' });
        try {
            addToNewsletter(email);
        } catch (newsletterErr) {
            console.error('Newsletter add error (continuing):', newsletterErr);
        }
        req.session.user = {
            id: user.id,
            email: user.email,
            first_name: user.first_name || '',
            last_name: user.last_name || ''
        };
        
        await emailService.sendWelcomeEmail(user);

        res.json({
            success: true,
            message: 'You\'re signed up! You can add reviews, use wishlist, and more.',
            user: { id: user.id, email: user.email, first_name: req.session.user.first_name, last_name: req.session.user.last_name }
        });
    } catch (error) {
        console.error('Newsletter signup error:', error);
        res.status(500).json({ error: error.message || 'Sign-up failed' });
    }
});

// Google login: verify id_token, find or create user, set session (same capabilities as form login)
router.post('/google-login', async (req, res) => {
    try {
        const { id_token } = req.body;
        if (!id_token || typeof id_token !== 'string') {
            return res.status(400).json({ error: 'id_token is required' });
        }

        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            return res.status(500).json({ error: 'Google Sign-In is not configured (set GOOGLE_CLIENT_ID on the server).' });
        }

        const client = new OAuth2Client(clientId);
        const ticket = await client.verifyIdToken({ idToken: id_token, audience: clientId });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            return res.status(401).json({ error: 'Invalid Google token.' });
        }

        const email = payload.email;
        const name = payload.name || payload.email || '';
        const parts = name.trim().split(/\s+/);
        const first_name = parts[0] || '';
        const last_name = parts.slice(1).join(' ') || '';

        let user = await db.getUserByEmail(email);
        if (!user) {
            const password_hash = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);
            await db.createUser({
                email,
                password_hash,
                first_name,
                last_name,
                phone: '',
                address: '',
                city: '',
                email_verified: true,
                verification_code: null,
                verification_code_expires_at: null
            });
            user = await db.getUserByEmail(email);
        }
        if (!user) {
            return res.status(500).json({ error: 'Could not create or find user.' });
        }

        req.session.user = {
            id: user.id,
            email: user.email,
            first_name: user.first_name || first_name,
            last_name: user.last_name || last_name
        };

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                first_name: req.session.user.first_name,
                last_name: req.session.user.last_name
            }
        });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(401).json({ error: 'Google sign-in failed.' });
    }
});

// Newsletter Signup (and Auto-login)
router.post('/newsletter-signup', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const lowerEmail = email.trim().toLowerCase();
        addToNewsletter(lowerEmail);

        let user = await db.getUserByEmail(lowerEmail);
        if (!user) {
            const result = await db.createUser({
                email: lowerEmail,
                password_hash: '', 
                full_name: lowerEmail.split('@')[0]
            });
            user = await db.getUserById(result.lastInsertRowid);
        }

        req.session.user = {
            id: user.id,
            email: user.email,
            full_name: user.full_name
        };

        res.json({ success: true, message: 'Successfully signed up and logged in.', user: req.session.user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Newsletter signup failed' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logged out' });
});

// Get current user (for storefront account). Always 200; body is { user } so console doesn't show 401 when not logged in.
router.get('/me', (req, res) => {
    const user = (req.session && req.session.user) ? req.session.user : null;
    res.json({ user });
});

module.exports = router;
