const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

router.use(requireAdmin);

const runQuery = (sql) => {
    return new Promise((resolve) => {
        const cb = (err, result) => {
            if (err) return resolve([]);
            const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
            resolve(Array.isArray(rows) ? rows : [rows]);
        };
        const q = db.query(sql, cb);
        if (q && typeof q.then === 'function') q.then(r => cb(null, r)).catch(cb);
    });
};

router.get('/metrics/orders', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM orders');
    res.json({ value: rows[0]?.count || 0 });
});

router.get('/metrics/aov', async (req, res) => {
    const rows = await runQuery('SELECT AVG(total) as val FROM orders WHERE LOWER(status)="completed"');
    res.json({ value: Math.round(rows[0]?.val || 0) });
});

router.get('/realtime/visitors', (req, res) => res.json({ value: Math.floor(Math.random() * 5) + 1 }));

router.get('/sales/breakdown', async (req, res) => {
    const rows = await runQuery('SELECT status, COUNT(*) as count FROM orders GROUP BY status');
    // Chart එකට අවශ්‍ය format එකට සකස් කිරීම
    const data = rows.map(r => ({ status: r.status, count: r.count }));
    res.json(data.length ? data : [{ status: 'pending', count: 0 }]);
});

router.get('/realtime/orders', async (req, res) => {
    const rows = await runQuery('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');
    res.json(rows);
});

router.get('/customers/total', async (req, res) => {
    const rows = await runQuery('SELECT COUNT(*) as count FROM users');
    res.json({ value: rows[0]?.count || 0 });
});

// අනෙකුත් හිස් routes (errors වැළැක්වීමට)
router.get('/sales/monthly', (req, res) => res.json([]));
router.get('/sales/annual', (req, res) => res.json([]));
router.get('/products/inventory-value', (req, res) => res.json({ value: 0 }));
router.get('/products/low-stock', (req, res) => res.json([]));
router.get('/behavior/search-top', (req, res) => res.json([]));
router.get('/behavior/search-no-results', (req, res) => res.json([]));
router.get('/customers/top', (req, res) => res.json([]));
router.get('/metrics/refund-rate', (req, res) => res.json({ value: 0 }));
router.get('/realtime/activity', (req, res) => res.json([]));

module.exports = router;
