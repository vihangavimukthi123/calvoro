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

// View engine setup for payment forms
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({
    verify: function (req, res, buf) {
        try { req.rawBody = buf; } catch (_) { }
    }
}));
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'calvoro-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, 
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// Admin session gate
function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// API Routes
app.get('/api/promo-ticker', async (req, res) => {
    try {
        if (typeof db.getPromoTicker === 'function') {
            const d = await db.getPromoTicker();
            return res.json(d || { lines: [], durationSeconds: 22 });
        }
        res.json({ lines: ['FREE SHIPPING ON ORDERS OVER LKR 15,000'], durationSeconds: 22 });
    } catch (e) {
        res.json({ lines: ['FREE SHIPPING ON ORDERS OVER LKR 15,000'], durationSeconds: 22 });
    }
});

app.get('/api/admin/promo-ticker', requireAdmin, async (req, res) => {
    try {
        const d = typeof db.getPromoTicker === 'function' ? await db.getPromoTicker() : { lines: [], durationSeconds: 22 };
        res.json(d || { lines: [], durationSeconds: 22 });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load promo ticker' });
    }
});

// =====================================================================
// ---> Admin Dashboard Stats (අසාර්ථක නොවන ලෙස නිවැරදි කර ඇත) <---
// =====================================================================

// 1. Admin Dashboard Stats
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        // අසාර්ථක නොවන ලෙස දත්ත ලබාගන්නා ශ්‍රිතය (Bulletproof data extractor)
        const getVal = async (sql, key) => {
            try {
                const result = await db.query(sql);
                // Array ඇතුළේ Array එකක් ආවත් එය නිවැරදිව හඳුනාගනී (mysql2 ගැටලුව විසඳීම)
                const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
                return (rows && rows.length > 0 && rows[0][key]) ? Number(rows[0][key]) : 0;
            } catch(e) { return 0; }
        };

        res.json({
            totalProducts: await getVal('SELECT COUNT(*) as count FROM products', 'count'),
            totalUsers: await getVal('SELECT COUNT(*) as count FROM users', 'count'),
            totalOrders: await getVal('SELECT COUNT(*) as count FROM orders', 'count'),
            pendingOrders: await getVal('SELECT COUNT(*) as count FROM orders WHERE LOWER(status) = "pending"', 'count'),
            totalRevenue: await getVal('SELECT SUM(total) as sum FROM orders WHERE LOWER(status) = "completed"', 'sum')
        });
    } catch (e) {
        console.error('Master Stats Error:', e);
        res.json({ totalProducts: 0, totalUsers: 0, totalOrders: 0, pendingOrders: 0, totalRevenue: 0 }); 
    }
});

// 2. Admin Products (සියලුම භාණ්ඩ ලබාගැනීම)
app.get('/api/admin/products', requireAdmin, async (req, res) => {
    try {
        const products = await db.getAllProducts(true); // true = get all including drafts/out of stock
        res.json(products);
    } catch (e) {
        console.error('Admin Products Error:', e);
        res.status(500).json({ error: 'Failed to load admin products' });
    }
});

// 3. Admin Trending Products ලබාගැනීම
app.get('/api/admin/trending-products', requireAdmin, async (req, res) => {
    try {
        const trending = await db.query('SELECT product_id FROM trending_products ORDER BY display_order ASC');
        res.json({ productIds: trending.map(t => t.product_id) });
    } catch (e) {
        console.error('Trending Products Error:', e);
        res.json({ productIds: [] }); // වගුව නැතිනම් හිස් array එකක් යවයි
    }
});

// 4. Admin Trending Products අලුත් කිරීම
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
    } catch (e) {
        console.error('Update Trending Error:', e);
        res.status(500).json({ error: 'Failed to update trending products' });
    }
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

// Root API Endpoint
app.get('/api', (req, res) => {
    res.json({
        message: 'Calvoro API Server',
        version: '1.0.0',
        endpoints: {
            products: '/api/products',
            categories: '/api/categories',
            orders: '/api/orders',
            auth: '/api/auth',
            admin: '/admin'
        }
    });
});

// --- FRONTEND SERVING LOGIC ---

// 1. Static ෆයිල්ස් (CSS, JS, Images) ලබා දීම
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// 2. API Routes වලට අදාළ 404 Error Handler එක (අනිවාර්යයි)
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: "API endpoint not found or unauthorized" });
});

// 3. ඕනෑම ලින්ක් එකකට ගියහොත් (API හැර) index.html පෙන්වීම
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
(async () => {
    try {
        // DB Initializations
        if (typeof db.ensureUserVerificationColumns === 'function') await db.ensureUserVerificationColumns();
        if (typeof db.ensureAccountTables === 'function') await db.ensureAccountTables();
    } catch (e) {
        console.error('DB init warning:', e.message);
    }

    app.listen(PORT, () => {
        console.log(`Calvoro Backend Server Running on Port: ${PORT}`);
    });
})();
