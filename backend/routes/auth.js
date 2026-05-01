const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../db');

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const user = await db.getAdminByUsername(username);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            req.session.admin = {
                id: user.id,
                username: user.username,
                email: user.email,
                permissions: typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || [])
            };
            res.json({
                success: true,
                admin: {
                    username: user.username,
                    email: user.email,
                    permissions: req.session.admin.permissions
                }
            });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

router.post('/frictionless-login', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    
    try {
        const user = await db.getUserByEmail(email);
        if (user) {
            // Found existing user, log them in for checkout
            req.session.user = {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name
            };
            return res.json({ 
                success: true, 
                user: {
                    id: user.id,
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    phone: user.phone,
                    address: user.address,
                    city: user.city
                }, 
                existing: true 
            });
        } else {
            return res.json({ success: true, existing: false });
        }
    } catch (e) {
        console.error('Frictionless login error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Check auth status
router.get('/status', (req, res) => {
    if (req.session && req.session.admin) {
        res.json({
            authenticated: true,
            admin: req.session.admin
        });
    } else {
        res.json({ authenticated: false });
    }
});

module.exports = router;
