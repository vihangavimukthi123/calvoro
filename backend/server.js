const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const db = require('./db');
const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const ordersRouter = require('./routes/orders');
const authRouter = require('./routes/auth');
const cartRouter = require('./routes/cart');
const usersRouter = require('./routes/users');
const paymentRouter = require('./routes/payment');
const carouselRouter = require('./routes/carousel');
const reviewsRouter = require('./routes/reviews');
const uploadRouter = require('./routes/upload');
const adminUsersRouter = require('./routes/adminUsers');
const accountRouter = require('./routes/account');
const wishlistRouter = require('./routes/wishlist');
const vouchersRouter = require('./routes/vouchers');
const newsletterRouter = require('./routes/newsletter');
const analyticsRouter = require('./routes/analytics');
const deliveryRouter = require('./routes/delivery');
const donationsRouter = require('./routes/donations');
const emailRouter = require('./routes/email');
const {
    publicRouter: promotionsPublicRouter,
    uploadPromoImage,
    adminList: promotionsAdminList,
    adminCreate: promotionsAdminCreate,
    adminUpdate: promotionsAdminUpdate,
    adminReplaceImage: promotionsAdminReplaceImage,
    adminDelete: promotionsAdminDelete
} = require('./routes/promotions');
const { router: discountEngineAdmin, publicRouter: discountEnginePublic } = require('./routes/discountEngine');
const { createRateLimiter } = require('./lib/adminRateLimit');

const app = express();
const PORT = process.env.PORT || 8080;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ verify: (req, res, buf) => { try { req.rawBody = buf; } catch (_) { } } }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'calvoro-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// === Admin Stats API ===
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const runQ = async (sql) => {
            try {
                const [rows] = await db.pool.query(sql);
                return Array.isArray(rows) ? rows : [];
            } catch (e) {
                console.error('Stats query error:', e.message);
                return [];
            }
        };

        const [p, u, o, pend, rev] = await Promise.all([
            runQ('SELECT COUNT(*) as count FROM products'),
            runQ('SELECT COUNT(*) as count FROM users'),
            runQ('SELECT COUNT(*) as count FROM orders'),
            runQ('SELECT COUNT(*) as count FROM orders WHERE LOWER(status) = "pending"'),
            runQ('SELECT COALESCE(SUM(total),0) as sum FROM orders')
        ]);

        res.json({
            totalProducts: p[0]?.count || 0,
            totalUsers: u[0]?.count || 0,
            totalOrders: o[0]?.count || 0,
            pendingOrders: pend[0]?.count || 0,
            totalRevenue: rev[0]?.sum || 0
        });
    } catch (e) {
        res.json({ totalProducts: 0, totalUsers: 0, totalOrders: 0, pendingOrders: 0, totalRevenue: 0 });
    }
});

// === Admin Products & Trending ===
app.get('/api/admin/products', requireAdmin, async (req, res) => {
    try {
        const products = await db.getAllProducts(true);
        res.json(products);
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/admin/trending-products', requireAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT product_id FROM trending_products ORDER BY display_order ASC');
        const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
        res.json({ productIds: rows.map(t => t.product_id) });
    } catch (e) { res.json({ productIds: [] }); }
});

app.post('/api/admin/trending-products', requireAdmin, async (req, res) => {
    try {
        const { productIds } = req.body;
        await db.query('DELETE FROM trending_products');
        if (productIds && productIds.length > 0) {
            for (let i = 0; i < productIds.length; i++) {
                await db.query('INSERT INTO trending_products (product_id, display_order) VALUES (?, ?)', [productIds[i], i + 1]);
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// === Shipping Settings ===
app.get('/api/admin/shipping-settings', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.pool.query(
            "SELECT setting_value FROM site_settings WHERE setting_key = 'default_courier' LIMIT 1"
        );
        const val = rows && rows[0] ? rows[0].setting_value : 'Standard Courier';
        res.json({ defaultCourier: val });
    } catch (e) {
        res.json({ defaultCourier: 'Standard Courier' });
    }
});

app.post('/api/admin/shipping-settings', requireAdmin, async (req, res) => {
    try {
        const { defaultCourier } = req.body;
        await db.pool.query(
            "INSERT INTO site_settings (setting_key, setting_value) VALUES ('default_courier', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
            [defaultCourier || '', defaultCourier || '']
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save' });
    }
});

// === Standard Routes ===
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/cart', cartRouter);
app.use('/api/users', usersRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/carousel', carouselRouter);
app.use('/api/admin/carousel', requireAdmin, carouselRouter); // FIX: settings.html uses /api/admin/carousel
app.use('/api/reviews', reviewsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/account', accountRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/vouchers', vouchersRouter);
app.use('/api/newsletter', newsletterRouter);
app.use('/api/admin/analytics', analyticsRouter);
app.use('/api/delivery', deliveryRouter);
app.use('/api/donations', donationsRouter);
app.use('/api/email', emailRouter);

app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

(async () => {
    try {
        if (typeof db.ensureUserVerificationColumns === 'function') await db.ensureUserVerificationColumns();
        if (typeof db.ensureAccountTables === 'function') await db.ensureAccountTables();

        // FIX: site_settings table එක නැත්නම් හදනවා
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS site_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value TEXT NOT NULL DEFAULT ''
            )
        `);
    } catch (e) { }
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
