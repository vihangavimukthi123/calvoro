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
                email: user.email
            };
            res.json({
                success: true,
                admin: {
                    username: user.username,
                    email: user.email
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
