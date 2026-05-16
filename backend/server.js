require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const path = require('path');
const multer = require('multer');

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
const promoTickerRouter = require('./routes/promoTicker');
const videoStripRouter = require('./routes/videoStrip');
const chatRouter = require('./routes/chat');
const categoryImagesRouter = require('./routes/categoryImages');
const socketHandler = require('./lib/socketHandler');
const { UPLOAD_DIR, VIDEO_DIR } = require('./storagePaths');
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

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, credentials: true }
});
const PORT = process.env.PORT || 8080;

socketHandler(io);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ verify: (req, res, buf) => { try { req.rawBody = buf; } catch (_) { } } }));
app.use(express.urlencoded({ extended: true }));

const sessionStore = new MySQLStore({}, db.pool);

app.use(session({
    key: 'calvoro_session',
    secret: process.env.SESSION_SECRET || 'calvoro-secret-key',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const requirePermission = require('./middleware/requirePermission');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// === Admin Stats API (Dashboard) ===
// ✅ FIXED: requirePermission('dashboard') removed
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
            totalProducts: p[0]?.count    || 0,
            totalUsers:    u[0]?.count    || 0,
            totalOrders:   o[0]?.count    || 0,
            pendingOrders: pend[0]?.count || 0,
            totalRevenue:  rev[0]?.sum    || 0
        });
    } catch (e) {
        res.json({
            totalProducts: 0,
            totalUsers:    0,
            totalOrders:   0,
            pendingOrders: 0,
            totalRevenue:  0
        });
    }
});

// === Admin Password Change (Settings) ===
app.post('/api/admin/change-password', requireAdmin, requirePermission('settings'), async (req, res) => {
    try {
        const bcrypt = require('bcrypt');
        const { currentPassword, newUsername, newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }
        const admin = req.session.admin;
        const [rows] = await db.pool.query('SELECT * FROM admin_users WHERE id = ?', [admin.id || 1]);
        if (!rows || !rows[0]) return res.status(404).json({ error: 'Admin not found' });

        const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

        const newHash = await bcrypt.hash(newPassword, 10);
        const updates = ['password_hash = ?'];
        const values = [newHash];

        if (newUsername && newUsername.trim()) {
            updates.push('username = ?');
            values.push(newUsername.trim());
        }

        values.push(rows[0].id);
        await db.pool.query(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`, values);

        if (newUsername && newUsername.trim()) {
            req.session.admin.username = newUsername.trim();
        }

        res.json({ success: true, message: 'Credentials updated successfully' });
    } catch (e) {
        console.error('Password change error:', e.message);
        res.status(500).json({ error: 'Failed to update credentials' });
    }
});

// === Admin Products & Trending ===
function normalizeAdminMediaUrl(url) {
    if (typeof url !== 'string') return url;
    return url.trim().replace(/\\/g, '/');
}

function normalizeAdminProductMedia(product) {
    if (!product || typeof product !== 'object') return product;
    const p = { ...product };

    p.images = Array.isArray(p.images) ? p.images.map(normalizeAdminMediaUrl).filter(Boolean) : [];

    const inColorImages = p.color_images && typeof p.color_images === 'object' ? p.color_images : {};
    p.color_images = {};
    Object.keys(inColorImages).forEach((key) => {
        const val = inColorImages[key];
        if (typeof val === 'string') {
            p.color_images[key] = normalizeAdminMediaUrl(val);
        } else if (val && typeof val === 'object') {
            p.color_images[key] = {
                main: normalizeAdminMediaUrl(val.main || ''),
                subs: Array.isArray(val.subs) ? val.subs.map(normalizeAdminMediaUrl).filter(Boolean) : [],
                video: normalizeAdminMediaUrl(val.video || '')
            };
        }
    });

    const inColorVideos = p.color_videos && typeof p.color_videos === 'object' ? p.color_videos : {};
    p.color_videos = {};
    Object.keys(inColorVideos).forEach((key) => {
        const normalized = normalizeAdminMediaUrl(inColorVideos[key]);
        if (normalized) p.color_videos[key] = normalized;
    });

    if (Array.isArray(p.media)) {
        p.media = p.media.map((m) => ({
            ...m,
            url: normalizeAdminMediaUrl(m && m.url),
            hover_video_url: normalizeAdminMediaUrl(m && m.hover_video_url)
        }));
    } else {
        p.media = [];
    }

    if (!p.image_url) {
        const firstColor = Object.values(p.color_images)[0];
        if (typeof firstColor === 'string') {
            p.image_url = p.images[0] || firstColor || '';
        } else if (firstColor && typeof firstColor === 'object') {
            p.image_url = p.images[0] || firstColor.main || (firstColor.subs && firstColor.subs[0]) || '';
        } else {
            p.image_url = p.images[0] || '';
        }
    }
    
    p.image_url = normalizeAdminMediaUrl(p.image_url || '');
    p.size_guide_url = normalizeAdminMediaUrl(p.size_guide_url || '');
    return p;
}

app.get('/api/admin/products', requireAdmin, requirePermission('products'), async (req, res) => {
    try {
        const products = await db.getAllProducts(true);
        res.json((products || []).map(normalizeAdminProductMedia));
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/admin/trending-products', requireAdmin, requirePermission('products'), async (req, res) => {
    try {
        const productIds = typeof db.getTrendingProductsSetting === 'function' ? await db.getTrendingProductsSetting() : [];
        res.json({ productIds });
    } catch (e) { res.json({ productIds: [] }); }
});

app.post('/api/admin/trending-products', requireAdmin, requirePermission('products'), async (req, res) => {
    try {
        const { productIds } = req.body;
        if (typeof db.setTrendingProductsSetting === 'function') {
            await db.setTrendingProductsSetting(productIds);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// === Delivery Settings ===
app.get('/api/admin/delivery-settings', requireAdmin, requirePermission('settings'), async (req, res) => {
    try {
        const threshold = await db.getSiteSetting('free_shipping_threshold');
        const charge = await db.getSiteSetting('delivery_charge');
        res.json({
            freeShippingThreshold: Number(threshold) || 10000,
            deliveryCharge: Number(charge) || 500
        });
    } catch (e) {
        res.json({ freeShippingThreshold: 10000, deliveryCharge: 500 });
    }
});

app.post('/api/admin/delivery-settings', requireAdmin, requirePermission('settings'), async (req, res) => {
    try {
        const { freeShippingThreshold, deliveryCharge } = req.body;
        await db.setSiteSetting('free_shipping_threshold', freeShippingThreshold || '15000');
        await db.setSiteSetting('delivery_charge', deliveryCharge || '500');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save' });
    }
});

// Public Delivery Settings
app.get('/api/site-settings/delivery', async (req, res) => {
    try {
        const threshold = await db.getSiteSetting('free_shipping_threshold');
        const charge = await db.getSiteSetting('delivery_charge');
        res.json({
            freeShippingThreshold: Number(threshold) || 10000,
            deliveryCharge: Number(charge) || 500
        });
    } catch (e) {
        res.json({ freeShippingThreshold: 10000, deliveryCharge: 500 });
    }
});

// === Standard Routes ===
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/orders', ordersRouter);

// ✅ FIXED: Admin Orders Route
app.use('/api/admin/orders', requireAdmin, requirePermission('orders'), ordersRouter);

app.use('/api/cart', cartRouter);
app.use('/api/users', usersRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/carousel', carouselRouter);
app.use('/api/admin/carousel', requireAdmin, requirePermission('products'), carouselRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/account', accountRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/vouchers', vouchersRouter);
app.use('/api/newsletter', newsletterRouter);
app.use('/api/admin/analytics', requireAdmin, requirePermission('reports'), analyticsRouter);
app.use('/api/delivery', deliveryRouter);
app.use('/api/donations', donationsRouter);
app.use('/api/email', emailRouter);
app.use('/api/admin/promo-ticker', requireAdmin, requirePermission('products'), promoTickerRouter);
app.use('/api/admin/video-strip', requireAdmin, requirePermission('products'), videoStripRouter);
app.use('/api/admin/chat', requireAdmin, requirePermission('chat'), chatRouter);
app.use('/api/category-images', categoryImagesRouter);

// === Promotions (Public) ===
app.use('/api/promotions', promotionsPublicRouter);

// === Promotions (Admin) ===
app.get('/api/admin/promotions', requireAdmin, requirePermission('products'), promotionsAdminList);
app.post('/api/admin/promotions', requireAdmin, requirePermission('products'), uploadPromoImage, promotionsAdminCreate);
app.put('/api/admin/promotions/:id', requireAdmin, requirePermission('products'), promotionsAdminUpdate);
app.post('/api/admin/promotions/:id/image', requireAdmin, requirePermission('products'), uploadPromoImage, promotionsAdminReplaceImage);
app.delete('/api/admin/promotions/:id', requireAdmin, requirePermission('products'), promotionsAdminDelete);

// === Public Routes (Storefront) ===
app.get('/api/promo-ticker', async (req, res) => {
    try {
        const data = await db.getPromoTicker();
        res.json(data);
    } catch (e) {
        res.json({ lines: [], durationSeconds: 22 });
    }
});

app.get('/api/video-strip', async (req, res) => {
    try {
        const data = await db.getVideoStrip();
        res.json({ items: data });
    } catch (e) {
        res.json({ items: [] });
    }
});

app.get('/api/offers/active', async (req, res) => {
    try {
        const data = await db.getActiveOffersForStorefront();
        res.json(data);
    } catch (e) {
        res.json({ campaigns: [], rules: [] });
    }
});

// ✅ FIXED: /api/admin/offers → /api/admin/discount-engine
app.use('/api/admin/discount-engine', requireAdmin, requirePermission('products'), discountEngineAdmin);

app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/storage/videos', express.static(VIDEO_DIR));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// === Diagnostic Logging ===
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.log(`[API Request] ${req.method} ${req.path} - Content-Type: ${req.get('Content-Type')}`);
    }
    next();
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

(async () => {
    try {
        if (typeof db.ensureUserVerificationColumns === 'function') await db.ensureUserVerificationColumns();
        if (typeof db.ensureAccountTables === 'function') await db.ensureAccountTables();
        if (typeof db.ensureSiteSettingsTable === 'function') await db.ensureSiteSettingsTable();
        if (typeof db.ensureChatTables === 'function') await db.ensureChatTables();
        if (typeof db.normalizeProductMediaData === 'function') {
            const mediaFix = await db.normalizeProductMediaData();
            if (mediaFix && mediaFix.changed) {
                console.log(`Normalized product media for ${mediaFix.changed}/${mediaFix.total} product(s)`);
            }
        }

        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS trending_products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                display_order INT NOT NULL DEFAULT 0,
                INDEX idx_product_id (product_id)
            )
        `);
    } catch (e) {
        console.error('Startup table init error:', e.message);
    }

    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
