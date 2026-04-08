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
const discountAnalyticsLimiter = createRateLimiter({ windowMs: 60_000, max: 200 });

const app = express();
const PORT = process.env.PORT || 8080; 

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ verify: function (req, res, buf) { try { req.rawBody = buf; } catch (_) { } } }));
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'calvoro-secret-key-change-this',
    resave: false, saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// API Routes
app.get('/api/promo-ticker', async (req, res) => {
    try {
        if (typeof db.getPromoTicker === 'function') {
            const d = await db.getPromoTicker();
            return res.json(d || { lines: [], durationSeconds: 22 });
        }
        res.json({ lines: ['FREE SHIPPING ON ORDERS OVER LKR 15,000'], durationSeconds: 22 });
    } catch (e) { res.json({ lines: ['FREE SHIPPING ON ORDERS OVER LKR 15,000'], durationSeconds: 22 }); }
});

app.get('/api/admin/promo-ticker', requireAdmin, async (req, res) => {
    try {
        const d = typeof db.getPromoTicker === 'function' ? await db.getPromoTicker() : { lines: [], durationSeconds: 22 };
        res.json(d || { lines: [], durationSeconds: 22 });
    } catch (e) { res.status(500).json({ error: 'Failed to load promo ticker' }); }
});

// =====================================================================
// ---> Admin Dashboard Stats (දත්ත ලැබෙන තුරු බලා සිටින නිවැරදි ක්‍රමය)
// =====================================================================

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
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

        const prod = await runQuery('SELECT COUNT(*) as count FROM products');
        const user = await runQuery('SELECT COUNT(*) as count FROM users');
        const order = await runQuery('SELECT COUNT(*) as count FROM orders');
        const pend = await runQuery('SELECT COUNT(*) as count FROM orders WHERE LOWER(status) = "pending"');
        const rev = await runQuery('SELECT SUM(total) as sum FROM orders WHERE LOWER(status) = "completed"');

        res.json({
            totalProducts: (prod[0] && prod[0].count) ? Number(prod[0].count) : 0,
            totalUsers: (user[0] && user[0].count) ? Number(user[0].count) : 0,
            totalOrders: (order[0] && order[0].count) ? Number(order[0].count) : 0,
            pendingOrders: (pend[0] && pend[0].count) ? Number(pend[0].count) : 0,
            totalRevenue: (rev[0] && rev[0].sum) ? Number(rev[0].sum) : 0
        });
    } catch (e) {
        res.json({ totalProducts: 0, totalUsers: 0, totalOrders: 0, pendingOrders: 0, totalRevenue: 0 }); 
    }
});

app.get('/api/admin/products', requireAdmin, async (req, res) => {
    try {
        const products = await db.getAllProducts(true);
        res.json(products);
    } catch (e) { res.status(500).json({ error: 'Failed to load products' }); }
});

app.get('/api/admin/trending-products', requireAdmin, async (req, res) => {
    try {
        const runQuery = (sql) => {
            return new Promise((resolve) => {
                const cb = (err, results) => resolve(Array.isArray(results) ? results : []);
                const result = db.query(sql, cb);
                if (result && typeof result.then === 'function') result.then(r=>cb(null,r)).catch(cb);
            });
        };
        const trending = await runQuery('SELECT product_id FROM trending_products ORDER BY display_order ASC');
        res.json({ productIds: trending.map(t => t.product_id) });
    } catch (e) { res.json({ productIds: [] }); }
});

app.post('/api/admin/trending-products', requireAdmin, async (req, res) => {
    try {
        const { productIds } = req.body;
        db.query('DELETE FROM trending_products', () => {
            if (productIds && productIds.length > 0) {
                productIds.forEach((id, i) => {
                    db.query('INSERT INTO trending_products (product_id, display_order) VALUES (?, ?)', [id, i + 1]);
                });
            }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// =====================================================================

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/cart', cartRouter);
app.use('/api/users', usersRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/carousel', carouselRouter);
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

app.get('/api', (req, res) => {
    res.json({ message: 'Calvoro API', version: '1.0.0' });
});

app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

app.use('/api/*', (req, res) => res.status(404).json({ error: "Not found" }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

app.use((err, req, res, next) => res.status(500).json({ error: 'Server error!' }));

(async () => {
    try {
        if (typeof db.ensureUserVerificationColumns === 'function') await db.ensureUserVerificationColumns();
        if (typeof db.ensureAccountTables === 'function') await db.ensureAccountTables();
    } catch (e) {}
    app.listen(PORT, () => console.log(`Backend Running on Port: ${PORT}`));
})();
