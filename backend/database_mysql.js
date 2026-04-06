const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { computeFinalPricing } = require('./lib/pricingEngine');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'calvoro_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function parseJson(val) {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch (_) { return val; }
    }
    return val;
}

class CalvoroMySQLDatabase {
    constructor() {
        this.pool = pool;
        this._colorImagesEnsured = false;
        this._colorVideosEnsured = false;
        this._mediaEnsured = false;
        this._siteSettingsEnsured = false;
        this._donationsEnsured = false;
        this._promotionsEnsured = false;
        this._discountEngineEnsured = false;
        console.log('MySQL database connection pool initialized');
        this.initializeAdmin();
    }

    async ensureDonationsTable() {
        if (this._donationsEnsured) return;
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS donations (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    amount DECIMAL(12,2) NOT NULL,
                    currency VARCHAR(10) NOT NULL DEFAULT 'LKR',
                    payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
                    stripe_session_id VARCHAR(255) NULL,
                    stripe_payment_intent VARCHAR(255) NULL,
                    reference_text VARCHAR(512) NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_stripe_session (stripe_session_id),
                    INDEX idx_email (email),
                    INDEX idx_status (payment_status),
                    INDEX idx_created_at (created_at)
                )
            `);
            // Add column if it doesn't exist (for existing tables)
            try {
                await this.pool.query('ALTER TABLE donations ADD COLUMN reference_text VARCHAR(512) NULL');
            } catch(e) { }

            this._donationsEnsured = true;
        } catch (e) {
            console.error('ensureDonationsTable:', e.message);
        }
    }

    async createDonation(donation) {
        await this.ensureDonationsTable();
        const [result] = await this.pool.query(
            `INSERT INTO donations (name, email, amount, currency, payment_status, stripe_session_id, stripe_payment_intent, reference_text)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                donation.name || '',
                donation.email || '',
                Number(donation.amount) || 0,
                donation.currency || 'LKR',
                donation.payment_status || 'pending',
                donation.stripe_session_id || null,
                donation.stripe_payment_intent || null,
                donation.reference_text || null
            ]
        );
        return { lastInsertRowid: result.insertId };
    }

    async updateDonationByStripeSessionId(sessionId, patch) {
        await this.ensureDonationsTable();
        const fields = [];
        const vals = [];
        const allowed = ['payment_status', 'stripe_payment_intent', 'name', 'email', 'amount', 'currency'];
        for (const k of allowed) {
            if (patch[k] !== undefined) {
                fields.push(`${k} = ?`);
                vals.push(patch[k]);
            }
        }
        if (fields.length === 0) return { changes: 0 };
        vals.push(sessionId);
        const [result] = await this.pool.query(
            `UPDATE donations SET ${fields.join(', ')} WHERE stripe_session_id = ?`,
            vals
        );
        return { changes: result.affectedRows };
    }

    async getDonationByStripeSessionId(sessionId) {
        await this.ensureDonationsTable();
        const [rows] = await this.pool.query('SELECT * FROM donations WHERE stripe_session_id = ? LIMIT 1', [sessionId]);
        if (!rows || rows.length === 0) return null;
        const r = rows[0];
        return {
            id: r.id,
            name: r.name,
            email: r.email,
            amount: Number(r.amount),
            currency: r.currency,
            payment_status: r.payment_status,
            stripe_session_id: r.stripe_session_id,
            stripe_payment_intent: r.stripe_payment_intent,
            created_at: r.created_at,
            updated_at: r.updated_at
        };
    }

    async getDonationsForAdmin(limit = 200) {
        await this.ensureDonationsTable();
        const n = Math.min(1000, Math.max(1, Number(limit) || 200));
        const [rows] = await this.pool.query('SELECT * FROM donations ORDER BY created_at DESC LIMIT ?', [n]);
        return rows.map(r => ({
            id: r.id,
            name: r.name,
            email: r.email,
            amount: Number(r.amount),
            currency: r.currency,
            payment_status: r.payment_status,
            stripe_session_id: r.stripe_session_id,
            stripe_payment_intent: r.stripe_payment_intent,
            created_at: r.created_at,
            updated_at: r.updated_at
        }));
    }

    async updateDonationById(id, patch) {
        await this.ensureDonationsTable();
        const fields = [];
        const vals = [];
        const allowed = ['payment_status', 'stripe_session_id', 'stripe_payment_intent', 'name', 'email', 'amount', 'currency'];
        for (const k of allowed) {
            if (patch[k] !== undefined) {
                fields.push(`${k} = ?`);
                vals.push(patch[k]);
            }
        }
        if (fields.length === 0) return { changes: 0 };
        vals.push(id);
        const [result] = await this.pool.query(
            `UPDATE donations SET ${fields.join(', ')} WHERE id = ?`,
            vals
        );
        return { changes: result.affectedRows };
    }

    async ensureSiteSettingsTable() {
        if (this._siteSettingsEnsured) return;
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS site_settings (
                    \`key\` VARCHAR(191) PRIMARY KEY,
                    \`value\` TEXT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            this._siteSettingsEnsured = true;
        } catch (e) {
            console.error('ensureSiteSettingsTable:', e.message);
        }
    }

    async getSiteSetting(key) {
        await this.ensureSiteSettingsTable();
        const [rows] = await this.pool.query('SELECT `value` FROM site_settings WHERE `key` = ? LIMIT 1', [key]);
        if (!rows || rows.length === 0) return null;
        return rows[0].value;
    }

    async setSiteSetting(key, value) {
        await this.ensureSiteSettingsTable();
        await this.pool.query(
            'INSERT INTO site_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
            [key, value]
        );
    }

    async getPromoTicker() {
        const raw = await this.getSiteSetting('promoTicker');
        if (!raw) {
            return { lines: ['FREE SHIPPING ON ORDERS OVER LKR 15,000'], durationSeconds: 22 };
        }
        try {
            const parsed = JSON.parse(raw);
            return {
                lines: Array.isArray(parsed.lines) ? parsed.lines : [],
                durationSeconds: Number(parsed.durationSeconds) || 22
            };
        } catch (_) {
            return { lines: ['FREE SHIPPING ON ORDERS OVER LKR 15,000'], durationSeconds: 22 };
        }
    }

    async setPromoTicker({ lines, durationSeconds }) {
        const cleaned = Array.isArray(lines) ? lines
            .map(s => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 30) : [];
        const dur = Math.max(8, Math.min(120, Number(durationSeconds) || 22));
        const payload = JSON.stringify({ lines: cleaned, durationSeconds: dur });
        await this.setSiteSetting('promoTicker', payload);
        return { lines: cleaned, durationSeconds: dur };
    }

    // ---- Hero carousel (home page) ----
    async getCarouselSlides() {
        const raw = await this.getSiteSetting('carousel');
        if (!raw) {
            return [
                {
                    id: 1,
                    title: 'NEW ARRIVALS',
                    subtitle: 'Discover the latest collection',
                    image_url: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1600&h=600&fit=crop',
                    link_url: '/women.html',
                    button_text: 'SHOP NOW',
                    display_order: 0,
                    is_active: true
                },
                {
                    id: 2,
                    title: 'SUMMER COLLECTION',
                    subtitle: 'Light and comfortable styles',
                    image_url: 'https://images.unsplash.com/photo-1483181957632-8bda974cbc91?w=1600&h=600&fit=crop',
                    link_url: '/men.html',
                    button_text: 'EXPLORE',
                    display_order: 1,
                    is_active: true
                },
                {
                    id: 3,
                    title: 'GIFT VOUCHERS',
                    subtitle: 'The perfect gift for any occasion',
                    image_url: 'https://images.unsplash.com/photo-1513094735237-8f2714d57c13?w=1600&h=600&fit=crop',
                    link_url: '/gifts.html',
                    button_text: 'BUY NOW',
                    display_order: 2,
                    is_active: true
                }
            ];
        }
        try {
            const parsed = JSON.parse(raw);
            const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
            return slides
                .map((slide, index) => ({
                    id: index + 1,
                    title: slide && slide.title != null ? String(slide.title).slice(0, 120).trim() : '',
                    subtitle: slide && slide.subtitle != null ? String(slide.subtitle).slice(0, 200).trim() : '',
                    image_url: slide && slide.image_url != null ? String(slide.image_url).slice(0, 1200).trim() : '',
                    link_url: slide && slide.link_url != null ? String(slide.link_url).slice(0, 500).trim() : '',
                    button_text: slide && slide.button_text != null ? String(slide.button_text).slice(0, 80).trim() : '',
                    display_order: Number(slide && slide.display_order != null ? slide.display_order : index) || 0,
                    is_active: slide && slide.is_active !== undefined ? !!slide.is_active : true
                }))
                .filter(slide => slide.image_url)
                .sort((a, b) => a.display_order - b.display_order);
        } catch (_) {
            return [];
        }
    }

    async setCarouselSlides({ slides }) {
        const cleaned = Array.isArray(slides) ? slides
            .map((slide, index) => ({
                title: slide && slide.title != null ? String(slide.title).replace(/\s+/g, ' ').trim().slice(0, 120) : '',
                subtitle: slide && slide.subtitle != null ? String(slide.subtitle).replace(/\s+/g, ' ').trim().slice(0, 200) : '',
                image_url: slide && slide.image_url != null ? String(slide.image_url).trim().slice(0, 1200) : '',
                link_url: slide && slide.link_url != null ? String(slide.link_url).trim().slice(0, 500) : '',
                button_text: slide && slide.button_text != null ? String(slide.button_text).replace(/\s+/g, ' ').trim().slice(0, 80) : '',
                display_order: Number(slide && slide.display_order != null ? slide.display_order : index) || index,
                is_active: slide && slide.is_active !== undefined ? !!slide.is_active : true
            }))
            .filter(slide => slide.image_url)
            .slice(0, 12) : [];
        await this.setSiteSetting('carousel', JSON.stringify({ slides: cleaned }));
        return this.getCarouselSlides();
    }

    // ---- Video strip (home page 3 videos) ----
    async getVideoStrip() {
        const raw = await this.getSiteSetting('videoStrip');
        if (!raw) {
            return [
                {
                    label: 'SHOP WOMEN',
                    href: 'women.html',
                    videoSrc: 'videos/women.mp4'
                },
                {
                    label: 'SHOP MEN',
                    href: 'men.html',
                    videoSrc: 'videos/men.mp4'
                },
                {
                    label: 'GIFT VOUCHERS',
                    href: 'gifts.html',
                    videoSrc: 'videos/gifts.mp4'
                }
            ];
        }
        try {
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed.items) ? parsed.items : [];
            const out = items.slice(0, 3).map(it => ({
                label: it && it.label != null ? String(it.label).slice(0, 80) : '',
                href: it && it.href != null ? String(it.href).slice(0, 250) : '',
                videoSrc: it && it.videoSrc != null ? String(it.videoSrc).slice(0, 500) : ''
            }));
            while (out.length < 3) out.push({ label: '', href: '', videoSrc: '' });
            return out;
        } catch (_) {
            return [
                { label: 'SHOP WOMEN', href: 'women.html', videoSrc: 'videos/women.mp4' },
                { label: 'SHOP MEN', href: 'men.html', videoSrc: 'videos/men.mp4' },
                { label: 'GIFT VOUCHERS', href: 'gifts.html', videoSrc: 'videos/gifts.mp4' }
            ];
        }
    }

    async setVideoStrip({ items }) {
        const cleaned = Array.isArray(items) ? items
            .map(it => ({
                label: it && it.label != null ? String(it.label).replace(/\s+/g, ' ').trim().slice(0, 80) : '',
                href: it && it.href != null ? String(it.href).replace(/\s+/g, ' ').trim().slice(0, 250) : '',
                videoSrc: it && it.videoSrc != null ? String(it.videoSrc).replace(/\s+/g, ' ').trim().slice(0, 500) : ''
            }))
            .filter(it => it.href || it.videoSrc || it.label)
            .slice(0, 3) : [];

        while (cleaned.length < 3) cleaned.push({ label: '', href: '', videoSrc: '' });

        await this.setSiteSetting('videoStrip', JSON.stringify({ items: cleaned }));
        return this.getVideoStrip();
    }

    // ---- Trending Products (Home Page) ----
    async getTrendingProductsSetting() {
        const raw = await this.getSiteSetting('trendingProducts');
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    async setTrendingProductsSetting(productIds) {
        const cleaned = Array.isArray(productIds) ? productIds.map(id => parseInt(id)).filter(id => !isNaN(id)) : [];
        await this.setSiteSetting('trendingProducts', JSON.stringify(cleaned));
        return cleaned;
    }

    // ---- Newsletter Subscribers ----
    async getNewsletterSubscribers() {
        // First try to get from the JSON file if used, but let's also support a DB table if it exists
        // Given the existing routes/users.js uses a JSON file, we'll read that
        const path = require('path');
        const fs = require('fs');
        const NEWSLETTER_FILE = path.join(__dirname, '..', 'data', 'newsletter_subscribers.json');
        try {
            if (fs.existsSync(NEWSLETTER_FILE)) {
                const list = JSON.parse(fs.readFileSync(NEWSLETTER_FILE, 'utf8'));
                return list.map(email => ({ email }));
            }
        } catch (e) {
            console.error('Error reading newsletter file:', e);
        }
        return [];
    }

    async initializeAdmin() {
        try {
            const [rows] = await this.pool.query('SELECT * FROM admin_users WHERE username = ?', ['admin']);
            if (rows.length === 0) {
                const hash = await bcrypt.hash('admin123', 10);
                await this.pool.query(
                    'INSERT INTO admin_users (username, password_hash, email) VALUES (?, ?, ?)',
                    ['admin', hash, 'admin@calvoro.com']
                );
                console.log('Default admin created - Username: admin, Password: admin123');
            }
            await this.ensureUserVerificationColumns();
        } catch (error) {
            console.error('Error initializing admin:', error.message);
        }
    }

    async ensureAllUsersVerified() {
        try {
            await this.pool.query('UPDATE users SET email_verified = 1 WHERE email_verified = 0 OR email_verified IS NULL');
        } catch (e) {
            if (e.code !== 'ER_BAD_FIELD_ERROR') console.error('ensureAllUsersVerified:', e.message);
        }
    }

    async ensureUserVerificationColumns() {
        const cols = [
            ['email_verified', 'ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0'],
            ['verification_code', 'ALTER TABLE users ADD COLUMN verification_code VARCHAR(10) NULL'],
            ['verification_code_expires_at', 'ALTER TABLE users ADD COLUMN verification_code_expires_at DATETIME NULL']
        ];
        for (const [name, sql] of cols) {
            try {
                await this.pool.query(sql);
            } catch (e) {
                if (e.code !== 'ER_DUP_FIELDNAME') throw e;
            }
        }
    }

    // ---- Products (flat: price, colors JSON, sizes JSON, stock) ----
    async ensureProductsColorImages() {
        if (this._colorImagesEnsured) return;
        try {
            await this.pool.query('ALTER TABLE products ADD COLUMN color_images JSON AFTER images');
            this._colorImagesEnsured = true;
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') this._colorImagesEnsured = true;
            else console.error('ensureProductsColorImages:', e.message);
        }
    }

    async ensureProductsColorVideos() {
        if (this._colorVideosEnsured) return;
        try {
            await this.pool.query('ALTER TABLE products ADD COLUMN color_videos JSON AFTER color_images');
            this._colorVideosEnsured = true;
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') this._colorVideosEnsured = true;
            else console.error('ensureProductsColorVideos:', e.message);
        }
    }

    async ensureProductsMedia() {
        if (this._mediaEnsured) return;
        try {
            await this.pool.query('ALTER TABLE products ADD COLUMN media JSON AFTER sizes');
            this._mediaEnsured = true;
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                this._mediaEnsured = true;
            } else if (e.code !== 'ER_BAD_FIELD_ERROR') {
                console.error('ensureProductsMedia:', e.message);
            }
        }
    }

    async ensureProductsSizeGuideUrl() {
        if (this._sizeGuideEnsured) return;
        try {
            await this.pool.query('ALTER TABLE products ADD COLUMN size_guide_url VARCHAR(1200) AFTER media');
            this._sizeGuideEnsured = true;
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                this._sizeGuideEnsured = true;
            } else if (e.code !== 'ER_BAD_FIELD_ERROR') {
                console.error('ensureProductsSizeGuideUrl:', e.message);
            }
        }
    }

    async getAllProducts() {
        await this.ensureProductsColorImages();
        await this.ensureProductsColorVideos();
        await this.ensureProductsMedia();
        await this.ensureProductsSizeGuideUrl();
        const [rows] = await this.pool.query(`
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.created_at DESC
        `);
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            description: row.description,
            category_id: row.category_id,
            category_name: row.category_name,
            price: Number(row.price),
            base_price: Number(row.price),
            sale_price: row.sale_price != null ? Number(row.sale_price) : null,
            images: parseJson(row.images) || [],
            color_images: parseJson(row.color_images) || {},
            color_videos: parseJson(row.color_videos) || {},
            colors: parseJson(row.colors) || [],
            sizes: parseJson(row.sizes) || [],
            media: parseJson(row.media) || [],
            size_guide_url: row.size_guide_url || '',
            stock: row.stock || 0,
            featured: Boolean(row.featured),
            status: row.status || 'active',
            is_active: (row.status || 'active') === 'active',
            created_at: row.created_at
        }));
    }

    async getProductById(id) {
        await this.ensureProductsColorImages();
        await this.ensureProductsColorVideos();
        await this.ensureProductsMedia();
        await this.ensureProductsSizeGuideUrl();
        const [rows] = await this.pool.query(`
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `, [id]);
        if (rows.length === 0) return null;
        const row = rows[0];
        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            description: row.description,
            category_id: row.category_id,
            category_name: row.category_name,
            price: Number(row.price),
            base_price: Number(row.price),
            sale_price: row.sale_price != null ? Number(row.sale_price) : null,
            images: parseJson(row.images) || [],
            color_images: parseJson(row.color_images) || {},
            color_videos: parseJson(row.color_videos) || {},
            colors: parseJson(row.colors) || [],
            sizes: parseJson(row.sizes) || [],
            media: parseJson(row.media) || [],
            size_guide_url: row.size_guide_url || '',
            stock: row.stock || 0,
            featured: Boolean(row.featured),
            status: row.status || 'active',
            created_at: row.created_at
        };
    }

    async createProduct(product) {
        await this.ensureProductsColorImages();
        await this.ensureProductsColorVideos();
        await this.ensureProductsMedia();
        await this.ensureProductsSizeGuideUrl();
        const slug = (product.slug || (product.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')).substring(0, 255);
        const [result] = await this.pool.query(
            `INSERT INTO products (name, slug, description, category_id, price, sale_price, images, color_images, color_videos, colors, sizes, media, size_guide_url, stock, featured, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                product.name,
                slug,
                product.description || '',
                product.category_id || null,
                product.price ?? 0,
                product.sale_price ?? null,
                JSON.stringify(product.images || []),
                JSON.stringify(product.color_images || {}),
                JSON.stringify(product.color_videos || {}),
                JSON.stringify(product.colors || []),
                JSON.stringify(product.sizes || []),
                JSON.stringify(product.media || []),
                product.size_guide_url || '',
                product.stock ?? 0,
                product.featured ? 1 : 0,
                product.status || 'active'
            ]
        );
        return { lastInsertRowid: result.insertId };
    }

    async updateProduct(id, product) {
        await this.ensureProductsColorImages();
        await this.ensureProductsColorVideos();
        await this.ensureProductsMedia();
        await this.ensureProductsSizeGuideUrl();
        const slug = (product.slug || (product.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')).substring(0, 255);
        const [result] = await this.pool.query(
            `UPDATE products SET name = ?, slug = ?, description = ?, category_id = ?, price = ?, sale_price = ?,
             images = ?, color_images = ?, color_videos = ?, colors = ?, sizes = ?, media = ?, size_guide_url = ?, stock = ?, featured = ?, status = ?
             WHERE id = ?`,
            [
                product.name,
                slug,
                product.description || '',
                product.category_id || null,
                product.price ?? 0,
                product.sale_price ?? null,
                JSON.stringify(product.images || []),
                JSON.stringify(product.color_images != null ? product.color_images : {}),
                JSON.stringify(product.color_videos != null ? product.color_videos : {}),
                JSON.stringify(product.colors || []),
                JSON.stringify(product.sizes || []),
                JSON.stringify(product.media || []),
                product.size_guide_url || '',
                product.stock ?? 0,
                product.featured ? 1 : 0,
                product.status || 'active',
                id
            ]
        );
        return { changes: result.affectedRows };
    }

    async deleteProduct(id) {
        const [result] = await this.pool.query('DELETE FROM products WHERE id = ?', [id]);
        return { changes: result.affectedRows };
    }

    // ---- Categories ----
    async getAllCategories() {
        const [rows] = await this.pool.query('SELECT * FROM categories ORDER BY display_order, id');
        return rows;
    }

    async getCategoryById(id) {
        const [rows] = await this.pool.query('SELECT * FROM categories WHERE id = ?', [id]);
        return rows[0] || null;
    }

    async createCategory(category) {
        const slug = (category.slug || (category.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')).substring(0, 100);
        const [result] = await this.pool.query(
            'INSERT INTO categories (name, slug, parent_id, display_order, description, image) VALUES (?, ?, ?, ?, ?, ?)',
            [
                category.name,
                slug,
                category.parent_id || null,
                category.display_order ?? 0,
                category.description || '',
                category.image || ''
            ]
        );
        return { lastInsertRowid: result.insertId };
    }

    async updateCategory(id, category) {
        const slug = (category.slug || (category.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')).substring(0, 100);
        const [result] = await this.pool.query(
            'UPDATE categories SET name = ?, slug = ?, parent_id = ?, display_order = ?, description = ?, image = ? WHERE id = ?',
            [
                category.name,
                slug,
                category.parent_id || null,
                category.display_order ?? 0,
                category.description || '',
                category.image || '',
                id
            ]
        );
        return { changes: result.affectedRows };
    }

    async deleteCategory(id) {
        const [result] = await this.pool.query('DELETE FROM categories WHERE id = ?', [id]);
        return { changes: result.affectedRows };
    }

    // ---- Orders ----
    async getAllOrders() {
        const [rows] = await this.pool.query('SELECT * FROM orders ORDER BY created_at DESC');
        return rows.map(row => ({ ...row, total: Number(row.total), subtotal: Number(row.subtotal), shipping: Number(row.shipping) }));
    }

    async getOrderById(id) {
        const [orders] = await this.pool.query('SELECT * FROM orders WHERE id = ?', [id]);
        if (orders.length === 0) return null;
        const order = orders[0];
        const [items] = await this.pool.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
        return {
            ...order,
            items: items.map(i => ({ ...i, price: Number(i.price), quantity: i.quantity, name: i.product_name })),
            total: Number(order.total),
            subtotal: Number(order.subtotal),
            shipping: Number(order.shipping)
        };
    }

    async getOrderByTrackingNumber(trackingNumber) {
        const [orders] = await this.pool.query('SELECT * FROM orders WHERE tracking_number = ?', [trackingNumber]);
        if (orders.length === 0) return null;
        const order = orders[0];
        const [items] = await this.pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
        return {
            ...order,
            items: items.map(i => ({ ...i, price: Number(i.price), quantity: i.quantity, name: i.product_name })),
            total: Number(order.total),
            subtotal: Number(order.subtotal),
            shipping: Number(order.shipping)
        };
    }

    async updateOrderTracking(orderId, trackingNumber, courierName) {
        // Ensure columns exist first
        try {
            await this.pool.query('ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(128) NULL');
            await this.pool.query('ALTER TABLE orders ADD COLUMN courier VARCHAR(128) NULL');
        } catch(e) {}
        
        const [result] = await this.pool.query(
            'UPDATE orders SET tracking_number = ?, courier = ? WHERE id = ?',
            [trackingNumber, courierName, orderId]
        );
        return { changes: result.affectedRows };
    }

    async getOrderTrackingTimeline(orderId) {
        await this.ensureDeliveryTables();
        const [rows] = await this.pool.query(
            'SELECT id, status, label, notes, created_by_admin_id, created_at FROM order_tracking WHERE order_id = ? ORDER BY created_at ASC',
            [orderId]
        );
        return rows;
    }

    async getOrdersByUserId(userId) {
        const [rows] = await this.pool.query(
            'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows.map(row => ({ ...row, total: Number(row.total), subtotal: Number(row.subtotal), shipping: Number(row.shipping) }));
    }

    async createOrder(order) {
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const items = order.items || [];
            for (const item of items) {
                const pid = parseInt(item.id || item.product_id, 10);
                const qty = parseInt(item.quantity, 10) || 1;
                if (!pid || Number.isNaN(pid)) {
                    throw new Error('Invalid order item: missing product id');
                }
                const [[row]] = await conn.query(
                    'SELECT COALESCE(stock,0) AS stock FROM products WHERE id = ? FOR UPDATE',
                    [pid]
                );
                if (!row || Number(row.stock) < qty) {
                    throw new Error(`Insufficient stock for product ${pid}`);
                }
            }

            const [result] = await conn.query(
                `INSERT INTO orders (user_id, order_number, customer_name, customer_email, customer_phone, customer_address, subtotal, shipping, total, status, payment_method, notes, voucher_code, voucher_discount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    order.user_id || null,
                    order.order_number,
                    order.customer_name,
                    order.customer_email,
                    order.customer_phone || '',
                    order.customer_address || '',
                    order.subtotal,
                    order.shipping,
                    order.total,
                    order.status || 'pending',
                    order.payment_method || 'COD',
                    order.notes || '',
                    order.voucher_code || null,
                    order.voucher_discount != null ? order.voucher_discount : 0
                ]
            );
            const orderId = result.insertId;
            for (const item of items) {
                await conn.query(
                    `INSERT INTO order_items (order_id, product_id, product_name, color, size, quantity, price)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orderId,
                        item.id || item.product_id,
                        item.name || item.product_name || 'Item',
                        item.color || null,
                        item.size || null,
                        item.quantity || 1,
                        item.price ?? 0
                    ]
                );
            }
            for (const item of items) {
                const pid = parseInt(item.id || item.product_id, 10);
                const qty = parseInt(item.quantity, 10) || 1;
                const [upd] = await conn.query(
                    'UPDATE products SET stock = GREATEST(0, COALESCE(stock,0) - ?) WHERE id = ? AND COALESCE(stock,0) >= ?',
                    [qty, pid, qty]
                );
                if (upd.affectedRows !== 1) {
                    throw new Error(`Stock update failed for product ${pid}`);
                }
            }
            await conn.commit();
            return { lastInsertRowid: orderId };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    async updateOrderStatus(id, status) {
        const [result] = await this.pool.query('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
        return { changes: result.affectedRows };
    }

    async updateOrderTracking(id, tracking_number, delivery_status = 'shipped') {
        const [result] = await this.pool.query(
            'UPDATE orders SET tracking_number = ?, delivery_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [tracking_number, delivery_status, id]
        );
        return { changes: result.affectedRows };
    }

    // ---- Admin ----
    async getAdminByUsername(username) {
        const [rows] = await this.pool.query('SELECT * FROM admin_users WHERE username = ?', [username]);
        return rows[0] || null;
    }

    // ---- Users (storefront) ----
    async getUserByEmail(email) {
        const [rows] = await this.pool.query('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0] || null;
    }

    async getUserByEmailCaseInsensitive(email) {
        if (!email) return null;
        const [rows] = await this.pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [String(email).trim()]);
        return rows[0] || null;
    }

    async getUserById(id) {
        const [rows] = await this.pool.query('SELECT id, email, first_name, last_name, phone, address, city, created_at FROM users WHERE id = ?', [id]);
        return rows[0] || null;
    }

    async getAllUsers() {
        await this.ensureDonationsTable();
        const [rows] = await this.pool.query(
            `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.address, u.city, u.created_at,
                    COUNT(d.id) as donation_count,
                    COALESCE(SUM(d.amount), 0) as total_donated
             FROM users u
             LEFT JOIN donations d ON u.email = d.email AND d.payment_status = 'paid'
             GROUP BY u.id, u.email, u.first_name, u.last_name, u.phone, u.address, u.city, u.created_at
             ORDER BY u.created_at DESC`
        );
        return rows.map(r => ({
            ...r,
            is_donor: r.donation_count > 0,
            total_donated: Number(r.total_donated)
        }));
    }

    async updateUserById(id, data) {
        const allowed = ['first_name', 'last_name', 'phone', 'address', 'city'];
        const updates = [];
        const values = [];
        for (const key of allowed) {
            if (data[key] !== undefined) {
                updates.push(`${key} = ?`);
                values.push(data[key]);
            }
        }
        if (updates.length === 0) return { changes: 0 };
        values.push(id);
        const [result] = await this.pool.query(
            'UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?',
            values
        );
        return { changes: result.affectedRows };
    }

    async deleteUserById(id) {
        const [result] = await this.pool.query('DELETE FROM users WHERE id = ?', [id]);
        return { changes: result.affectedRows };
    }

    async updatePassword(userId, password_hash) {
        const [r] = await this.pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, userId]);
        return { changes: r.affectedRows };
    }

    async createUser(user) {
        const [result] = await this.pool.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, phone, address, city, email_verified, verification_code, verification_code_expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                user.email,
                user.password_hash,
                user.first_name || '',
                user.last_name || '',
                user.phone || '',
                user.address || '',
                user.city || '',
                user.email_verified ? 1 : 0,
                user.verification_code || null,
                user.verification_code_expires_at || null
            ]
        );
        return { lastInsertRowid: result.insertId };
    }

    async updateUserVerification(email, data) {
        const updates = [];
        const values = [];
        if (data.email_verified !== undefined) {
            updates.push('email_verified = ?');
            values.push(data.email_verified ? 1 : 0);
        }
        if (data.verification_code !== undefined) {
            updates.push('verification_code = ?');
            values.push(data.verification_code);
        }
        if (data.verification_code_expires_at !== undefined) {
            updates.push('verification_code_expires_at = ?');
            values.push(data.verification_code_expires_at);
        }
        if (updates.length === 0) return { changes: 0 };
        values.push(email);
        const [result] = await this.pool.query(
            'UPDATE users SET ' + updates.join(', ') + ' WHERE email = ?',
            values
        );
        return { changes: result.affectedRows };
    }

    // ---- Stats ----
    async getStats() {
        const [[p]] = await this.pool.query('SELECT COUNT(*) as count FROM products');
        const [[o]] = await this.pool.query('SELECT COUNT(*) as count FROM orders');
        const [[u]] = await this.pool.query('SELECT COUNT(*) as count FROM users');
        const [[rev]] = await this.pool.query("SELECT COALESCE(SUM(total), 0) as revenue FROM orders WHERE status IN ('completed', 'paid')");
        const [[pend]] = await this.pool.query("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
        return {
            totalProducts: p.count,
            totalOrders: o.count,
            totalUsers: u.count,
            totalRevenue: Number(rev.revenue),
            pendingOrders: pend.count
        };
    }

    // ---- Reviews ----
    async ensureReviewsTable() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                author_name VARCHAR(255) NOT NULL DEFAULT 'Guest',
                rating TINYINT NOT NULL DEFAULT 5,
                body TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                INDEX idx_product_id (product_id)
            )
        `);
    }

    async getAllReviews() {
        await this.ensureReviewsTable();
        const [rows] = await this.pool.query('SELECT id, product_id, author_name, rating, body, created_at FROM reviews');
        return rows;
    }

    async getReviewsByProductId(productId) {
        await this.ensureReviewsTable();
        const [rows] = await this.pool.query(
            'SELECT id, product_id, author_name, rating, body, created_at FROM reviews WHERE product_id = ? ORDER BY created_at DESC',
            [productId]
        );
        return rows;
    }

    async getRecentReviewsWithProducts(limit = 20) {
        await this.ensureReviewsTable();
        const [rows] = await this.pool.query(`
            SELECT r.id, r.product_id, r.author_name, r.rating, r.body, r.created_at,
                   p.name as product_name, p.slug as product_slug, p.images as product_images
            FROM reviews r
            JOIN products p ON r.product_id = p.id
            ORDER BY r.created_at DESC
            LIMIT ?
        `, [limit]);
        return rows.map(r => ({
            id: r.id,
            product_id: r.product_id,
            author_name: r.author_name,
            rating: r.rating,
            body: r.body,
            created_at: r.created_at,
            product_name: r.product_name,
            product_slug: r.product_slug,
            product_images: parseJson(r.product_images) || []
        }));
    }

    async createReview(review) {
        await this.ensureReviewsTable();
        const rating = Math.min(5, Math.max(1, parseInt(review.rating) || 5));
        const [result] = await this.pool.query(
            'INSERT INTO reviews (product_id, author_name, rating, body) VALUES (?, ?, ?, ?)',
            [
                parseInt(review.product_id),
                review.author_name || 'Guest',
                rating,
                review.body || ''
            ]
        );
        return { lastInsertRowid: result.insertId };
    }

    // ---- Account: Profiles, Addresses, Payment Methods, Settings ----
    async ensureAccountTables() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS user_profiles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL UNIQUE,
                profile_picture_url VARCHAR(500) NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS user_addresses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                label VARCHAR(100) NULL,
                full_name VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NULL,
                address_line1 VARCHAR(255) NOT NULL,
                address_line2 VARCHAR(255) NULL,
                city VARCHAR(100) NOT NULL,
                postal_code VARCHAR(20) NULL,
                is_default TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id)
            )
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS user_payment_methods (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                card_brand VARCHAR(50) NULL,
                last_four VARCHAR(4) NOT NULL,
                exp_month TINYINT NULL,
                exp_year SMALLINT NULL,
                is_default TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id)
            )
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS user_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL UNIQUE,
                notifications_email TINYINT(1) NOT NULL DEFAULT 1,
                notifications_sms TINYINT(1) NOT NULL DEFAULT 0,
                marketing_emails TINYINT(1) NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
    }

    async getProfile(userId) {
        await this.ensureAccountTables();
        const [user] = await this.pool.query('SELECT id, email, first_name, last_name, phone, address, city FROM users WHERE id = ?', [userId]);
        if (!user || !user.length) return null;
        const u = user[0];
        const [prof] = await this.pool.query('SELECT profile_picture_url FROM user_profiles WHERE user_id = ?', [userId]);
        return {
            id: u.id,
            email: u.email,
            first_name: u.first_name,
            last_name: u.last_name,
            phone: u.phone,
            address: u.address,
            city: u.city,
            profile_picture_url: prof && prof[0] ? prof[0].profile_picture_url : null
        };
    }

    async updateProfile(userId, data) {
        const allowed = ['first_name', 'last_name', 'phone', 'address', 'city'];
        const updates = []; const values = [];
        for (const k of allowed) {
            if (data[k] !== undefined) { updates.push(k + ' = ?'); values.push(data[k]); }
        }
        if (updates.length) {
            values.push(userId);
            await this.pool.query('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?', values);
        }
        if (data.profile_picture_url !== undefined) {
            await this.ensureAccountTables();
            await this.pool.query(
                'INSERT INTO user_profiles (user_id, profile_picture_url) VALUES (?, ?) ON DUPLICATE KEY UPDATE profile_picture_url = VALUES(profile_picture_url)',
                [userId, data.profile_picture_url || null]
            );
        }
        return { changes: 1 };
    }

    async getAddresses(userId) {
        await this.ensureAccountTables();
        const [rows] = await this.pool.query('SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, id', [userId]);
        return rows;
    }

    async addAddress(userId, addr) {
        await this.ensureAccountTables();
        if (addr.is_default) {
            await this.pool.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [userId]);
        }
        const [r] = await this.pool.query(
            'INSERT INTO user_addresses (user_id, label, full_name, phone, address_line1, address_line2, city, postal_code, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, addr.label || null, addr.full_name || '', addr.phone || null, addr.address_line1 || '', addr.address_line2 || null, addr.city || '', addr.postal_code || null, addr.is_default ? 1 : 0]
        );
        return { id: r.insertId };
    }

    async updateAddress(userId, addrId, addr) {
        await this.ensureAccountTables();
        if (addr.is_default) {
            await this.pool.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [userId]);
        }
        const updates = []; const values = [];
        const keys = ['label', 'full_name', 'phone', 'address_line1', 'address_line2', 'city', 'postal_code', 'is_default'];
        for (const k of keys) {
            if (addr[k] !== undefined) {
                updates.push(k + ' = ?');
                values.push(k === 'is_default' ? (addr[k] ? 1 : 0) : (addr[k] || null));
            }
        }
        if (updates.length) {
            values.push(addrId, userId);
            const [r] = await this.pool.query('UPDATE user_addresses SET ' + updates.join(', ') + ' WHERE id = ? AND user_id = ?', values);
            return { changes: r.affectedRows };
        }
        return { changes: 0 };
    }

    async deleteAddress(userId, addrId) {
        const [r] = await this.pool.query('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [addrId, userId]);
        return { changes: r.affectedRows };
    }

    async setDefaultAddress(userId, addrId) {
        await this.pool.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [userId]);
        const [r] = await this.pool.query('UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [addrId, userId]);
        return { changes: r.affectedRows };
    }

    async getPaymentMethods(userId) {
        await this.ensureAccountTables();
        const [rows] = await this.pool.query('SELECT id, card_brand, last_four, exp_month, exp_year, is_default, created_at FROM user_payment_methods WHERE user_id = ?', [userId]);
        return rows;
    }

    async addPaymentMethod(userId, pm) {
        await this.ensureAccountTables();
        if (!pm.last_four || pm.last_four.length !== 4) return { error: 'Invalid last4' };
        if (pm.is_default) {
            await this.pool.query('UPDATE user_payment_methods SET is_default = 0 WHERE user_id = ?', [userId]);
        }
        const [r] = await this.pool.query(
            'INSERT INTO user_payment_methods (user_id, card_brand, last_four, exp_month, exp_year, is_default) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, pm.card_brand || 'Card', pm.last_four, pm.exp_month || null, pm.exp_year || null, pm.is_default ? 1 : 0]
        );
        return { id: r.insertId };
    }

    async deletePaymentMethod(userId, pmId) {
        const [r] = await this.pool.query('DELETE FROM user_payment_methods WHERE id = ? AND user_id = ?', [pmId, userId]);
        return { changes: r.affectedRows };
    }

    async getSettings(userId) {
        await this.ensureAccountTables();
        const [rows] = await this.pool.query('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
        if (rows.length) return rows[0];
        await this.pool.query('INSERT INTO user_settings (user_id) VALUES (?)', [userId]);
        const [r] = await this.pool.query('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
        return r[0] || {};
    }

    async updateSettings(userId, data) {
        await this.ensureAccountTables();
        const existing = await this.getSettings(userId);
        const keys = ['notifications_email', 'notifications_sms', 'marketing_emails'];
        const merged = {
            notifications_email: existing.notifications_email !== undefined ? existing.notifications_email : 1,
            notifications_sms: existing.notifications_sms !== undefined ? existing.notifications_sms : 0,
            marketing_emails: existing.marketing_emails !== undefined ? existing.marketing_emails : 0
        };
        for (const k of keys) {
            if (data[k] !== undefined) merged[k] = data[k] ? 1 : 0;
        }
        await this.pool.query(
            `INSERT INTO user_settings (user_id, notifications_email, notifications_sms, marketing_emails)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE notifications_email = VALUES(notifications_email), notifications_sms = VALUES(notifications_sms), marketing_emails = VALUES(marketing_emails)`,
            [userId, merged.notifications_email, merged.notifications_sms, merged.marketing_emails]
        );
        return { changes: 1 };
    }

    async getWishlistProducts(userId) {
        await this.ensureWishlistTable();
        const [rows] = await this.pool.query(`
            SELECT p.*, c.name as category_name, w.id as wishlist_id
            FROM wishlist w
            JOIN products p ON w.product_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE w.user_id = ?
            ORDER BY w.id DESC
        `, [userId]);
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            category_name: row.category_name,
            price: Number(row.price),
            sale_price: row.sale_price != null ? Number(row.sale_price) : null,
            images: parseJson(row.images) || [],
            wishlist_id: row.wishlist_id
        }));
    }

    async getWishlistProductIds(userId) {
        const [rows] = await this.pool.query('SELECT product_id FROM wishlist WHERE user_id = ?', [userId]);
        return rows.map(r => r.product_id);
    }

    async ensureWishlistTable() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS wishlist (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_user_product (user_id, product_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id)
            )
        `);
    }

    async addToWishlist(userId, productId) {
        await this.ensureWishlistTable();
        try {
            await this.pool.query('INSERT IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)', [userId, productId]);
            return { added: true };
        } catch (e) {
            return { added: false };
        }
    }

    async removeFromWishlist(userId, productId) {
        const [r] = await this.pool.query('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?', [userId, productId]);
        return { changes: r.affectedRows };
    }

    // ---- Cart (user-specific, cart_items table) ----
    async ensureCartTable() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS cart_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                color VARCHAR(50) NULL,
                size VARCHAR(20) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_user_product_color_size (user_id, product_id, color(50), size(20)),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id)
            )
        `);
    }

    async getCartItems(userId, _sessionId) {
        if (!userId) return [];
        await this.ensureCartTable();
        const [rows] = await this.pool.query(`
            SELECT ci.id, ci.product_id, ci.quantity, ci.color, ci.size, p.name, p.price, p.sale_price, p.images
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.user_id = ?
            ORDER BY ci.created_at DESC
        `, [userId]);
        return rows.map(r => ({
            id: r.id,
            product_id: r.product_id,
            quantity: r.quantity,
            color: r.color,
            size: r.size,
            name: r.name,
            base_price: Number(r.price),
            sale_price: r.sale_price != null ? Number(r.sale_price) : null,
            price: r.sale_price != null ? Number(r.sale_price) : Number(r.price),
            is_on_sale: r.sale_price != null && r.sale_price < r.price,
            image: (parseJson(r.images) || [])[0] || null,
            images: parseJson(r.images) || []
        }));
    }

    async addToCart(userId, _sessionId, productId, _productVariantId, quantity, color, size) {
        if (!userId) return { added: false };
        await this.ensureCartTable();
        const c = color || '';
        const s = size || '';
        try {
            await this.pool.query(
                `INSERT INTO cart_items (user_id, product_id, quantity, color, size)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                [userId, productId, quantity || 1, c, s, quantity || 1]
            );
            return { added: true };
        } catch (e) {
            return { added: false };
        }
    }

    async updateCartItem(userId, cartItemId, quantity) {
        if (!userId) return { changes: 0 };
        const [r] = await this.pool.query(
            'UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?',
            [quantity, cartItemId, userId]
        );
        return { changes: r.affectedRows };
    }

    async removeFromCart(userId, cartItemId) {
        if (!userId) return { changes: 0 };
        const [r] = await this.pool.query(
            'DELETE FROM cart_items WHERE id = ? AND user_id = ?',
            [cartItemId, userId]
        );
        return { changes: r.affectedRows };
    }

    async clearCart(userId, _sessionId) {
        if (!userId) return { changes: 0 };
        const [r] = await this.pool.query('DELETE FROM cart_items WHERE user_id = ?', [userId]);
        return { changes: r.affectedRows };
    }

    // ---- Gift Vouchers ----
    async ensureGiftVoucherTables() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS gift_vouchers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(64) NOT NULL UNIQUE,
                discount_type ENUM('fixed_amount', 'percentage') NOT NULL DEFAULT 'fixed_amount',
                discount_value DECIMAL(10, 2) NOT NULL,
                min_cart_value DECIMAL(10, 2) DEFAULT 0,
                expiry_date DATE NULL,
                usage_limit INT NULL,
                used_count INT NOT NULL DEFAULT 0,
                use_per_user_limit INT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_code (code),
                INDEX idx_active_expiry (is_active, expiry_date)
            )
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS voucher_redemptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                voucher_id INT NOT NULL,
                order_id INT NOT NULL,
                user_id INT NULL,
                amount_discount DECIMAL(10, 2) NOT NULL,
                redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_voucher (voucher_id),
                INDEX idx_order (order_id)
            )
        `);
        // Add voucher columns to orders if missing
        try {
            await this.pool.query('ALTER TABLE orders ADD COLUMN voucher_code VARCHAR(64) NULL');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
        try {
            await this.pool.query('ALTER TABLE orders ADD COLUMN voucher_discount DECIMAL(10, 2) DEFAULT 0');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
    }

    async createVoucher(voucher) {
        await this.ensureGiftVoucherTables();
        const [result] = await this.pool.query(
            `INSERT INTO gift_vouchers (code, discount_type, discount_value, min_cart_value, expiry_date, usage_limit, use_per_user_limit, is_active, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                voucher.code,
                voucher.discount_type || 'fixed_amount',
                voucher.discount_value,
                voucher.min_cart_value ?? 0,
                voucher.expiry_date || null,
                voucher.usage_limit ?? null,
                voucher.use_per_user_limit ?? null,
                voucher.is_active !== undefined ? (voucher.is_active ? 1 : 0) : 1,
                voucher.created_by ?? null
            ]
        );
        return { lastInsertRowid: result.insertId };
    }

    async getVoucherByCode(code) {
        await this.ensureGiftVoucherTables();
        const [rows] = await this.pool.query(
            'SELECT * FROM gift_vouchers WHERE code = ?',
            [String(code).trim().toUpperCase()]
        );
        return rows[0] || null;
    }

    async getVoucherById(id) {
        await this.ensureGiftVoucherTables();
        const [rows] = await this.pool.query('SELECT * FROM gift_vouchers WHERE id = ?', [id]);
        return rows[0] || null;
    }

    /**
     * Validates voucher for given cart subtotal and user. Returns { valid, discount, message, voucher } or { valid: false, message }.
     * Uses a transaction with row lock to prevent race conditions on used_count.
     */
    async validateVoucherForCart(code, cartSubtotalLkr, userId) {
        await this.ensureGiftVoucherTables();
        const normalizedCode = String(code).trim().toUpperCase();
        if (!normalizedCode) return { valid: false, message: 'Please enter a voucher code.' };

        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            const [rows] = await conn.query(
                'SELECT * FROM gift_vouchers WHERE code = ? AND is_active = 1 FOR UPDATE',
                [normalizedCode]
            );
            const v = rows[0];
            if (!v) {
                await conn.rollback();
                return { valid: false, message: 'Invalid or inactive voucher code.' };
            }
            const expiry = v.expiry_date ? new Date(v.expiry_date) : null;
            if (expiry && expiry < new Date()) {
                await conn.rollback();
                return { valid: false, message: 'This voucher has expired.' };
            }
            if (v.usage_limit != null && v.used_count >= v.usage_limit) {
                await conn.rollback();
                return { valid: false, message: 'This voucher has reached its usage limit.' };
            }
            const minCart = Number(v.min_cart_value) || 0;
            if (cartSubtotalLkr < minCart) {
                await conn.rollback();
                return { valid: false, message: `Minimum order value for this voucher is LKR ${minCart.toLocaleString()}.` };
            }
            if (v.use_per_user_limit != null && userId) {
                const [[c]] = await conn.query(
                    'SELECT COUNT(*) as c FROM voucher_redemptions WHERE voucher_id = ? AND user_id = ?',
                    [v.id, userId]
                );
                if (c.c >= v.use_per_user_limit) {
                    await conn.rollback();
                    return { valid: false, message: 'You have already used this voucher the maximum number of times.' };
                }
            }
            let discount = 0;
            const subtotal = Number(cartSubtotalLkr);
            if (v.discount_type === 'percentage') {
                discount = Math.min(subtotal * (Number(v.discount_value) / 100), subtotal);
            } else {
                discount = Math.min(Number(v.discount_value), subtotal);
            }
            discount = Math.round(discount * 100) / 100;
            await conn.commit();
            return {
                valid: true,
                discount,
                message: 'Voucher applied.',
                voucher: {
                    id: v.id,
                    code: v.code,
                    discount_type: v.discount_type,
                    discount_value: Number(v.discount_value),
                    min_cart_value: Number(v.min_cart_value),
                    expiry_date: v.expiry_date,
                    usage_limit: v.usage_limit,
                    used_count: v.used_count,
                    use_per_user_limit: v.use_per_user_limit
                }
            };
        } catch (err) {
            await conn.rollback().catch(() => {});
            throw err;
        } finally {
            conn.release();
        }
    }

    async recordRedemption(voucherId, orderId, userId, amountDiscount) {
        await this.ensureGiftVoucherTables();
        const conn = await this.pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                'INSERT INTO voucher_redemptions (voucher_id, order_id, user_id, amount_discount) VALUES (?, ?, ?, ?)',
                [voucherId, orderId, userId, amountDiscount]
            );
            await conn.query('UPDATE gift_vouchers SET used_count = used_count + 1 WHERE id = ?', [voucherId]);
            await conn.commit();
            return { ok: true };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    async getVouchersForAdmin() {
        await this.ensureGiftVoucherTables();
        const [rows] = await this.pool.query(
            'SELECT * FROM gift_vouchers ORDER BY created_at DESC'
        );
        return rows.map(r => ({
            ...r,
            discount_value: Number(r.discount_value),
            min_cart_value: Number(r.min_cart_value),
            is_active: Boolean(r.is_active)
        }));
    }

    async updateVoucher(id, data) {
        await this.ensureGiftVoucherTables();
        const allowed = ['code', 'discount_type', 'discount_value', 'min_cart_value', 'expiry_date', 'usage_limit', 'use_per_user_limit', 'is_active'];
        const updates = [];
        const values = [];
        for (const key of allowed) {
            if (data[key] === undefined) continue;
            if (key === 'is_active') {
                updates.push('is_active = ?');
                values.push(data[key] ? 1 : 0);
            } else if (key === 'expiry_date' && data[key] === '') {
                updates.push('expiry_date = NULL');
            } else {
                updates.push(`${key} = ?`);
                values.push(data[key]);
            }
        }
        if (updates.length === 0) return { changes: 0 };
        values.push(id);
        const [result] = await this.pool.query(
            'UPDATE gift_vouchers SET ' + updates.join(', ') + ' WHERE id = ?',
            values
        );
        return { changes: result.affectedRows };
    }

    async deleteVoucher(id) {
        await this.ensureGiftVoucherTables();
        const [result] = await this.pool.query('DELETE FROM gift_vouchers WHERE id = ?', [id]);
        return { changes: result.affectedRows };
    }

    async getRedemptionsByVoucherId(voucherId) {
        await this.ensureGiftVoucherTables();
        const [rows] = await this.pool.query(
            'SELECT * FROM voucher_redemptions WHERE voucher_id = ? ORDER BY redeemed_at DESC',
            [voucherId]
        );
        return rows.map(r => ({ ...r, amount_discount: Number(r.amount_discount) }));
    }

    // ---- Delivery & Logistics ----
    async ensureDeliveryTables() {
        // New columns on orders (wrapped in try/catch so it's idempotent)
        const alterStatements = [
            "ALTER TABLE orders ADD COLUMN shipping_zone_id INT NULL",
            "ALTER TABLE orders ADD COLUMN delivery_method_id INT NULL",
            "ALTER TABLE orders ADD COLUMN courier_id INT NULL",
            "ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(64) NULL UNIQUE",
            "ALTER TABLE orders ADD COLUMN estimated_delivery_date DATE NULL",
            "ALTER TABLE orders ADD COLUMN delivery_status VARCHAR(32) DEFAULT 'order_placed'",
            "ALTER TABLE orders ADD COLUMN delivery_notes TEXT NULL",
            "ALTER TABLE orders ADD COLUMN cod_amount DECIMAL(10,2) DEFAULT 0",
            "ALTER TABLE orders ADD INDEX idx_orders_tracking (tracking_number)",
            "ALTER TABLE orders ADD INDEX idx_orders_delivery_status (delivery_status)",
            "ALTER TABLE orders ADD INDEX idx_orders_zone (shipping_zone_id)"
        ];
        for (const sql of alterStatements) {
            try {
                // Some MySQL versions don't allow ADD COLUMN + ADD INDEX in same statement if it already exists
                await this.pool.query(sql);
            } catch (e) {
                if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') {
                    // For unsupported or already-present indexes/columns, just continue
                    if (e.code !== 'ER_CANT_CREATE_TABLE') console.error('ensureDeliveryTables alter orders:', e.message);
                }
            }
        }

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS shipping_zones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                country_code CHAR(2) NOT NULL,
                province VARCHAR(100) NULL,
                city VARCHAR(100) NULL,
                name VARCHAR(150) NOT NULL,
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                cod_available TINYINT(1) NOT NULL DEFAULT 1,
                min_days INT NOT NULL DEFAULT 3,
                max_days INT NOT NULL DEFAULT 5,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_zone_region (country_code, province, city),
                INDEX idx_zone_enabled (enabled)
            )
        `);

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS delivery_methods (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                description VARCHAR(255),
                base_min_days INT NOT NULL,
                base_max_days INT NOT NULL,
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                supports_cod TINYINT(1) NOT NULL DEFAULT 1,
                is_same_day TINYINT(1) NOT NULL DEFAULT 0,
                is_pickup TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS delivery_fee_rules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                shipping_zone_id INT NOT NULL,
                delivery_method_id INT NOT NULL,
                min_order_total DECIMAL(10,2) DEFAULT 0,
                max_order_total DECIMAL(10,2) DEFAULT NULL,
                min_weight_kg DECIMAL(10,2) DEFAULT 0,
                max_weight_kg DECIMAL(10,2) DEFAULT NULL,
                fee DECIMAL(10,2) NOT NULL,
                free_shipping_threshold DECIMAL(10,2) DEFAULT NULL,
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_fee_zone_method (shipping_zone_id, delivery_method_id),
                INDEX idx_fee_enabled (enabled),
                FOREIGN KEY (shipping_zone_id) REFERENCES shipping_zones(id),
                FOREIGN KEY (delivery_method_id) REFERENCES delivery_methods(id)
            )
        `);

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS couriers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(50) NOT NULL UNIQUE,
                contact_name VARCHAR(100),
                contact_phone VARCHAR(50),
                contact_email VARCHAR(150),
                tracking_url_template VARCHAR(255),
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS order_tracking (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                status VARCHAR(32) NOT NULL,
                label VARCHAR(100) NOT NULL,
                notes TEXT,
                created_by_admin_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_tracking_order (order_id, created_at),
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        `);

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS return_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                user_id INT NULL,
                reason VARCHAR(255),
                status VARCHAR(32) NOT NULL DEFAULT 'pending',
                requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                refund_amount DECIMAL(10,2) DEFAULT 0,
                courier_id INT NULL,
                tracking_number VARCHAR(64) NULL,
                admin_notes TEXT,
                customer_notes TEXT,
                INDEX idx_return_order (order_id),
                INDEX idx_return_status (status),
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        `);
    }

    async _resolveShippingZone(countryCode, province, city) {
        await this.ensureDeliveryTables();
        const cc = (countryCode || '').toUpperCase();
        const prov = province || null;
        const ct = city || null;
        // Try exact match, then province-level, then country-level
        const [rows] = await this.pool.query(
            `SELECT * FROM shipping_zones
             WHERE enabled = 1 AND country_code = ?
             ORDER BY
               (province IS NOT NULL AND province = ?) DESC,
               (province IS NULL) ASC,
               (city IS NOT NULL AND city = ?) DESC,
               (city IS NULL) ASC,
               id ASC
             LIMIT 1`,
            [cc, prov, ct]
        );
        return rows[0] || null;
    }

    _computeEta(zone, method) {
        if (!zone || !method) return { min_days: null, max_days: null };
        // Simple approach: use zone days; method can adjust in future
        return { min_days: zone.min_days, max_days: zone.max_days };
    }

    async getDeliveryOptions({ country_code, province, city, cart_total, cart_weight, cod_selected }) {
        await this.ensureDeliveryTables();
        const zone = await this._resolveShippingZone(country_code, province, city);
        const total = Number(cart_total) || 0;
        const weight = Number(cart_weight) || 0;

        if (!zone || !zone.enabled) {
            // Fallback basic options when no zones configured
            const minDays = 3, maxDays = 5;
            return [
                { id: null, code: 'standard', name: 'Standard Delivery', fee: total >= 15000 ? 0 : 500, eta_min_days: minDays, eta_max_days: maxDays, is_pickup: false, is_same_day: false, cod_available: true }
            ];
        }

        const [methods] = await this.pool.query('SELECT * FROM delivery_methods WHERE enabled = 1');
        if (!methods.length) {
            return [
                { id: null, code: 'standard', name: 'Standard Delivery', fee: total >= 15000 ? 0 : 500, eta_min_days: zone.min_days, eta_max_days: zone.max_days, is_pickup: false, is_same_day: false, cod_available: !!zone.cod_available }
            ];
        }

        const [rules] = await this.pool.query(
            'SELECT * FROM delivery_fee_rules WHERE enabled = 1 AND shipping_zone_id = ?',
            [zone.id]
        );

        const cod = !!cod_selected;
        const options = [];
        for (const m of methods) {
            if (!m.enabled) continue;
            if (cod && (!zone.cod_available || !m.supports_cod)) continue;

            // Find matching rule
            const candidates = rules.filter(r => r.delivery_method_id === m.id).filter(r => {
                if (r.min_order_total != null && total < Number(r.min_order_total)) return false;
                if (r.max_order_total != null && total > Number(r.max_order_total)) return false;
                if (r.min_weight_kg != null && weight < Number(r.min_weight_kg)) return false;
                if (r.max_weight_kg != null && weight > Number(r.max_weight_kg)) return false;
                return true;
            });
            let rule = null;
            if (candidates.length) {
                // Pick rule with highest min_order_total to be most specific
                candidates.sort((a, b) => Number(b.min_order_total || 0) - Number(a.min_order_total || 0));
                rule = candidates[0];
            }
            let fee = 0;
            if (rule) {
                const freeThreshold = rule.free_shipping_threshold != null ? Number(rule.free_shipping_threshold) : null;
                if (freeThreshold != null && total >= freeThreshold) {
                    fee = 0;
                } else {
                    fee = Number(rule.fee);
                }
            } else {
                // Default pricing if no rule configured for method
                if (m.code === 'express') {
                    fee = total >= 20000 ? 0 : 800;
                } else if (m.code === 'same_day') {
                    fee = 1200;
                } else if (m.is_pickup) {
                    fee = 0;
                } else {
                    fee = total >= 15000 ? 0 : 500;
                }
            }

            const eta = this._computeEta(zone, m);
            options.push({
                id: m.id,
                code: m.code,
                name: m.name,
                fee,
                eta_min_days: eta.min_days,
                eta_max_days: eta.max_days,
                is_pickup: !!m.is_pickup,
                is_same_day: !!m.is_same_day,
                cod_available: !!(zone.cod_available && m.supports_cod)
            });
        }
        return options;
    }

    generateTrackingNumber() {
        const now = new Date();
        const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `CVR-${ymd}-${rand}`;
    }

    // ---- Analytics (BI & Reporting) ----
    async ensureAnalyticsTables() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS analytics_search_log (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                keyword VARCHAR(255) NOT NULL,
                has_results TINYINT(1) NOT NULL DEFAULT 1,
                result_count INT DEFAULT 0,
                session_id VARCHAR(64),
                user_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_created (created_at),
                INDEX idx_keyword (keyword(50)),
                INDEX idx_has_results (has_results)
            )
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS analytics_product_events (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                event_type VARCHAR(32) NOT NULL,
                product_id INT NOT NULL,
                user_id INT NULL,
                session_id VARCHAR(64),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_created (created_at),
                INDEX idx_product (product_id),
                INDEX idx_event_type (event_type),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `).catch(() => {});
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS analytics_daily (
                id INT AUTO_INCREMENT PRIMARY KEY,
                date DATE NOT NULL UNIQUE,
                revenue DECIMAL(14, 2) DEFAULT 0,
                order_count INT DEFAULT 0,
                new_customers INT DEFAULT 0,
                product_views INT DEFAULT 0,
                searches_with_results INT DEFAULT 0,
                searches_no_results INT DEFAULT 0,
                add_to_cart_count INT DEFAULT 0,
                wishlist_adds INT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_date (date)
            )
        `);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS analytics_live_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id VARCHAR(64) NOT NULL UNIQUE,
                last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_last_seen (last_seen_at)
            )
        `);
    }

    _parseDateRange(from, to, maxDays = 365) {
        const fromD = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const toD = to ? new Date(to) : new Date();
        if (isNaN(fromD.getTime()) || isNaN(toD.getTime()) || fromD > toD) return null;
        const days = Math.floor((toD - fromD) / (24 * 60 * 60 * 1000));
        if (days > maxDays) return null;
        return { from: fromD.toISOString().slice(0, 10), to: toD.toISOString().slice(0, 10) };
    }

    async getSalesMonthly(year, month) {
        const y = parseInt(year, 10) || new Date().getFullYear();
        const m = parseInt(month, 10) || new Date().getMonth() + 1;
        const [rows] = await this.pool.query(
            `SELECT DATE(created_at) as date, COALESCE(SUM(total), 0) as revenue, COUNT(*) as order_count
             FROM orders WHERE status IN ('completed', 'paid') AND YEAR(created_at) = ? AND MONTH(created_at) = ?
             GROUP BY DATE(created_at) ORDER BY date`,
            [y, m]
        );
        const [[tot]] = await this.pool.query(
            `SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as order_count
             FROM orders WHERE status IN ('completed', 'paid') AND YEAR(created_at) = ? AND MONTH(created_at) = ?`,
            [y, m]
        );
        return { data: rows.map(r => ({ ...r, revenue: Number(r.revenue), order_count: r.order_count })), totalRevenue: Number(tot.revenue), totalOrders: tot.order_count };
    }

    async getSalesAnnual(years) {
        const arr = (Array.isArray(years) ? years : (years || '').toString().split(',')).map(y => parseInt(y, 10)).filter(y => y >= 2000 && y <= 2100).slice(0, 5);
        if (arr.length === 0) arr.push(new Date().getFullYear());
        const result = [];
        for (const y of arr) {
            const [[r]] = await this.pool.query(
                `SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as order_count FROM orders WHERE status IN ('completed', 'paid') AND YEAR(created_at) = ?`,
                [y]
            );
            result.push({ year: y, revenue: Number(r.revenue), order_count: r.order_count });
        }
        return result;
    }

    async getSalesDaily(from, to) {
        const range = this._parseDateRange(from, to);
        if (!range) return { data: [] };
        const [rows] = await this.pool.query(
            `SELECT DATE(created_at) as date, COALESCE(SUM(total), 0) as revenue, COUNT(*) as order_count
             FROM orders WHERE status IN ('completed', 'paid') AND created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY
             GROUP BY DATE(created_at) ORDER BY date`,
            [range.from, range.to]
        );
        return { data: rows.map(r => ({ ...r, revenue: Number(r.revenue), order_count: r.order_count })) };
    }

    async getSalesBreakdown(from, to, groupBy = 'category') {
        const range = this._parseDateRange(from, to);
        if (!range) return { data: [] };
        if (groupBy === 'product') {
            const [rows] = await this.pool.query(
                `SELECT oi.product_id, p.name as product_name, SUM(oi.quantity * oi.price) as revenue, SUM(oi.quantity) as quantity
                 FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
                 WHERE o.status IN ('completed', 'paid') AND o.created_at >= ? AND o.created_at < DATE(?)+INTERVAL 1 DAY
                 GROUP BY oi.product_id, p.name ORDER BY revenue DESC LIMIT 50`,
                [range.from, range.to]
            );
            return { data: rows.map(r => ({ ...r, revenue: Number(r.revenue), quantity: Number(r.quantity) })) };
        }
        const [rows] = await this.pool.query(
            `SELECT p.category_id, c.name as category_name, SUM(oi.quantity * oi.price) as revenue, SUM(oi.quantity) as quantity
             FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id
             WHERE o.status IN ('completed', 'paid') AND o.created_at >= ? AND o.created_at < DATE(?)+INTERVAL 1 DAY
             GROUP BY p.category_id, c.name ORDER BY revenue DESC`,
            [range.from, range.to]
        );
        return { data: rows.map(r => ({ ...r, revenue: Number(r.revenue), quantity: Number(r.quantity) })) };
    }

    async getTopSoldProducts(from, to, limit = 20) {
        const range = this._parseDateRange(from, to, 730);
        if (!range) return [];
        const [rows] = await this.pool.query(
            `SELECT oi.product_id, p.name as product_name, SUM(oi.quantity) as total_quantity, SUM(oi.quantity * oi.price) as revenue
             FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
             WHERE o.status IN ('completed', 'paid') AND o.created_at >= ? AND o.created_at < DATE(?)+INTERVAL 1 DAY
             GROUP BY oi.product_id, p.name ORDER BY total_quantity DESC LIMIT ?`,
            [range.from, range.to, Math.min(parseInt(limit, 10) || 20, 100)]
        );
        return rows.map(r => ({ ...r, total_quantity: Number(r.total_quantity), revenue: Number(r.revenue) }));
    }

    async getLowStockProducts(threshold = 10) {
        const t = Math.max(0, parseInt(threshold, 10) || 10);
        const [rows] = await this.pool.query(
            'SELECT id, name, slug, stock, price, category_id FROM products WHERE status = ? AND stock < ? AND stock >= 0 ORDER BY stock ASC',
            ['active', t]
        );
        return rows;
    }

    async getOutOfStockProducts() {
        const [rows] = await this.pool.query(
            'SELECT id, name, slug, stock, price, category_id FROM products WHERE status = ? AND (stock IS NULL OR stock <= 0) ORDER BY name',
            ['active']
        );
        return rows;
    }

    async getProductViewsCount(from, to, limit = 20) {
        try {
            await this.ensureAnalyticsTables();
        } catch (e) {}
        const range = this._parseDateRange(from, to);
        if (!range) return [];
        const [rows] = await this.pool.query(
            `SELECT product_id, COUNT(*) as view_count FROM analytics_product_events
             WHERE event_type = 'view' AND created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY
             GROUP BY product_id ORDER BY view_count DESC LIMIT ?`,
            [range.from, range.to, Math.min(parseInt(limit, 10) || 20, 100)]
        ).catch(() => [[]]);
        if (!rows.length) return [];
        const ids = rows.map(r => r.product_id);
        const [prods] = await this.pool.query('SELECT id, name FROM products WHERE id IN (?)', [ids]);
        const map = Object.fromEntries(prods.map(p => [p.id, p.name]));
        return rows.map(r => ({ product_id: r.product_id, product_name: map[r.product_id] || '—', view_count: r.view_count }));
    }

    async getTopCategoriesByRevenue(from, to, limit = 10) {
        const range = this._parseDateRange(from, to);
        if (!range) return [];
        const [rows] = await this.pool.query(
            `SELECT p.category_id, c.name as category_name, SUM(oi.quantity * oi.price) as revenue, SUM(oi.quantity) as quantity
             FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id
             WHERE o.status IN ('completed', 'paid') AND o.created_at >= ? AND o.created_at < DATE(?)+INTERVAL 1 DAY
             GROUP BY p.category_id, c.name ORDER BY revenue DESC LIMIT ?`,
            [range.from, range.to, Math.min(parseInt(limit, 10) || 10, 50)]
        );
        return rows.map(r => ({ ...r, revenue: Number(r.revenue), quantity: Number(r.quantity) }));
    }

    async getInventoryValue() {
        const [[r]] = await this.pool.query(
            'SELECT COUNT(*) as product_count, COALESCE(SUM(stock * price), 0) as total_value FROM products WHERE status = ?',
            ['active']
        );
        return { product_count: r.product_count, total_value: Number(r.total_value) };
    }

    async getTotalCustomers() {
        const [[r]] = await this.pool.query('SELECT COUNT(*) as count FROM users');
        return { total: r.count };
    }

    async getNewCustomers(from, to) {
        const range = this._parseDateRange(from, to);
        if (!range) return { count: 0, data: [] };
        const [rows] = await this.pool.query(
            'SELECT DATE(created_at) as date, COUNT(*) as count FROM users WHERE created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY GROUP BY DATE(created_at) ORDER BY date',
            [range.from, range.to]
        );
        const total = rows.reduce((s, r) => s + r.count, 0);
        return { count: total, data: rows };
    }

    async getTopCustomersBySpending(from, to, limit = 20, page = 1) {
        const range = this._parseDateRange(from, to, 730);
        if (!range) return { data: [], total: 0 };
        const lim = Math.min(parseInt(limit, 10) || 20, 100);
        const off = (Math.max(1, parseInt(page, 10)) - 1) * lim;
        const [rows] = await this.pool.query(
            `SELECT o.user_id, u.email, u.first_name, u.last_name, COUNT(o.id) as order_count, COALESCE(SUM(o.total), 0) as total_spent
             FROM orders o LEFT JOIN users u ON u.id = o.user_id
             WHERE o.status IN ('completed', 'paid') AND o.created_at >= ? AND o.created_at < DATE(?)+INTERVAL 1 DAY AND o.user_id IS NOT NULL
             GROUP BY o.user_id, u.email, u.first_name, u.last_name ORDER BY total_spent DESC LIMIT ? OFFSET ?`,
            [range.from, range.to, lim, off]
        );
        const [[{ total }]] = await this.pool.query(
            `SELECT COUNT(DISTINCT user_id) as total FROM orders WHERE status IN ('completed', 'paid') AND created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY AND user_id IS NOT NULL`,
            [range.from, range.to]
        ).catch(() => [{ total: 0 }]);
        return { data: rows.map(r => ({ ...r, total_spent: Number(r.total_spent), order_count: Number(r.order_count) })), total };
    }

    async getCustomerOrders(userId, page = 1, limit = 20) {
        const lim = Math.min(parseInt(limit, 10) || 20, 100);
        const off = (Math.max(1, parseInt(page, 10)) - 1) * lim;
        const [rows] = await this.pool.query(
            'SELECT id, order_number, total, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [userId, lim, off]
        );
        const [[{ total }]] = await this.pool.query('SELECT COUNT(*) as total FROM orders WHERE user_id = ?', [userId]);
        return { data: rows.map(r => ({ ...r, total: Number(r.total) })), total };
    }

    async getCustomerLocations(from, to) {
        const range = this._parseDateRange(from, to);
        if (!range) return [];
        const [rows] = await this.pool.query(
            `SELECT customer_address, COUNT(*) as order_count FROM orders WHERE status IN ('completed', 'paid') AND created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY GROUP BY customer_address ORDER BY order_count DESC LIMIT 50`,
            [range.from, range.to]
        );
        return rows;
    }

    async getSearchTop(from, to, limit = 20) {
        try {
            await this.ensureAnalyticsTables();
        } catch (e) {}
        const range = this._parseDateRange(from, to);
        if (!range) return [];
        const [rows] = await this.pool.query(
            `SELECT keyword, COUNT(*) as search_count FROM analytics_search_log WHERE has_results = 1 AND created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY GROUP BY keyword ORDER BY search_count DESC LIMIT ?`,
            [range.from, range.to, Math.min(parseInt(limit, 10) || 20, 100)]
        ).catch(() => []);
        return rows;
    }

    async getSearchNoResults(from, to, limit = 20) {
        try {
            await this.ensureAnalyticsTables();
        } catch (e) {}
        const range = this._parseDateRange(from, to);
        if (!range) return [];
        const [rows] = await this.pool.query(
            `SELECT keyword, COUNT(*) as search_count FROM analytics_search_log WHERE has_results = 0 AND created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY GROUP BY keyword ORDER BY search_count DESC LIMIT ?`,
            [range.from, range.to, Math.min(parseInt(limit, 10) || 20, 100)]
        ).catch(() => []);
        return rows;
    }

    async getOrdersMetrics(from, to) {
        const range = this._parseDateRange(from, to);
        if (!range) return { total: 0, pending: 0, completed: 0, cancelled: 0 };
        const [rows] = await this.pool.query(
            `SELECT status, COUNT(*) as count FROM orders WHERE created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY GROUP BY status`,
            [range.from, range.to]
        );
        const map = { total: 0, pending: 0, completed: 0, cancelled: 0 };
        rows.forEach(r => {
            map.total += r.count;
            if (r.status === 'pending') map.pending = r.count;
            else if (r.status === 'completed' || r.status === 'paid') map.completed += r.count;
            else if (r.status === 'cancelled') map.cancelled = r.count;
        });
        return map;
    }

    async getRefundRate(from, to) {
        const range = this._parseDateRange(from, to);
        if (!range) return { rate: 0, refunded: 0, total: 0 };
        const [[tot]] = await this.pool.query(
            'SELECT COUNT(*) as total FROM orders WHERE created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY',
            [range.from, range.to]
        );
        const [[ref]] = await this.pool.query(
            "SELECT COUNT(*) as refunded FROM orders WHERE status IN ('refunded', 'cancelled') AND created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY",
            [range.from, range.to]
        );
        const total = tot.total || 0;
        const refunded = ref.refunded || 0;
        return { rate: total ? (refunded / total) * 100 : 0, refunded, total };
    }

    async getAOV(from, to) {
        const range = this._parseDateRange(from, to);
        if (!range) return { aov: 0, totalRevenue: 0, orderCount: 0 };
        const [[r]] = await this.pool.query(
            `SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as order_count FROM orders WHERE status IN ('completed', 'paid') AND created_at >= ? AND created_at < DATE(?)+INTERVAL 1 DAY`,
            [range.from, range.to]
        );
        const orderCount = r.order_count || 0;
        return { aov: orderCount ? Number(r.revenue) / orderCount : 0, totalRevenue: Number(r.revenue), orderCount };
    }

    async getLiveVisitorsCount() {
        try {
            await this.ensureAnalyticsTables();
            await this.pool.query('DELETE FROM analytics_live_sessions WHERE last_seen_at < NOW() - INTERVAL 5 MINUTE');
            const [[r]] = await this.pool.query('SELECT COUNT(*) as count FROM analytics_live_sessions');
            return { count: r.count };
        } catch (e) {
            return { count: 0 };
        }
    }

    async getRecentOrdersForAnalytics(limit = 10) {
        const [rows] = await this.pool.query(
            'SELECT id, order_number, total, status, customer_name, created_at FROM orders ORDER BY created_at DESC LIMIT ?',
            [Math.min(parseInt(limit, 10) || 10, 50)]
        );
        return rows.map(r => ({ ...r, total: Number(r.total) }));
    }

    async getRecentActivityFeed(limit = 20) {
        const orders = await this.getRecentOrdersForAnalytics(limit);
        return orders.map(o => ({
            type: 'order',
            id: o.id,
            message: `Order #${o.order_number} - LKR ${Number(o.total).toLocaleString()} - ${o.status}`,
            created_at: o.created_at
        }));
    }

    async logSearch(keyword, hasResults, resultCount, sessionId, userId) {
        try {
            await this.ensureAnalyticsTables();
            await this.pool.query(
                'INSERT INTO analytics_search_log (keyword, has_results, result_count, session_id, user_id) VALUES (?, ?, ?, ?, ?)',
                [String(keyword).slice(0, 255), hasResults ? 1 : 0, parseInt(resultCount, 10) || 0, sessionId || null, userId || null]
            );
        } catch (e) {
            console.error('analytics logSearch:', e.message);
        }
    }

    async logProductEvent(eventType, productId, userId, sessionId) {
        try {
            await this.ensureAnalyticsTables();
            const allowed = ['view', 'add_to_cart', 'wishlist_add', 'wishlist_remove'];
            if (!allowed.includes(eventType)) return;
            await this.pool.query(
                'INSERT INTO analytics_product_events (event_type, product_id, user_id, session_id) VALUES (?, ?, ?, ?)',
                [eventType, parseInt(productId, 10), userId || null, sessionId || null]
            );
        } catch (e) {
            console.error('analytics logProductEvent:', e.message);
        }
    }

    async upsertLiveSession(sessionId) {
        try {
            await this.ensureAnalyticsTables();
            await this.pool.query(
                'INSERT INTO analytics_live_sessions (session_id) VALUES (?) ON DUPLICATE KEY UPDATE last_seen_at = CURRENT_TIMESTAMP',
                [sessionId]
            );
        } catch (e) {
            console.error('analytics upsertLiveSession:', e.message);
        }
    }

    // ---- Promotions (scroll-triggered storefront popup) ----
    async ensurePromotionsTable() {
        if (this._promotionsEnsured) return;
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS promotions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    image_path VARCHAR(1024) NOT NULL DEFAULT '',
                    redirect_link VARCHAR(2048) NOT NULL DEFAULT '',
                    is_active TINYINT(1) NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_promotions_active (is_active)
                )
            `);
            this._promotionsEnsured = true;
        } catch (e) {
            console.error('ensurePromotionsTable:', e.message);
        }
    }

    async getActivePromotion() {
        await this.ensurePromotionsTable();
        const [rows] = await this.pool.query(
            `SELECT id, image_path, redirect_link, is_active FROM promotions
             WHERE is_active = 1 AND TRIM(COALESCE(image_path, '')) <> ''
             ORDER BY id DESC LIMIT 1`
        );
        if (!rows.length) return null;
        const r = rows[0];
        return { ...r, is_active: !!r.is_active };
    }

    async getAllPromotions() {
        await this.ensurePromotionsTable();
        const [rows] = await this.pool.query(
            `SELECT id, image_path, redirect_link, is_active, created_at, updated_at
             FROM promotions ORDER BY id DESC`
        );
        return rows.map((r) => ({ ...r, is_active: !!r.is_active }));
    }

    async createPromotion({ image_path, redirect_link, is_active }) {
        await this.ensurePromotionsTable();
        const active = !!is_active;
        if (active) {
            await this.pool.query('UPDATE promotions SET is_active = 0');
        }
        const img = String(image_path || '').trim().slice(0, 1024);
        const link = String(redirect_link || '').trim().slice(0, 2048);
        const [result] = await this.pool.query(
            'INSERT INTO promotions (image_path, redirect_link, is_active) VALUES (?, ?, ?)',
            [img, link, active ? 1 : 0]
        );
        const id = result.insertId;
        const [[row]] = await this.pool.query(
            'SELECT id, image_path, redirect_link, is_active, created_at, updated_at FROM promotions WHERE id = ?',
            [id]
        );
        return row ? { ...row, is_active: !!row.is_active } : null;
    }

    async updatePromotion(id, patch) {
        await this.ensurePromotionsTable();
        const nId = parseInt(id, 10);
        if (!nId) return null;
        const [[existing]] = await this.pool.query('SELECT id FROM promotions WHERE id = ?', [nId]);
        if (!existing) return null;

        if (patch.is_active === true) {
            await this.pool.query('UPDATE promotions SET is_active = 0 WHERE id != ?', [nId]);
        }

        const fields = [];
        const vals = [];
        if (patch.image_path !== undefined) {
            fields.push('image_path = ?');
            vals.push(String(patch.image_path).trim().slice(0, 1024));
        }
        if (patch.redirect_link !== undefined) {
            fields.push('redirect_link = ?');
            vals.push(String(patch.redirect_link).trim().slice(0, 2048));
        }
        if (patch.is_active !== undefined) {
            fields.push('is_active = ?');
            vals.push(patch.is_active ? 1 : 0);
        }
        if (fields.length) {
            vals.push(nId);
            await this.pool.query(`UPDATE promotions SET ${fields.join(', ')} WHERE id = ?`, vals);
        }

        const [[row]] = await this.pool.query(
            'SELECT id, image_path, redirect_link, is_active, created_at, updated_at FROM promotions WHERE id = ?',
            [nId]
        );
        return row ? { ...row, is_active: !!row.is_active } : null;
    }

    async deletePromotion(id) {
        await this.ensurePromotionsTable();
        const nId = parseInt(id, 10);
        if (!nId) return { changes: 0 };
        const [r] = await this.pool.query('DELETE FROM promotions WHERE id = ?', [nId]);
        return { changes: r.affectedRows || 0 };
    }

    // ---- Discount engine (campaigns, rules, coupons, analytics) ----
    async ensureDiscountEngineTables() {
        if (this._discountEngineEnsured) return;
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS pricing_engine_settings (
                    id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
                    resolution_mode ENUM('priority', 'best_price') NOT NULL DEFAULT 'best_price',
                    allow_stack TINYINT(1) NOT NULL DEFAULT 0,
                    tier_order JSON NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS seasonal_campaigns (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(120) NOT NULL,
                    hero_headline VARCHAR(255) NOT NULL DEFAULT '',
                    hero_subheadline VARCHAR(255) NOT NULL DEFAULT '',
                    hero_image_url VARCHAR(1024) NOT NULL DEFAULT '',
                    gradient_css VARCHAR(200) NOT NULL DEFAULT 'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)',
                    starts_at DATETIME NOT NULL,
                    ends_at DATETIME NOT NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    is_flash_sale TINYINT(1) NOT NULL DEFAULT 0,
                    display_priority INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_campaign_live (is_active, starts_at, ends_at),
                    UNIQUE KEY uk_seasonal_slug (slug)
                )
            `);
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS discount_rules (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    campaign_id INT NULL,
                    scope ENUM('product', 'category', 'sitewide') NOT NULL DEFAULT 'product',
                    product_id INT NULL,
                    category_id INT NULL,
                    tier ENUM('flash', 'seasonal', 'product', 'category', 'coupon') NOT NULL DEFAULT 'product',
                    discount_type ENUM('percent', 'fixed', 'bogo') NOT NULL DEFAULT 'percent',
                    percent_off DECIMAL(7,2) NULL,
                    fixed_off DECIMAL(12,2) NULL,
                    bogo_json JSON NULL,
                    min_quantity INT NOT NULL DEFAULT 1,
                    starts_at DATETIME NULL,
                    ends_at DATETIME NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    stackable TINYINT(1) NOT NULL DEFAULT 0,
                    rule_priority INT NOT NULL DEFAULT 100,
                    max_uses INT NULL,
                    use_count INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_rule_active (is_active, starts_at, ends_at),
                    INDEX idx_rule_product (product_id),
                    INDEX idx_rule_category (category_id),
                    INDEX idx_rule_campaign (campaign_id)
                )
            `);
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS discount_coupons (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    code VARCHAR(64) NOT NULL,
                    discount_rule_id INT NOT NULL,
                    max_uses INT NULL,
                    use_count INT NOT NULL DEFAULT 0,
                    expires_at DATETIME NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_coupon_code (code),
                    INDEX idx_coupon_rule (discount_rule_id)
                )
            `);
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS discount_analytics (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    order_id INT NULL,
                    discount_rule_id INT NULL,
                    coupon_code VARCHAR(64) NULL,
                    amount_saved DECIMAL(12,2) NOT NULL DEFAULT 0,
                    order_total DECIMAL(12,2) NOT NULL DEFAULT 0,
                    product_id INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_da_rule (discount_rule_id),
                    INDEX idx_da_order (order_id),
                    INDEX idx_da_created (created_at)
                )
            `);
            await this.pool.query(`
                INSERT IGNORE INTO pricing_engine_settings (id, resolution_mode, allow_stack, tier_order)
                VALUES (1, 'best_price', 0, JSON_ARRAY('flash', 'seasonal', 'product', 'category', 'coupon'))
            `);
            this._discountEngineEnsured = true;
        } catch (e) {
            console.error('ensureDiscountEngineTables:', e.message);
        }
    }

    async getPricingEngineSettings() {
        await this.ensureDiscountEngineTables();
        const [[row]] = await this.pool.query('SELECT * FROM pricing_engine_settings WHERE id = 1');
        if (!row) {
            return {
                resolution_mode: 'best_price',
                allow_stack: false,
                tier_order: ['flash', 'seasonal', 'product', 'category', 'coupon']
            };
        }
        let tier_order = ['flash', 'seasonal', 'product', 'category', 'coupon'];
        try {
            if (row.tier_order) {
                const t = typeof row.tier_order === 'string' ? JSON.parse(row.tier_order) : row.tier_order;
                if (Array.isArray(t)) tier_order = t;
            }
        } catch (_) {}
        return {
            resolution_mode: row.resolution_mode || 'best_price',
            allow_stack: !!row.allow_stack,
            tier_order
        };
    }

    async updatePricingEngineSettings(patch) {
        await this.ensureDiscountEngineTables();
        const cur = await this.getPricingEngineSettings();
        const resolution_mode = patch.resolution_mode != null ? patch.resolution_mode : cur.resolution_mode;
        const allow_stack = patch.allow_stack != null ? !!patch.allow_stack : cur.allow_stack;
        const tier_order = patch.tier_order != null ? patch.tier_order : cur.tier_order;
        await this.pool.query(
            'UPDATE pricing_engine_settings SET resolution_mode = ?, allow_stack = ?, tier_order = ? WHERE id = 1',
            [resolution_mode, allow_stack ? 1 : 0, JSON.stringify(tier_order)]
        );
        return this.getPricingEngineSettings();
    }

    async getActiveDiscountRulesAt(now = new Date()) {
        await this.ensureDiscountEngineTables();
        const [rows] = await this.pool.query(
            `SELECT * FROM discount_rules WHERE is_active = 1
             AND (starts_at IS NULL OR starts_at <= ?)
             AND (ends_at IS NULL OR ends_at >= ?)
             AND (max_uses IS NULL OR use_count < max_uses)`,
            [now, now]
        );
        return rows.map((r) => ({
            ...r,
            is_active: !!r.is_active,
            stackable: !!r.stackable,
            bogo_json: r.bogo_json
        }));
    }

    async getCouponRuleByCode(code) {
        await this.ensureDiscountEngineTables();
        if (!code || !String(code).trim()) return null;
        const c = String(code).trim().toUpperCase();
        const [rows] = await this.pool.query(
            `SELECT dr.* FROM discount_coupons dc
             JOIN discount_rules dr ON dr.id = dc.discount_rule_id
             WHERE UPPER(dc.code) = ? AND dc.is_active = 1
             AND (dc.expires_at IS NULL OR dc.expires_at >= NOW())
             AND (dc.max_uses IS NULL OR dc.use_count < dc.max_uses)
             AND dr.is_active = 1`,
            [c]
        );
        const rule = rows && rows[0];
        if (!rule) return null;
        return {
            ...rule,
            tier: 'coupon',
            is_active: !!rule.is_active,
            stackable: !!rule.stackable
        };
    }

    enrichProductRow(product, rules, settings, couponRule = null) {
        const cat = product.category_id != null ? Number(product.category_id) : null;
        const pricing = computeFinalPricing({
            product,
            categoryId: cat,
            rules,
            settings,
            quantity: 1,
            couponRule,
            now: new Date()
        });
        const stock = product.stock != null ? Number(product.stock) : 0;
        const sold_out = stock <= 0;
        return {
            ...product,
            pricing,
            stock,
            sold_out,
            display_price: pricing.final_price,
            compare_at_price: pricing.compare_at_price
        };
    }

    async enrichProductsWithPricing(products, couponCode = null) {
        await this.ensureDiscountEngineTables();
        const settings = await this.getPricingEngineSettings();
        const rules = await this.getActiveDiscountRulesAt(new Date());
        let couponRule = null;
        if (couponCode) {
            couponRule = await this.getCouponRuleByCode(couponCode);
        }
        return (products || []).map((p) => this.enrichProductRow(p, rules, settings, couponRule));
    }

    async enrichSingleProductWithPricing(product, couponCode = null) {
        const [enriched] = await this.enrichProductsWithPricing([product], couponCode);
        return enriched || product;
    }

    async getActiveOffersForStorefront() {
        await this.ensureDiscountEngineTables();
        const now = new Date();
        const [campaigns] = await this.pool.query(
            `SELECT * FROM seasonal_campaigns
             WHERE is_active = 1 AND starts_at <= ? AND ends_at >= ?
             ORDER BY display_priority ASC, id DESC`,
            [now, now]
        );
        const settings = await this.getPricingEngineSettings();
        return { campaigns, settings };
    }

    async listSeasonalCampaignsAdmin() {
        await this.ensureDiscountEngineTables();
        const [rows] = await this.pool.query('SELECT * FROM seasonal_campaigns ORDER BY id DESC');
        return rows;
    }

    async createSeasonalCampaign(row) {
        await this.ensureDiscountEngineTables();
        const [r] = await this.pool.query(
            `INSERT INTO seasonal_campaigns
             (name, slug, hero_headline, hero_subheadline, hero_image_url, gradient_css, starts_at, ends_at, is_active, is_flash_sale, display_priority)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                row.name,
                row.slug,
                row.hero_headline || '',
                row.hero_subheadline || '',
                row.hero_image_url || '',
                row.gradient_css || 'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)',
                row.starts_at,
                row.ends_at,
                row.is_active ? 1 : 0,
                row.is_flash_sale ? 1 : 0,
                row.display_priority || 0
            ]
        );
        return r.insertId;
    }

    async updateSeasonalCampaign(id, row) {
        await this.ensureDiscountEngineTables();
        const fields = [];
        const vals = [];
        const map = [
            'name',
            'slug',
            'hero_headline',
            'hero_subheadline',
            'hero_image_url',
            'gradient_css',
            'starts_at',
            'ends_at',
            'is_active',
            'is_flash_sale',
            'display_priority'
        ];
        for (const k of map) {
            if (row[k] !== undefined) {
                fields.push(`${k} = ?`);
                if (k === 'is_active' || k === 'is_flash_sale') vals.push(row[k] ? 1 : 0);
                else vals.push(row[k]);
            }
        }
        if (!fields.length) return { changes: 0 };
        vals.push(id);
        const [u] = await this.pool.query(`UPDATE seasonal_campaigns SET ${fields.join(', ')} WHERE id = ?`, vals);
        return { changes: u.affectedRows };
    }

    async deleteSeasonalCampaign(id) {
        await this.ensureDiscountEngineTables();
        const [r] = await this.pool.query('DELETE FROM seasonal_campaigns WHERE id = ?', [id]);
        return { changes: r.affectedRows };
    }

    async listDiscountRulesAdmin() {
        await this.ensureDiscountEngineTables();
        const [rows] = await this.pool.query('SELECT * FROM discount_rules ORDER BY id DESC');
        return rows;
    }

    async createDiscountRule(row) {
        await this.ensureDiscountEngineTables();
        const [r] = await this.pool.query(
            `INSERT INTO discount_rules
             (campaign_id, scope, product_id, category_id, tier, discount_type, percent_off, fixed_off, bogo_json,
              min_quantity, starts_at, ends_at, is_active, stackable, rule_priority, max_uses)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                row.campaign_id || null,
                row.scope || 'product',
                row.product_id || null,
                row.category_id || null,
                row.tier || 'product',
                row.discount_type || 'percent',
                row.percent_off != null ? row.percent_off : null,
                row.fixed_off != null ? row.fixed_off : null,
                row.bogo_json ? JSON.stringify(row.bogo_json) : null,
                row.min_quantity || 1,
                row.starts_at || null,
                row.ends_at || null,
                row.is_active !== false ? 1 : 0,
                row.stackable ? 1 : 0,
                row.rule_priority != null ? row.rule_priority : 100,
                row.max_uses != null ? row.max_uses : null
            ]
        );
        return r.insertId;
    }

    async updateDiscountRule(id, row) {
        await this.ensureDiscountEngineTables();
        const [[ex]] = await this.pool.query('SELECT id FROM discount_rules WHERE id = ?', [id]);
        if (!ex) return { changes: 0 };
        const fields = [];
        const vals = [];
        const keys = [
            'campaign_id',
            'scope',
            'product_id',
            'category_id',
            'tier',
            'discount_type',
            'percent_off',
            'fixed_off',
            'min_quantity',
            'starts_at',
            'ends_at',
            'is_active',
            'stackable',
            'rule_priority',
            'max_uses'
        ];
        for (const k of keys) {
            if (row[k] !== undefined) {
                fields.push(`${k} = ?`);
                if (k === 'is_active' || k === 'stackable') vals.push(row[k] ? 1 : 0);
                else vals.push(row[k]);
            }
        }
        if (row.bogo_json !== undefined) {
            fields.push('bogo_json = ?');
            vals.push(row.bogo_json ? JSON.stringify(row.bogo_json) : null);
        }
        if (!fields.length) return { changes: 0 };
        vals.push(id);
        const [u] = await this.pool.query(`UPDATE discount_rules SET ${fields.join(', ')} WHERE id = ?`, vals);
        return { changes: u.affectedRows };
    }

    async deleteDiscountRule(id) {
        await this.ensureDiscountEngineTables();
        await this.pool.query('DELETE FROM discount_coupons WHERE discount_rule_id = ?', [id]);
        const [r] = await this.pool.query('DELETE FROM discount_rules WHERE id = ?', [id]);
        return { changes: r.affectedRows };
    }

    async createCoupon(row) {
        await this.ensureDiscountEngineTables();
        const code = String(row.code || '').trim().toUpperCase();
        const [r] = await this.pool.query(
            `INSERT INTO discount_coupons (code, discount_rule_id, max_uses, expires_at, is_active)
             VALUES (?, ?, ?, ?, ?)`,
            [code, row.discount_rule_id, row.max_uses != null ? row.max_uses : null, row.expires_at || null, row.is_active !== false ? 1 : 0]
        );
        return r.insertId;
    }

    async listCouponsAdmin() {
        await this.ensureDiscountEngineTables();
        const [rows] = await this.pool.query(
            `SELECT dc.*, dr.discount_type, dr.percent_off, dr.fixed_off FROM discount_coupons dc
             JOIN discount_rules dr ON dr.id = dc.discount_rule_id ORDER BY dc.id DESC`
        );
        return rows;
    }

    async getDiscountAnalyticsSummary() {
        await this.ensureDiscountEngineTables();
        const [[tot]] = await this.pool.query(
            'SELECT COALESCE(SUM(amount_saved),0) AS saved, COALESCE(SUM(order_total),0) AS revenue, COUNT(*) AS events FROM discount_analytics'
        );
        const [topRules] = await this.pool.query(
            `SELECT discount_rule_id, SUM(amount_saved) AS saved FROM discount_analytics
             WHERE discount_rule_id IS NOT NULL GROUP BY discount_rule_id ORDER BY saved DESC LIMIT 5`
        );
        return {
            total_saved: Number(tot.saved) || 0,
            revenue_tracked: Number(tot.revenue) || 0,
            event_count: Number(tot.events) || 0,
            top_rules: topRules || []
        };
    }

    async logDiscountAnalyticsEntry({ order_id, discount_rule_id, coupon_code, amount_saved, order_total, product_id }) {
        await this.ensureDiscountEngineTables();
        await this.pool.query(
            `INSERT INTO discount_analytics (order_id, discount_rule_id, coupon_code, amount_saved, order_total, product_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                order_id || null,
                discount_rule_id || null,
                coupon_code || null,
                amount_saved != null ? amount_saved : 0,
                order_total != null ? order_total : 0,
                product_id || null
            ]
        );
    }
}

module.exports = new CalvoroMySQLDatabase();
