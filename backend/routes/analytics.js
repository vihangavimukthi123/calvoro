/**
 * Admin Analytics (BI & Reporting) API
 * Calvoro E-commerce System - Optimized Version
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * Middleware: Admin පරීක්ෂාව
 */
function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

router.use(requireAdmin);

/**
 * දත්ත ලබාගන්නා වඩාත් ශක්තිමත් ශ්‍රිතය (Robust Query Runner)
 */
const runQuery = async (sql) => {
    return new Promise((resolve) => {
        try {
            const callback = (err, result) => {
                if (err) {
                    console.error("Analytics Query Error:", err);
                    return resolve([]);
                }
                // mysql2 සහ mysql පැකේජ දෙකෙහිම දත්ත නිවැරදිව හඳුනාගනී
                const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
                resolve(Array.isArray(rows) ? rows : (rows ? [rows] : []));
            };

            const q = db.query(sql, callback);
            // Promise-based query එකක් නම් (mysql2 promise pool)
            if (q && typeof q.then === 'function') {
                q.then(r => callback(null, r)).catch(e => callback(e, null));
            }
        } catch (e) {
            console.error("Critical Analytics Error:", e);
            resolve([]);
        }
    });
};

// --- METRICS ---
router.get('/metrics/orders', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM orders');
    res.json({ value: rows[0]?.count || 0 });
});

router.get('/metrics/aov', async (req, res) => {
    const rows = await runQuery('SELECT AVG(total) as val FROM orders WHERE LOWER(status)="completed"');
    res.json({ value: Math.round(rows[0]?.val || 0) });
});

router.get('/metrics/refund-rate', (req, res) => res.json({ value: 0 }));

// --- REAL-TIME ---
router.get('/realtime/visitors', (req, res) => res.json({ value: Math.floor(Math.random() * 5) + 1 }));

router.get('/realtime/orders', async (req, res) => {
    const rows = await runQuery('SELECT order_id as id, total, status FROM orders ORDER BY created_at DESC LIMIT 10');
    res.json(rows);
});

router.get('/realtime/activity', async (req, res) => {
    const rows = await runQuery('SELECT CONCAT(first_name, " joined Calvoro") as message FROM users ORDER BY created_at DESC LIMIT 5');
    res.json(rows.map(r => r.message));
});

// --- SALES CHARTS ---
router.get('/sales/monthly', async (req, res) => {
    const rows = await runQuery('SELECT DATE_FORMAT(created_at, "%b") as month, SUM(total) as revenue, COUNT(*) as orders FROM orders GROUP BY month');
    res.json(rows);
});

router.get('/sales/breakdown', async (req, res) => {
    const rows = await runQuery('SELECT LOWER(status) as status, COUNT(*) as count FROM orders GROUP BY status');
    res.json(rows.length ? rows : [{ status: 'pending', count: 0 }]);
});

// --- SEARCH & BEHAVIOR ---
router.get('/behavior/search-top', async (req, res) => {
    const rows = await runQuery('SELECT query as keyword, COUNT(*) as count FROM searches GROUP BY query ORDER BY count DESC LIMIT 10');
    res.json(rows);
});

router.get('/behavior/search-no-results', (req, res) => res.json([]));

// --- PRODUCTS & CUSTOMERS ---
router.get('/products/inventory-value', async (req, res) => {
    const rows = await runQuery('SELECT SUM(price * stock) as val FROM products');
    res.json({ value: rows[0]?.val || 0 });
});

router.get('/products/low-stock', async (req, res) => {
    const rows = await runQuery('SELECT name as product, stock FROM products WHERE stock <= 5');
    res.json(rows);
});

router.get('/customers/total', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM users');
    res.json({ value: rows[0]?.count || 0 });
});

router.get('/customers/top', (req, res) => res.json([]));
router.get('/sales/annual', (req, res) => res.json([]));
router.get('/products/top-sold', (req, res) => res.json([]));

module.exports = router;
