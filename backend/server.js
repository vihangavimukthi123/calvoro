require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');

const session = require('express-session');
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

app.use(session({
    secret: process.env.SESSION_SECRET || 'calvoro-secret-key',
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
app.get('/api/admin/stats', requireAdmin, requirePermission('dashboard'), async (req, res) => {
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

// === Admin Products & Trending (Products) ===
app.get('/api/admin/products', requireAdmin, requirePermission('products'), async (req, res) => {
    try {
        const products = await db.getAllProducts(true);
        res.json(products);
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/admin/trending-products', requireAdmin, requirePermission('products'), async (req, res) => {
    try {
        const [rows] = await db.pool.query('SELECT product_id FROM trending_products ORDER BY display_order ASC');
        res.json({ productIds: (rows || []).map(t => t.product_id) });
    } catch (e) { res.json({ productIds: [] }); }
});

app.post('/api/admin/trending-products', requireAdmin, requirePermission('products'), async (req, res) => {
    try {
        const { productIds } = req.body;
        await db.pool.query('DELETE FROM trending_products');
        if (productIds && productIds.length > 0) {
            for (let i = 0; i < productIds.length; i++) {
                await db.pool.query('INSERT INTO trending_products (product_id, display_order) VALUES (?, ?)', [productIds[i], i + 1]);
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// === Shipping Settings (Settings) ===
app.get('/api/admin/shipping-settings', requireAdmin, requirePermission('settings'), async (req, res) => {
    try {
        const val = await db.getSiteSetting('default_courier');
        res.json({ defaultCourier: val || 'Standard Courier' });
    } catch (e) {
        res.json({ defaultCourier: 'Standard Courier' });
    }
});

app.post('/api/admin/shipping-settings', requireAdmin, requirePermission('settings'), async (req, res) => {
    try {
        const { defaultCourier } = req.body;
        await db.setSiteSetting('default_courier', defaultCourier || '');
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

// === Promotions (Public - Storefront) ===
app.use('/api/promotions', promotionsPublicRouter);

// === Promotions (Admin) ===
app.get('/api/admin/promotions', requireAdmin, requirePermission('products'), promotionsAdminList);
app.post('/api/admin/promotions', requireAdmin, requirePermission('products'), uploadPromoImage, promotionsAdminCreate);
app.put('/api/admin/promotions/:id', requireAdmin, requirePermission('products'), promotionsAdminUpdate);
app.post('/api/admin/promotions/:id/image', requireAdmin, requirePermission('products'), uploadPromoImage, promotionsAdminReplaceImage);
app.delete('/api/admin/promotions/:id', requireAdmin, requirePermission('products'), promotionsAdminDelete);

// Public routes (storefront - no admin auth required)
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// --- Diagnostic Logging ---
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.log(`[API Request] ${req.method} ${req.path}`);
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

        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS trending_products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                display_order INT NOT NULL DEFAULT 0,
                INDEX idx_product_id (product_id)
            )
        `);
    } catch (e) { console.error('Startup table init error:', e.message); }
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
