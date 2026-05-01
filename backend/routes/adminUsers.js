/**
 * Admin Users API - View, add, edit, delete users
 * Protected by requireAdmin middleware
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const requirePermission = require('../middleware/requirePermission');

// Middleware: require admin session
function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

router.use(requireAdmin);
// Only admins with 'users' permission can manage storefront and admin users
router.use(requirePermission('users'));

// GET /api/admin/users - List all users
router.get('/', async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// POST /api/admin/users - Add new user (admin can create users)
router.post('/', async (req, res) => {
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

        res.status(201).json({ success: true, message: 'User created' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// POST /api/admin/users/admin - Add new admin
router.post('/admin', async (req, res) => {
    try {
        const { username, password, email, permissions } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const existing = await db.getAdminByUsername(username);
        if (existing) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        await db.createAdmin({
            username,
            password,
            email,
            permissions: Array.isArray(permissions) ? permissions : []
        });

        res.status(201).json({ success: true, message: 'Admin created successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create admin' });
    }
});

// PUT /api/admin/users/:id - Update user
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, phone, address, city } = req.body;

        const result = await db.updateUserById(id, {
            first_name,
            last_name,
            phone,
            address,
            city
        });

        if (result.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, message: 'User updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.deleteUserById(id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
