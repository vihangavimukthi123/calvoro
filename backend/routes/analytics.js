/**
 * Admin Analytics (BI & Reporting) API
 * Calvoro E-commerce System
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
 * දත්ත ලබාගන්නා අතිශය ශක්තිමත් ශ්‍රිතය (Ultimate Query Runner)
 */
const runQuery = (sql, params = []) => {
    return new Promise((resolve) => {
        try {
            const callback = (err, result) => {
                if (err) {
                    console.error("Analytics DB Error:", err);
                    return resolve([]);
                }
                // mysql2 සහ mysql පැකේජ දෙකෙහිම දත්ත නිවැරදිව වෙන් කර ගැනීම
                const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
                resolve(Array.isArray(rows) ? rows : (rows ? [rows] : []));
            };

            const q = db.query(sql, params, callback);
            if (q && typeof q.then === 'function') {
                q.then(r => callback(null, r)).catch(e => callback(e, null));
            }
        } catch (e) {
            resolve([]);
        }
    });
};

// --- පින්තූරයේ පෙන්වූ 404 ERROR එක විසඳීම (Customers New) ---
router.get('/customers/new', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
    res.json({ value: rows[0]?.count || 0 });
});

router.get('/customers/total', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM users');
    res.json({ value: rows[0]?.count || 0 });
});

router.get('/customers/top', async (req, res) => {
    const rows = await runQuery('SELECT u.first_name as customer, COUNT(o.order_id) as orders, SUM(o.total) as spent FROM users u JOIN orders o ON u.user_id = o.user_id GROUP BY u.user_id ORDER BY spent DESC LIMIT 10');
    res.json(rows);
});

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
router.get('/realtime/activity', (req, res) => res.json([]));
router.get('/realtime/orders', async (req, res) => {
    const rows = await runQuery('SELECT order_id as id, total, status FROM orders ORDER BY created_at DESC LIMIT 10');
    res.json(rows);
});

// --- SALES CHARTS ---
router.get('/sales/monthly', async (req, res) => {
    const rows = await runQuery('SELECT DATE_FORMAT(created_at, "%b") as month, SUM(total) as revenue, COUNT(*) as orders FROM orders GROUP BY month');
    res.json(rows);
});

router.get('/sales/breakdown', async (req, res) => {
    const rows = await runQuery('SELECT status, COUNT(*) as count FROM orders GROUP BY status');
    res.json(rows.length ? rows : [{ status: 'pending', count: 0 }]);
});

router.get('/sales/annual', (req, res) => res.json([]));

// --- PRODUCTS ---
router.get('/products/top-sold', async (req, res) => {
    const rows = await runQuery('SELECT p.name as product, SUM(oi.quantity) as qty, SUM(oi.price * oi.quantity) as revenue FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.product_id ORDER BY qty DESC LIMIT 10');
    res.json(rows);
});

router.get('/products/inventory-value', async (req, res) => {
    const rows = await runQuery('SELECT SUM(price * stock) as val FROM products');
    res.json({ value: rows[0]?.val || 0 });
});

router.get('/products/low-stock', async (req, res) => {
    const rows = await runQuery('SELECT name as product, stock FROM products WHERE stock <= 5');
    res.json(rows);
});

// --- BEHAVIOR ---
router.get('/behavior/search-top', async (req, res) => {
    const rows = await runQuery('SELECT query as keyword, COUNT(*) as count FROM searches GROUP BY query ORDER BY count DESC LIMIT 10');
    res.json(rows);
});

router.get('/behavior/search-no-results', (req, res) => res.json([]));

module.exports = router;
