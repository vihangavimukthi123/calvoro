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
const PORT = process.env.PORT || 3000;

// View engine setup for payment forms
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware - allow credentials for cross-origin API calls (e.g. Live Server on 5500)
app.use(cors({ origin: true, credentials: true }));
// Capture raw body for Stripe webhook verification (donations)
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
        secure: false, // set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Admin session gate (used below; promo routes registered first so they always match)
function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// Promo ticker — register immediately after session (before any other /api routers)
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

async function handlePromoTickerSave(req, res) {
    try {
        const lines = req.body && (req.body.lines || req.body.taglines);
        const durationSeconds = req.body && (req.body.durationSeconds || req.body.duration_seconds);
        if (typeof db.setPromoTicker === 'function') {
            const saved = await db.setPromoTicker({ lines, durationSeconds });
            return res.json(saved);
        }
        res.status(500).json({ error: 'Settings storage not available' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to save promo ticker' });
    }
}

app.put('/api/admin/promo-ticker', requireAdmin, handlePromoTickerSave);
app.post('/api/admin/promo-ticker', requireAdmin, handlePromoTickerSave);

// Hero carousel (admin) — same URL style as /api/admin/promo-ticker (avoids nested-router 404s)
app.get('/api/admin/carousel', requireAdmin, async (req, res) => {
    try {
        const slides = typeof db.getCarouselSlides === 'function' ? await db.getCarouselSlides() : [];
        res.json({ slides: Array.isArray(slides) ? slides : [] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to load carousel settings' });
    }
});

async function handleCarouselAdminSave(req, res) {
    try {
        const slides = req.body && req.body.slides;
        if (typeof db.setCarouselSlides !== 'function') {
            return res.status(500).json({ error: 'Carousel storage not available' });
        }
        const saved = await db.setCarouselSlides({ slides });
        res.json({ slides: Array.isArray(saved) ? saved : [] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to save carousel settings' });
    }
}

app.put('/api/admin/carousel', requireAdmin, handleCarouselAdminSave);
app.post('/api/admin/carousel', requireAdmin, handleCarouselAdminSave);

// Shipping Settings (Admin)
app.get('/api/admin/shipping-settings', requireAdmin, async (req, res) => {
    try {
        const raw = typeof db.getSiteSetting === 'function' ? await db.getSiteSetting('defaultCourier') : null;
        let courier = 'Standard Courier';
        try { const p = JSON.parse(raw); if(p && p.name) courier = p.name; } catch(e) {}
        res.json({ defaultCourier: courier || '' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to load shipping settings' });
    }
});

app.post('/api/admin/shipping-settings', requireAdmin, async (req, res) => {
    try {
        const courier = (req.body && req.body.defaultCourier) || 'Standard Courier';
        if (typeof db.setSiteSetting === 'function') {
            await db.setSiteSetting('defaultCourier', JSON.stringify({ name: courier }));
        }
        res.json({ success: true });
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to save shipping settings' });
    }
});

// Trending products (admin)
app.get('/api/admin/trending-products', requireAdmin, async (req, res) => {
    try {
        const ids = typeof db.getTrendingProductsSetting === 'function' ? await db.getTrendingProductsSetting() : [];
        res.json({ productIds: ids });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load trending products' });
    }
});

app.post('/api/admin/trending-products', requireAdmin, async (req, res) => {
    try {
        const ids = req.body && req.body.productIds;
        if (typeof db.setTrendingProductsSetting !== 'function') {
            return res.status(500).json({ error: 'Trending storage not available' });
        }
        const saved = await db.setTrendingProductsSetting(ids);
        res.json({ productIds: saved });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save trending products' });
    }
});

// Scroll promo popup + discount / seasonal engine
app.use('/api/promotions', promotionsPublicRouter);
app.get('/api/admin/promotions', requireAdmin, promotionsAdminList);
app.post('/api/admin/promotions', requireAdmin, uploadPromoImage, promotionsAdminCreate);
app.put('/api/admin/promotions/:id', requireAdmin, promotionsAdminUpdate);
app.post('/api/admin/promotions/:id/image', requireAdmin, uploadPromoImage, promotionsAdminReplaceImage);
app.delete('/api/admin/promotions/:id', requireAdmin, promotionsAdminDelete);

app.use('/api', discountEnginePublic);
app.use('/api/admin/discount-engine', discountEngineAdmin);

// Spec alias: GET /api/analytics/discount-performance
app.get('/api/analytics/discount-performance', requireAdmin, discountAnalyticsLimiter, async (req, res) => {
    try {
        const s = await db.getDiscountAnalyticsSummary();
        res.json(s);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to load discount analytics' });
    }
});

// Admin product list — full catalog + live stock (session cookie required; bypasses storefront-only filters)
app.get('/api/admin/products', requireAdmin, async (req, res) => {
    try {
        const products = await db.getAllProducts();
        res.json(Array.isArray(products) ? products : []);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to load products' });
    }
});

// API Routes (must be before static so /api/* is never served as files)
// Reviews recent - explicit route to avoid 404 (home page reviews section)
app.get('/api/reviews/recent', async (req, res) => {
    try {
        const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
        const reviews = await db.getRecentReviewsWithProducts(limit);
        res.json(reviews);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
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

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Video strip (home page 3 videos) — public + admin-managed
app.get('/api/video-strip', async (req, res) => {
    try {
        if (typeof db.getVideoStrip === 'function') {
            const items = await db.getVideoStrip();
            return res.json({ items: items || [] });
        }
        res.json({ items: [] });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load video strip' });
    }
});

app.get('/api/admin/video-strip', requireAdmin, async (req, res) => {
    try {
        const items = typeof db.getVideoStrip === 'function' ? await db.getVideoStrip() : [];
        res.json({ items: items || [] });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load video strip' });
    }
});

async function handleVideoStripSave(req, res) {
    try {
        const items = req.body && req.body.items;
        if (typeof db.setVideoStrip === 'function') {
            const saved = await db.setVideoStrip({ items });
            return res.json({ items: saved || [] });
        }
        res.status(500).json({ error: 'Settings storage not available' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to save video strip' });
    }
}

app.post('/api/admin/video-strip', requireAdmin, handleVideoStripSave);
app.put('/api/admin/video-strip', requireAdmin, handleVideoStripSave);

// Video strip admin upload (direct video file replace)
app.post('/api/admin/video-strip/videos', requireAdmin, (req, res, next) => {
    const { VIDEO_DIR } = require('./storagePaths');

    const storage = multer.diskStorage({
        destination: function (_req, _file, cb) {
            cb(null, VIDEO_DIR);
        },
        filename: function (_req, file, cb) {
            const ext = (path.extname(file.originalname) || '').toLowerCase();
            const safeExt = ext.match(/^\.(mp4|webm|mov)$/) ? ext : '.mp4';
            const prefix = 'video-strip-';
            cb(null, prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + safeExt);
        }
    });

    const upload = multer({
        storage,
        limits: { fileSize: 80 * 1024 * 1024 }, // 80MB
        fileFilter: function (_req, file, cb) {
            const ext = (path.extname(file.originalname) || '').toLowerCase();
            const ok = ext.match(/^\.(mp4|webm|mov)$/);
            if (!ok) return cb(new Error('Only video files (mp4, webm, mov) are allowed'));
            cb(null, true);
        }
    });

    const uploadFields = upload.fields([
        { name: 'video1', maxCount: 1 },
        { name: 'video2', maxCount: 1 },
        { name: 'video3', maxCount: 1 }
    ]);

    uploadFields(req, res, function (err) {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File too large. Max 80MB per video.' });
            }
            return res.status(400).json({ error: err.message || 'Upload failed' });
        }
        next();
    });
}, async (req, res) => {
    try {
        const label1 = (req.body && req.body.label1) ? String(req.body.label1) : '';
        const href1 = (req.body && req.body.href1) ? String(req.body.href1) : '';
        const label2 = (req.body && req.body.label2) ? String(req.body.label2) : '';
        const href2 = (req.body && req.body.href2) ? String(req.body.href2) : '';
        const label3 = (req.body && req.body.label3) ? String(req.body.label3) : '';
        const href3 = (req.body && req.body.href3) ? String(req.body.href3) : '';

        const existing1 = (req.body && req.body.videoSrc1) ? String(req.body.videoSrc1) : '';
        const existing2 = (req.body && req.body.videoSrc2) ? String(req.body.videoSrc2) : '';
        const existing3 = (req.body && req.body.videoSrc3) ? String(req.body.videoSrc3) : '';

        const file1 = req.files && req.files.video1 ? req.files.video1[0] : null;
        const file2 = req.files && req.files.video2 ? req.files.video2[0] : null;
        const file3 = req.files && req.files.video3 ? req.files.video3[0] : null;

        const videoSrc1 = file1 ? '/storage/videos/' + file1.filename : existing1;
        const videoSrc2 = file2 ? '/storage/videos/' + file2.filename : existing2;
        const videoSrc3 = file3 ? '/storage/videos/' + file3.filename : existing3;

        const items = [
            { label: label1, href: href1, videoSrc: videoSrc1 },
            { label: label2, href: href2, videoSrc: videoSrc2 },
            { label: label3, href: href3, videoSrc: videoSrc3 }
        ];

        const saved = typeof db.setVideoStrip === 'function' ? await db.setVideoStrip({ items }) : [];
        return res.json({ items: saved || [] });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to save uploaded video strip' });
    }
});

// Static files (after API so /api/* always hits backend)
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Storage: public access to uploaded files (storage:link concept)
// Same path as upload route so uploaded videos are served here
const { VIDEO_DIR } = require('./storagePaths');
app.use('/storage/videos', express.static(VIDEO_DIR));
const storagePublic = path.join(__dirname, 'storage', 'app', 'public');
app.use('/storage', express.static(storagePublic));

// IMPORTANT: If CSRF protection middleware is added in the future,
// make sure to exclude /api/payment/notify from CSRF verification
// to allow PayHere servers to send webhook notifications.

// Root endpoint
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

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server (ensure MySQL email-verification columns exist before listening)
(async () => {
    try {
        if (typeof db.ensureUserVerificationColumns === 'function') {
            await db.ensureUserVerificationColumns();
        }
        // Mark all existing users as verified (verification flow has been removed)
        if (typeof db.ensureAllUsersVerified === 'function') {
            await db.ensureAllUsersVerified();
        }
        if (typeof db.ensureAccountTables === 'function') {
            await db.ensureAccountTables();
        }
        if (typeof db.ensureCartTable === 'function') {
            await db.ensureCartTable();
        }
        if (typeof db.ensureWishlistTable === 'function') {
            await db.ensureWishlistTable();
        }
        if (typeof db.ensureGiftVoucherTables === 'function') {
            await db.ensureGiftVoucherTables();
        }
        if (typeof db.ensureAnalyticsTables === 'function') {
            await db.ensureAnalyticsTables();
        }
        if (typeof db.ensureDeliveryTables === 'function') {
            await db.ensureDeliveryTables();
        }
        if (typeof db.ensurePromotionsTable === 'function') {
            await db.ensurePromotionsTable();
        }
        if (typeof db.ensureDiscountEngineTables === 'function') {
            await db.ensureDiscountEngineTables();
        }
        // Initialize Email Worker
        try {
            const { isRedisReady } = require('./lib/redis');
            
            // We'll delay the worker init slightly to allow Redis to connect, 
            // but even if it doesn't, the worker handles its own retry strategy.
            setTimeout(() => {
                const { isRedisReady } = require('./lib/redis');
                if (!isRedisReady()) {
                    console.log('ℹ️ Redis not detected. System initialized in "Direct Mode". Emails will be sent synchronously.');
                }
                try {
                    require('./workers/emailWorker');
                    if (isRedisReady()) console.log('📬 Email Worker service is active');
                } catch (workerErr) {
                    console.warn('[Worker] Registration deferred:', workerErr.message);
                }
            }, 1000);
        } catch (workerErr) {
            console.error('Email Worker init warning:', workerErr.message);
        }
    } catch (e) {
        console.error('DB init warning:', e.message);
    }
    app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════╗
║   Calvoro Backend Server Running     ║
╠═══════════════════════════════════════╣
║   Port: ${PORT}                          ║
║   Admin: http://localhost:${PORT}/admin  ║
║   API: http://localhost:${PORT}/api      ║
╚═══════════════════════════════════════╝

Default Admin Credentials:
Username: admin
Password: admin123
    `);
    });
})();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    process.exit(0);
});
