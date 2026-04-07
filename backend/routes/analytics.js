/**
 * Admin Analytics (BI & Reporting) API
 * All routes require admin session. Date params validated; queries parameterized.
 */
const express = require('express');
const router = express.Router();
const db = require('../db');

// Optional in-memory cache for heavy reports (5 min TTL)
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.exp) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data) {
    cache.set(key, { data, exp: Date.now() + CACHE_TTL_MS });
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Validate date YYYY-MM-DD
function isValidDate(s) {
    if (!s || typeof s !== 'string') return false;
    const d = new Date(s);
    return !isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}

// Parse and validate date range (max 365 days)
function parseRange(req) {
    const from = req.query.from;
    const to = req.query.to;
    const fromD = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toD = to ? new Date(to) : new Date();
    if (!isValidDate(fromD.toISOString().slice(0, 10)) && from) return null;
    if (!isValidDate(toD.toISOString().slice(0, 10)) && to) return null;
    if (fromD > toD) return null;
    const days = (toD - fromD) / (24 * 60 * 60 * 1000);
    if (days > 365) return null;
    return {
        from: fromD.toISOString().slice(0, 10),
        to: toD.toISOString().slice(0, 10)
    };
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
        
        if (typeof db.query === 'function') {
            // Helper to get count from various DB result formats
            const getCount = (result) => {
                const row = Array.isArray(result[0]) ? result[0][0] : result[0];
                return row ? (row.count || row['COUNT(*)'] || 0) : 0;
            };

            const prodRes = await db.query('SELECT COUNT(*) as count FROM products');
            stats.totalProducts = getCount(prodRes);

            const userRes = await db.query('SELECT COUNT(*) as count FROM users');
            stats.totalUsers = getCount(userRes);

            const orderRes = await db.query('SELECT COUNT(*) as count, SUM(total) as revenue FROM orders');
            const oRow = Array.isArray(orderRes[0]) ? orderRes[0][0] : orderRes[0];
            stats.totalOrders = oRow ? (oRow.count || 0) : 0;
            stats.totalRevenue = oRow ? (oRow.revenue || 0) : 0;

            const pendRes = await db.query('SELECT COUNT(*) as count FROM orders WHERE LOWER(status) = "pending"');
            stats.pendingOrders = getCount(pendRes);
        }

        res.json(stats);
    } catch (e) {
        console.error('Stats API Error:', e);
        res.status(500).json({ error: 'Database error fetching stats' });
    }
});

// ---- Sales ----
router.get('/sales/monthly', async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
        if (year < 2000 || year > 2100 || month < 1 || month > 12) {
            return res.status(400).json({ error: 'Invalid year or month' });
        }
        const key = `sales-monthly-${year}-${month}`;
        let data = getCached(key);
        if (!data) {
            data = await db.getSalesMonthly(year, month);
            setCache(key, data);
        }
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/sales/annual', async (req, res) => {
    try {
        const years = (req.query.years || String(new Date().getFullYear())).split(',').map(y => parseInt(y.trim(), 10)).filter(y => y >= 2000 && y <= 2100).slice(0, 5);
        if (years.length === 0) years.push(new Date().getFullYear());
        const key = `sales-annual-${years.join('-')}`;
        let data = getCached(key);
        if (!data) {
            data = await db.getSalesAnnual(years);
            setCache(key, data);
        }
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/sales/daily', async (req, res) => {
    try {
        const range = parseRange(req);
        if (!range) return res.status(400).json({ error: 'Invalid date range' });
        const data = await db.getSalesDaily(range.from, range.to);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/sales/breakdown', async (req, res) => {
    try {
        const range = parseRange(req);
        if (!range) return res.status(400).json({ error: 'Invalid date range' });
        const groupBy = ['category', 'product'].includes(req.query.groupBy) ? req.query.groupBy : 'category';
        const data = await db.getSalesBreakdown(range.from, range.to, groupBy);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

// ---- Product performance ----
router.get('/products/top-sold', async (req, res) => {
    try {
        const range = parseRange(req);
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const data = await db.getTopSoldProducts(range ? range.from : null, range ? range.to : null, limit);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/products/low-stock', async (req, res) => {
    try {
        const threshold = Math.max(0, parseInt(req.query.threshold, 10) || 10);
        const data = await db.getLowStockProducts(threshold);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/products/out-of-stock', async (req, res) => {
    try {
        const data = await db.getOutOfStockProducts();
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/products/views', async (req, res) => {
    try {
        const range = parseRange(req);
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const data = await db.getProductViewsCount(range ? range.from : null, range ? range.to : null, limit);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/products/categories-performance', async (req, res) => {
    try {
        const range = parseRange(req);
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
        const data = await db.getTopCategoriesByRevenue(range ? range.from : null, range ? range.to : null, limit);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/products/inventory-value', async (req, res) => {
    try {
        const data = await db.getInventoryValue();
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

// ---- Customer analytics ----
router.get('/customers/total', async (req, res) => {
    try {
        const data = await db.getTotalCustomers();
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/customers/new', async (req, res) => {
    try {
        const range = parseRange(req);
        if (!range) return res.status(400).json({ error: 'Invalid date range' });
        const data = await db.getNewCustomers(range.from, range.to);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/customers/top', async (req, res) => {
    try {
        const range = parseRange(req);
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const data = await db.getTopCustomersBySpending(range ? range.from : null, range ? range.to : null, limit, page);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/customers/:id/orders', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ error: 'Invalid customer id' });
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const data = await db.getCustomerOrders(id, page, limit);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/customers/locations', async (req, res) => {
    try {
        const range = parseRange(req);
        const data = await db.getCustomerLocations(range ? range.from : null, range ? range.to : null);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

// ---- Search & behavior ----
router.get('/behavior/search-top', async (req, res) => {
    try {
        const range = parseRange(req);
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const data = await db.getSearchTop(range ? range.from : null, range ? range.to : null, limit);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/behavior/search-no-results', async (req, res) => {
    try {
        const range = parseRange(req);
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const data = await db.getSearchNoResults(range ? range.from : null, range ? range.to : null, limit);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

// ---- E-commerce metrics ----
router.get('/metrics/orders', async (req, res) => {
    try {
        const range = parseRange(req);
        const data = await db.getOrdersMetrics(range ? range.from : null, range ? range.to : null);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/metrics/refund-rate', async (req, res) => {
    try {
        const range = parseRange(req);
        const data = await db.getRefundRate(range ? range.from : null, range ? range.to : null);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/metrics/aov', async (req, res) => {
    try {
        const range = parseRange(req);
        const data = await db.getAOV(range ? range.from : null, range ? range.to : null);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

// ---- Real-time ----
router.get('/realtime/visitors', async (req, res) => {
    try {
        if (typeof db.getLiveVisitorsCount !== 'function') {
            return res.json({ count: 0 });
        }
        const data = await db.getLiveVisitorsCount();
        res.json(data);
    } catch (e) {
        res.json({ count: 0 });
    }
});

router.get('/realtime/orders', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
        const data = await db.getRecentOrdersForAnalytics(limit);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/realtime/activity', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
        const data = await db.getRecentActivityFeed(limit);
        res.json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Database error' });
    }
});

// ---- Export (CSV) ----
router.get('/sales/export', async (req, res) => {
    try {
        const range = parseRange(req);
        if (!range) return res.status(400).json({ error: 'Invalid date range' });
        const format = (req.query.format || 'csv').toLowerCase();
        if (format !== 'csv') {
            return res.status(400).json({ error: 'Only CSV export supported. Use format=csv' });
        }
        const daily = await db.getSalesDaily(range.from, range.to);
        const rows = [['Date', 'Revenue', 'Orders']];
        (daily.data || []).forEach(d => {
            rows.push([d.date, d.revenue, d.order_count]);
        });
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="sales-${range.from}-${range.to}.csv"`);
        res.send('\uFEFF' + csv);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Export failed' });
    }
});

module.exports = router;
