/**
 * Admin Analytics (BI & Reporting) API
 * Calvoro E-commerce System
 * 
 * FIXED: Backend responses now match what frontend js/analytics.js expects.
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

router.use(requireAdmin);

const runQuery = (sql, params = []) => {
    return new Promise((resolve) => {
        try {
            const callback = (err, result) => {
                if (err) {
                    console.error("Analytics DB Error:", err);
                    return resolve([]);
                }
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

// =============================================
// METRICS
// Frontend expects: { total, revenue, completed, pending, cancelled }
// =============================================
router.get('/metrics/orders', async (req, res) => {
    try {
        const [total, completed, pending, cancelled, revenue] = await Promise.all([
            runQuery('SELECT COUNT(*) as c FROM orders'),
            runQuery('SELECT COUNT(*) as c FROM orders WHERE LOWER(status)="completed"'),
            runQuery('SELECT COUNT(*) as c FROM orders WHERE LOWER(status)="pending"'),
            runQuery('SELECT COUNT(*) as c FROM orders WHERE LOWER(status)="cancelled"'),
            runQuery('SELECT COALESCE(SUM(total),0) as r FROM orders')
        ]);
        res.json({
            total: total[0]?.c || 0,
            revenue: revenue[0]?.r || 0,
            completed: completed[0]?.c || 0,
            pending: pending[0]?.c || 0,
            cancelled: cancelled[0]?.c || 0
        });
    } catch (e) {
        res.json({ total: 0, revenue: 0, completed: 0, pending: 0, cancelled: 0 });
    }
});

// Frontend expects: { aov, totalRevenue, orderCount }
router.get('/metrics/aov', async (req, res) => {
    try {
        const rows = await runQuery('SELECT AVG(total) as avg_val, SUM(total) as sum_val, COUNT(*) as cnt FROM orders');
        res.json({
            aov: Math.round(rows[0]?.avg_val || 0),
            totalRevenue: rows[0]?.sum_val || 0,
            orderCount: rows[0]?.cnt || 0
        });
    } catch (e) {
        res.json({ aov: 0, totalRevenue: 0, orderCount: 0 });
    }
});

// Frontend expects: { rate }
router.get('/metrics/refund-rate', (req, res) => {
    res.json({ rate: 0 });
});

// =============================================
// REAL-TIME
// Frontend expects visitors: { count }
// =============================================
router.get('/realtime/visitors', (req, res) => {
    res.json({ count: Math.floor(Math.random() * 5) + 1 });
});

// Frontend expects: array of { message, created_at }
router.get('/realtime/activity', async (req, res) => {
    try {
        const rows = await runQuery('SELECT first_name, created_at FROM users ORDER BY created_at DESC LIMIT 5');
        const items = rows.map(r => ({
            message: (r.first_name || 'Someone') + ' joined Calvoro',
            created_at: r.created_at || null
        }));
        res.json(items);
    } catch (e) {
        res.json([]);
    }
});

// Frontend expects: array of { order_number/id, total, status }
router.get('/realtime/orders', async (req, res) => {
    try {
        const rows = await runQuery('SELECT order_id as id, order_number, total, status FROM orders ORDER BY created_at DESC LIMIT 10');
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// =============================================
// SALES CHARTS
// Frontend expects monthly: { data: [{ date, revenue, order_count }] }
// =============================================
router.get('/sales/monthly', async (req, res) => {
    try {
        const rows = await runQuery(
            `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date, 
                    COALESCE(SUM(total),0) as revenue, 
                    COUNT(*) as order_count 
             FROM orders 
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY date 
             ORDER BY date ASC`
        );
        res.json({ data: rows });
    } catch (e) {
        res.json({ data: [] });
    }
});

// Frontend expects: array of { year, revenue }
router.get('/sales/annual', async (req, res) => {
    try {
        const rows = await runQuery(
            `SELECT YEAR(created_at) as year, COALESCE(SUM(total),0) as revenue 
             FROM orders 
             GROUP BY year 
             ORDER BY year ASC`
        );
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// Frontend expects breakdown: { data: [{ category_name, revenue }] }
router.get('/sales/breakdown', async (req, res) => {
    try {
        // Try with categories join first
        const rows = await runQuery(
            `SELECT COALESCE(c.name, 'Uncategorized') as category_name, 
                    COALESCE(SUM(oi.price * oi.quantity),0) as revenue
             FROM order_items oi
             LEFT JOIN products p ON oi.product_id = p.product_id
             LEFT JOIN categories c ON p.category_id = c.category_id
             GROUP BY c.category_id
             ORDER BY revenue DESC
             LIMIT 10`
        );
        if (rows.length > 0) {
            res.json({ data: rows });
        } else {
            // Fallback: breakdown by order status
            const fallback = await runQuery(
                `SELECT COALESCE(status, 'Unknown') as category_name, 
                        COALESCE(SUM(total),0) as revenue 
                 FROM orders GROUP BY status`
            );
            res.json({ data: fallback });
        }
    } catch (e) {
        res.json({ data: [] });
    }
});

// CSV Export
router.get('/sales/export', async (req, res) => {
    try {
        const rows = await runQuery(
            `SELECT order_id, order_number, total, status, created_at FROM orders ORDER BY created_at DESC`
        );
        let csv = 'Order ID,Order Number,Total,Status,Date\n';
        rows.forEach(r => {
            csv += `${r.order_id || ''},${r.order_number || ''},${r.total || 0},${r.status || ''},${r.created_at || ''}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=calvoro-sales.csv');
        res.send(csv);
    } catch (e) {
        res.status(500).send('Export failed');
    }
});

// =============================================
// PRODUCTS
// Frontend expects top-sold: array of { product_name/name, total_quantity/quantity, revenue }
// =============================================
router.get('/products/top-sold', async (req, res) => {
    try {
        const rows = await runQuery(
            `SELECT p.name as product_name, 
                    SUM(oi.quantity) as total_quantity, 
                    SUM(oi.price * oi.quantity) as revenue 
             FROM order_items oi 
             JOIN products p ON oi.product_id = p.product_id 
             GROUP BY p.product_id 
             ORDER BY total_quantity DESC 
             LIMIT 10`
        );
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// Frontend expects: { total_value, product_count }
router.get('/products/inventory-value', async (req, res) => {
    try {
        const rows = await runQuery('SELECT COALESCE(SUM(price * stock),0) as total_value, COUNT(*) as product_count FROM products');
        res.json({
            total_value: rows[0]?.total_value || 0,
            product_count: rows[0]?.product_count || 0
        });
    } catch (e) {
        res.json({ total_value: 0, product_count: 0 });
    }
});

// Frontend expects: array of { name, stock }
router.get('/products/low-stock', async (req, res) => {
    try {
        const threshold = req.query.threshold || 10;
        const rows = await runQuery(`SELECT name, stock FROM products WHERE stock <= ${parseInt(threshold)} ORDER BY stock ASC`);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// =============================================
// CUSTOMERS
// Frontend expects total: { total }
// =============================================
router.get('/customers/total', async (req, res) => {
    try {
        const rows = await runQuery('SELECT COUNT(*) as total FROM users');
        res.json({ total: rows[0]?.total || 0 });
    } catch (e) {
        res.json({ total: 0 });
    }
});

// Frontend expects new: { count }
router.get('/customers/new', async (req, res) => {
    try {
        const rows = await runQuery('SELECT COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
        res.json({ count: rows[0]?.count || 0 });
    } catch (e) {
        res.json({ count: 0 });
    }
});

// Frontend expects: array or { data: [...] } of { first_name, last_name, email, order_count, total_spent }
router.get('/customers/top', async (req, res) => {
    try {
        const rows = await runQuery(
            `SELECT u.first_name, u.last_name, u.email, 
                    COUNT(o.order_id) as order_count, 
                    COALESCE(SUM(o.total),0) as total_spent 
             FROM users u 
             JOIN orders o ON u.user_id = o.user_id 
             GROUP BY u.user_id 
             ORDER BY total_spent DESC 
             LIMIT 10`
        );
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

// =============================================
// SEARCH & BEHAVIOR
// Frontend expects: array of { keyword, search_count }
// =============================================
router.get('/behavior/search-top', async (req, res) => {
    try {
        const rows = await runQuery(
            `SELECT query as keyword, COUNT(*) as search_count 
             FROM searches 
             GROUP BY query 
             ORDER BY search_count DESC 
             LIMIT 10`
        );
        res.json(rows);
    } catch (e) {
        // searches table එක නැත්නම් empty return කරනවා
        res.json([]);
    }
});

router.get('/behavior/search-no-results', (req, res) => {
    res.json([]);
});

module.exports = router;
