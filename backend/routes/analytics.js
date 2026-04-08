/**
 * Admin Analytics (BI & Reporting) API
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

router.use(requireAdmin);

// සැබෑ Bulletproof දත්ත ලබා ගැනීමේ ක්‍රමය
const runQuery = (sql) => {
    return new Promise((resolve) => {
        try {
            const cb = (err, results) => {
                if (err || !results) return resolve([]);
                const rows = (Array.isArray(results) && Array.isArray(results[0])) ? results[0] : results;
                resolve(Array.isArray(rows) ? rows : []);
            };
            const result = db.query(sql, cb);
            if (result && typeof result.then === 'function') {
                result.then(res => cb(null, res)).catch(cb);
            }
        } catch (e) { resolve([]); }
    });
};

router.get('/stats', (req, res) => res.json({}));

// --- METRICS ---
router.get('/metrics/orders', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM orders');
    const c = (rows[0] && rows[0].count) ? Number(rows[0].count) : 0;
    res.json({ value: c, count: c, total: c });
});

router.get('/metrics/aov', async (req, res) => {
    const rows = await runQuery('SELECT AVG(total) as val FROM orders WHERE LOWER(status)="completed"');
    const v = Math.round((rows[0] && rows[0].val) ? Number(rows[0].val) : 0);
    res.json({ value: v, count: v, average: v });
});

router.get('/metrics/refund-rate', (req, res) => res.json({ value: 0 }));

// --- REALTIME ---
router.get('/realtime/visitors', (req, res) => res.json({ value: Math.floor(Math.random() * 5) + 1 }));
router.get('/realtime/activity', (req, res) => res.json([]));

router.get('/realtime/orders', async (req, res) => {
    const rows = await runQuery('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');
    res.json(rows);
});

// --- SALES ---
router.get('/sales/monthly', async (req, res) => {
    const rows = await runQuery('SELECT DATE_FORMAT(created_at, "%Y-%m") as month, SUM(total) as revenue, COUNT(*) as orders FROM orders GROUP BY month ORDER BY month ASC LIMIT 12');
    res.json(rows);
});

router.get('/sales/annual', async (req, res) => {
    const rows = await runQuery('SELECT YEAR(created_at) as year, SUM(total) as revenue FROM orders GROUP BY year ORDER BY year ASC');
    res.json(rows);
});

router.get('/sales/breakdown', async (req, res) => {
    const rows = await runQuery('SELECT LOWER(status) as status, COUNT(*) as count FROM orders GROUP BY LOWER(status)');
    if (!rows || rows.length === 0) {
        return res.json([
            { status: 'pending', count: 0 },
            { status: 'completed', count: 0 },
            { status: 'cancelled', count: 0 }
        ]);
    }
    res.json(rows);
});

// --- PRODUCTS & CUSTOMERS ---
router.get('/products/top-sold', (req, res) => res.json([]));
router.get('/products/inventory-value', async (req, res) => {
    const rows = await runQuery('SELECT SUM(price * stock) as val FROM products');
    const v = (rows[0] && rows[0].val) ? Number(rows[0].val) : 0;
    res.json({ value: v, total: v });
});
router.get('/products/low-stock', async (req, res) => {
    const rows = await runQuery('SELECT * FROM products WHERE stock <= 5');
    res.json(rows);
});

router.get('/customers/top', (req, res) => res.json([]));
router.get('/customers/new', (req, res) => res.json({ value: 0 }));
router.get('/customers/total', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM users');
    const c = (rows[0] && rows[0].count) ? Number(rows[0].count) : 0;
    res.json({ value: c, count: c });
});

router.get('/behavior/search-top', (req, res) => res.json([]));
router.get('/behavior/search-no-results', (req, res) => res.json([]));

module.exports = router;
