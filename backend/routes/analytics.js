/**
 * Admin Analytics (BI & Reporting) API
 * All routes require admin session.
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

router.use(requireAdmin);

// ---- Dashboard General Stats (නිවැරදි කරන ලද කොටස) ----
router.get('/stats', async (req, res) => {
    try {
        if (typeof db.getDashboardStats === 'function') {
            const data = await db.getDashboardStats();
            return res.json(data);
        }

        let stats = { totalProducts: 0, totalUsers: 0, totalOrders: 0, totalRevenue: 0, pendingOrders: 0 };
        
        // Database query කිරීම සඳහා සුදුසු function එක තෝරා ගැනීම
        const queryFn = db.query || (db.pool && db.pool.query) || db.execute;

        if (typeof queryFn === 'function') {
            // 1. Products Count
            const [prod] = await queryFn.call(db, 'SELECT COUNT(*) as count FROM products');
            stats.totalProducts = (Array.isArray(prod) ? prod[0].count : prod.count) || 0;

            // 2. Users Count
            const [user] = await queryFn.call(db, 'SELECT COUNT(*) as count FROM users');
            stats.totalUsers = (Array.isArray(user) ? user[0].count : user.count) || 0;

            // 3. Orders & Revenue
            const [order] = await queryFn.call(db, 'SELECT COUNT(*) as count, SUM(total) as revenue FROM orders');
            const oRow = Array.isArray(order) ? order[0] : order;
            stats.totalOrders = oRow?.count || 0;
            stats.totalRevenue = oRow?.revenue || 0;

            // 4. Pending Orders (Case-insensitive check)
            const [pend] = await queryFn.call(db, 'SELECT COUNT(*) as count FROM orders WHERE LOWER(status) = "pending"');
            stats.pendingOrders = (Array.isArray(pend) ? pend[0].count : pend.count) || 0;
        }

        res.json(stats);
    } catch (e) {
        console.error('Stats API Error:', e);
        res.status(500).json({ error: 'Database query failed' });
    }
});

// ---- අනිත් සියලුම Analytics Routes (Monthly, Annual, etc.) ----
router.get('/sales/monthly', async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const data = await db.getSalesMonthly(year);
        res.json(data);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

router.get('/products/top-sold', async (req, res) => {
    try {
        const data = await db.getTopSoldProducts();
        res.json(data);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

router.get('/customers/total', async (req, res) => {
    try {
        const data = await db.getTotalCustomers();
        res.json(data);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

// අවශ්‍ය අනෙකුත් routes මෙලෙසම පවතියි...
module.exports = router;
