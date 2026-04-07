/**
 * Admin Analytics (BI & Reporting) API
 * All routes require admin session.
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * Middleware: Admin ලොග් වී ඇත්දැයි පරීක්ෂා කරයි
 */
function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

router.use(requireAdmin);

/**
 * GET /api/admin/analytics/stats
 * Dashboard එකේ ඉහළින් පෙන්වන කාඩ්පත් සඳහා දත්ත ලබා දෙයි
 */
router.get('/stats', async (req, res) => {
    try {
        // 1. db.js එකේ ප්‍රධාන function එකක් තිබේදැයි මුලින්ම බලයි
        if (typeof db.getDashboardStats === 'function') {
            const data = await db.getDashboardStats();
            return res.json(data);
        }

        let stats = { 
            totalProducts: 0, 
            totalUsers: 0, 
            totalOrders: 0, 
            totalRevenue: 0, 
            pendingOrders: 0 
        };
        
        /**
         * Helper Function: විවිධ MySQL Libraries (mysql, mysql2) අතර 
         * දත්ත ලැබෙන ආකාරය ස්වයංක්‍රීයව හඳුනා ගනී.
         */
        const runQuery = async (sql) => {
            try {
                const queryMethod = db.query || (db.pool && db.pool.query) || db.execute;
                if (!queryMethod) return {};
                
                const result = await queryMethod.call(db, sql);
                
                // mysql2 format එකේදී [rows, fields] ලෙස ලැබෙන බැවින් එය නිවැරදි කරයි
                const rows = Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : [result];
                return rows[0] || {};
            } catch (err) {
                console.error(`Query Error: ${sql}`, err.message);
                return {};
            }
        };

        // 2. දත්ත එකින් එක ගණනය කිරීම
        const prod = await runQuery('SELECT COUNT(*) as count FROM products');
        stats.totalProducts = prod.count || 0;

        const user = await runQuery('SELECT COUNT(*) as count FROM users');
        stats.totalUsers = user.count || 0;

        const orderData = await runQuery('SELECT COUNT(*) as count, SUM(total) as revenue FROM orders');
        stats.totalOrders = orderData.count || 0;
        stats.totalRevenue = Number(orderData.revenue) || 0;

        const pend = await runQuery('SELECT COUNT(*) as count FROM orders WHERE LOWER(status) = "pending"');
        stats.pendingOrders = pend.count || 0;

        res.json(stats);
    } catch (e) {
        console.error('Stats API Error:', e);
        res.status(500).json({ error: 'Database stats retrieval failed' });
    }
});

/**
 * අතිරේක Analytics Routes (විකල්ප)
 */
router.get('/sales/monthly', async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        if (typeof db.getSalesMonthly === 'function') {
            const data = await db.getSalesMonthly(year);
            return res.json(data);
        }
        res.json([]);
    } catch (e) {
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
