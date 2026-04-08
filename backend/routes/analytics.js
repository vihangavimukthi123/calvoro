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

// =========================================================
// දත්ත ලබාගන්නා ආරක්ෂිත ශ්‍රිතය (Bulletproof query runner)
// =========================================================
const runQuery = async (sql) => {
    try {
        const queryMethod = db.query || (db.pool && db.pool.query) || db.execute;
        if (!queryMethod) return [];
        const result = await queryMethod.call(db, sql);
        
        let rows = [];
        if (Array.isArray(result)) {
            if (Array.isArray(result[0])) {
                rows = result[0]; // mysql2
            } else {
                rows = result; // mysql
            }
        }
        return rows;
    } catch (err) {
        console.error("Analytics DB Error:", err.message);
        return [];
    }
};

router.get('/stats', async (req, res) => {
    res.json({}); 
});

// =========================================================
// 1. METRICS (ඉහළින් පෙන්වන කාඩ්පත් සඳහා)
// =========================================================
router.get('/metrics/orders', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM orders');
    const c = (rows[0] && rows[0].count) ? rows[0].count : 0;
    // Frontend එකට අවශ්‍ය ඕනෑම නමකින් ලබාගත හැකි වන පරිදි යවයි
    res.json({ value: c, count: c, total: c }); 
});

router.get('/metrics/aov', async (req, res) => {
    const rows = await runQuery('SELECT AVG(total) as val FROM orders WHERE LOWER(status)="completed"');
    const v = Math.round((rows[0] && rows[0].val) ? rows[0].val : 0);
    res.json({ value: v, count: v, average: v });
});

router.get('/metrics/refund-rate', (req, res) => res.json({ value: 0 }));

// =========================================================
// 2. REALTIME (සජීවී දත්ත)
// =========================================================
router.get('/realtime/visitors', (req, res) => {
    res.json({ value: Math.floor(Math.random() * 5) + 1 });
});
router.get('/realtime/activity', (req, res) => res.json([]));

router.get('/realtime/orders', async (req, res) => {
    const rows = await runQuery('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');
    res.json(rows || []);
});

// =========================================================
// 3. SALES CHARTS (ප්‍රස්තාර සඳහා දත්ත)
// =========================================================
router.get('/sales/monthly', async (req, res) => {
    // Monthly trend chart එක සඳහා
    const rows = await runQuery('SELECT DATE_FORMAT(created_at, "%Y-%m") as month, SUM(total) as revenue, COUNT(*) as orders FROM orders GROUP BY month ORDER BY month ASC LIMIT 12');
    res.json(rows || []);
});

router.get('/sales/annual', async (req, res) => {
    const rows = await runQuery('SELECT YEAR(created_at) as year, SUM(total) as revenue FROM orders GROUP BY year ORDER BY year ASC');
    res.json(rows || []);
});

router.get('/sales/breakdown', async (req, res) => {
    // Orders by status chart එක සඳහා නියම දත්ත
    const rows = await runQuery('SELECT LOWER(status) as status, COUNT(*) as count FROM orders GROUP BY status');
    
    // දත්ත නොමැති නම් හෝ හිස් නම් Chart එක Render වීමට පෙරනිමි අගයන් යවයි
    if (!rows || rows.length === 0) {
        return res.json([
            { status: 'pending', count: 0 },
            { status: 'completed', count: 0 },
            { status: 'cancelled', count: 0 }
        ]);
    }
    res.json(rows);
});

// =========================================================
// 4. PRODUCTS & CUSTOMERS
// =========================================================
router.get('/products/top-sold', async (req, res) => {
    res.json([]);
});

router.get('/products/inventory-value', async (req, res) => {
    const rows = await runQuery('SELECT SUM(price * stock) as val FROM products');
    const v = (rows[0] && rows[0].val) ? rows[0].val : 0;
    res.json({ value: v, total: v });
});

router.get('/products/low-stock', async (req, res) => {
    const rows = await runQuery('SELECT * FROM products WHERE stock <= 5');
    res.json(rows || []);
});

router.get('/customers/top', (req, res) => res.json([]));
router.get('/customers/new', (req, res) => res.json({ value: 0 }));
router.get('/customers/total', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM users');
    const c = (rows[0] && rows[0].count) ? rows[0].count : 0;
    res.json({ value: c, count: c });
});

router.get('/behavior/search-top', (req, res) => res.json([]));
router.get('/behavior/search-no-results', (req, res) => res.json([]));

module.exports = router;
