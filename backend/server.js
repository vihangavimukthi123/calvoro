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
const PORT = process.env.PORT || 8080; // ලොග් වල පෙන්වන පරිදි 8080 භාවිතා කරයි

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

// --- FRONTEND SERVING LOGIC (වැදගත්ම කොටස) ---

// 1. Static ෆයිල්ස් (CSS, JS, Images) ලබා දීම
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// 2. API Routes වලට අදාළ 404 Error Handler එක (අනිවාර්යයි)
// මෙයින් සහතික කරන්නේ /api වලින් එන වැරදි රික්වෙස්ට් වලට HTML පිටුවක් වෙනුවට JSON error එකක් යවන බවයි.
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
        // ... (අනෙකුත් DB init කොටස් මෙහි තිබිය හැක)
    } catch (e) {
        console.error('DB init warning:', e.message);
    }

    app.listen(PORT, () => {
        console.log(`Calvoro Backend Server Running on Port: ${PORT}`);
    });
})();
