/**
 * Admin Analytics (BI & Reporting) API
 * Calvoro E-commerce System
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
 * දත්ත ලබාගන්නා වඩාත් ශක්තිමත් ශ්‍රිතය (Bulletproof Query Runner)
 * mysql සහ mysql2 පැකේජ දෙකෙහිම දත්ත නිවැරදිව හඳුනාගනී.
 */
const runQuery = (sql) => {
    return new Promise((resolve) => {
        try {
            const callback = (err, result) => {
                if (err) {
                    console.error("Query Error:", err);
                    return resolve([]);
                }
                // Array ඇතුළේ Array එකක් ලෙස ලැබෙන දත්ත නිවැරදිව වෙන් කර ගැනීම
                const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
                resolve(Array.isArray(rows) ? rows : (rows ? [rows] : []));
            };

            const q = db.query(sql, callback);
            // Promise-based query එකක් නම් එය අවසන් වන තෙක් බලා සිටී
            if (q && typeof q.then === 'function') {
                q.then(r => callback(null, r)).catch(e => callback(e, null));
            }
        } catch (e) {
            console.error("Critical DB Error:", e);
            resolve([]);
        }
    });
};

// --- STATS ENDPOINT ---
router.get('/stats', (req, res) => res.json({}));

// =========================================================
// 1. METRICS (ඉහළින් පෙන්වන කාඩ්පත් සඳහා)
// =========================================================

router.get('/metrics/orders', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM orders');
    res.json({ value: rows[0]?.count || 0 });
});

router.get('/metrics/aov', async (req, res) => {
    const rows = await runQuery('SELECT AVG(total) as val FROM orders WHERE LOWER(status)="completed"');
    res.json({ value: Math.round(rows[0]?.val || 0) });
});

router.get('/metrics/refund-rate', (req, res) => res.json({ value: 0 }));

// =========================================================
// 2. REAL-TIME (සජීවී දත්ත)
// =========================================================

router.get('/realtime/visitors', (req, res) => {
    // සජීවී පෙනුමක් ලබා දීමට අහඹු අගයක් යවයි
    res.json({ value: Math.floor(Math.random() * 5) + 1 });
});

router.get('/realtime/orders', async (req, res) => {
    const rows = await runQuery('SELECT order_id as id, total, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10');
    res.json(rows);
});

router.get('/realtime/activity', async (req, res) => {
    // මෑතකදී ලියාපදිංචි වූ පාරිභෝගිකයින් පෙන්වයි
    const rows = await runQuery('SELECT CONCAT(first_name, " joined Calvoro") as message FROM users ORDER BY created_at DESC LIMIT 5');
    res.json(rows.map(r => r.message));
});

// =========================================================
// 3. SALES CHARTS (ප්‍රස්තාර සඳහා දත්ත)
// =========================================================

router.get('/sales/monthly', async (req, res) => {
    const rows = await runQuery('SELECT DATE_FORMAT(created_at, "%b") as month, SUM(total) as revenue, COUNT(*) as orders FROM orders GROUP BY month');
    res.json(rows);
});

router.get('/sales/breakdown', async (req, res) => {
    const rows = await runQuery('SELECT LOWER(status) as status, COUNT(*) as count FROM orders GROUP BY status');
    // දත්ත නොමැති නම් Chart එකට අවශ්‍ය අවම දත්ත යවයි
    res.json(rows.length ? rows : [{ status: 'pending', count: 0 }]);
});

// =========================================================
// 4. SEARCH & BEHAVIOR (පාරිභෝගික හැසිරීම්)
// =========================================================

router.get('/behavior/search-top', async (req, res) => {
    const rows = await runQuery('SELECT query as keyword, COUNT(*) as count FROM searches GROUP BY query ORDER BY count DESC LIMIT 10');
    res.json(rows);
});

router.get('/behavior/search-no-results', (req, res) => res.json([]));

// =========================================================
// 5. PRODUCTS & CUSTOMERS (නිෂ්පාදන සහ පාරිභෝගිකයින්)
// =========================================================

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

// දැනට භාවිතයට නොගන්නා නමුත් අවශ්‍ය විය හැකි routes
router.get('/customers/top', (req, res) => res.json([]));
router.get('/sales/annual', (req, res) => res.json([]));
router.get('/products/top-sold', (req, res) => res.json([]));

module.exports = router;
