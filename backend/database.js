const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { computeFinalPricing } = require('./lib/pricingEngine');

const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DONATIONS_FILE = path.join(DATA_DIR, 'donations.json');
const PROMOTIONS_FILE = path.join(DATA_DIR, 'promotions.json');

class CalvoroDatabase {
    constructor() {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        this.products = this.loadJSON(PRODUCTS_FILE, []);
        this.categories = this.loadJSON(CATEGORIES_FILE, []);
        this.orders = this.loadJSON(ORDERS_FILE, []);
        this.admin = this.loadJSON(ADMIN_FILE, []);
        this.users = this.loadJSON(USERS_FILE, []);
        this.reviews = this.loadJSON(REVIEWS_FILE, []);
        this.donations = this.loadJSON(DONATIONS_FILE, []);
        this.promotions = this.loadJSON(PROMOTIONS_FILE, []);
        if (!Array.isArray(this.promotions)) this.promotions = [];
        this.settings = this.loadJSON(SETTINGS_FILE, {
            promoTicker: {
                lines: ['FREE SHIPPING ON ORDERS OVER LKR 15,000'],
                durationSeconds: 22
            },
            carousel: {
                slides: [
                    {
                        title: 'NEW ARRIVALS',
                        subtitle: 'Discover the latest collection',
                        image_url: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1600&h=600&fit=crop',
                        link_url: '/women.html',
                        button_text: 'SHOP NOW',
                        display_order: 0,
                        is_active: true
                    },
                    {
                        title: 'SUMMER COLLECTION',
                        subtitle: 'Light and comfortable styles',
                        image_url: 'https://images.unsplash.com/photo-1483181957632-8bda974cbc91?w=1600&h=600&fit=crop',
                        link_url: '/men.html',
                        button_text: 'EXPLORE',
                        display_order: 1,
                        is_active: true
                    },
                    {
                        title: 'GIFT VOUCHERS',
                        subtitle: 'The perfect gift for any occasion',
                        image_url: 'https://images.unsplash.com/photo-1513094735237-8f2714d57c13?w=1600&h=600&fit=crop',
                        link_url: '/gifts.html',
                        button_text: 'BUY NOW',
                        display_order: 2,
                        is_active: true
                    }
                ]
            },
            videoStrip: {
                items: [
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
                ]
            }
        });

        console.log('Database initialized with JSON files');
        this.createDefaultAdmin();
        this.seedDefaultCategories();
    }

    // ---- Donations (Stripe checkout) ----
    _reloadDonations() {
        this.donations = this.loadJSON(DONATIONS_FILE, this.donations || []);
        if (!Array.isArray(this.donations)) this.donations = [];
    }

    createDonation(donation) {
        this._reloadDonations();
        const id = this.donations.length > 0 ? Math.max(...this.donations.map(d => d.id || 0)) + 1 : 1;
        const row = {
            id,
            name: donation.name || '',
            email: donation.email || '',
            amount: Number(donation.amount) || 0,
            currency: donation.currency || 'LKR',
            payment_status: donation.payment_status || 'pending',
            stripe_session_id: donation.stripe_session_id || null,
            stripe_payment_intent: donation.stripe_payment_intent || null,
            reference_text: donation.reference_text || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        this.donations.unshift(row);
        this.saveJSON(DONATIONS_FILE, this.donations);
        return { lastInsertRowid: id, donation: row };
    }

    updateDonationByStripeSessionId(sessionId, patch) {
        this._reloadDonations();
        const idx = this.donations.findIndex(d => d.stripe_session_id === sessionId);
        if (idx === -1) return { changes: 0 };
        this.donations[idx] = {
            ...this.donations[idx],
            ...patch,
            updated_at: new Date().toISOString()
        };
        this.saveJSON(DONATIONS_FILE, this.donations);
        return { changes: 1, donation: this.donations[idx] };
    }

    getDonationByStripeSessionId(sessionId) {
        this._reloadDonations();
        return this.donations.find(d => d.stripe_session_id === sessionId) || null;
    }

    getDonationsForAdmin(limit = 200) {
        this._reloadDonations();
        const n = Math.min(1000, Math.max(1, Number(limit) || 200));
        return this.donations.slice(0, n);
    }

    updateDonationById(id, patch) {
        this._reloadDonations();
        const idx = this.donations.findIndex(d => String(d.id) === String(id));
        if (idx === -1) return { changes: 0 };
        this.donations[idx] = {
            ...this.donations[idx],
            ...patch,
            updated_at: new Date().toISOString()
        };
        this.saveJSON(DONATIONS_FILE, this.donations);
        return { changes: 1, donation: this.donations[idx] };
    }

    seedDefaultCategories() {
        const defaults = [
            { id: 1, name: 'Men', slug: 'men', created_at: new Date().toISOString() },
            { id: 2, name: 'Women', slug: 'women', created_at: new Date().toISOString() },
            { id: 3, name: 'Gifts', slug: 'gifts', created_at: new Date().toISOString() }
        ];
        if (this.categories.length === 0) {
            this.categories = defaults;
            this.saveJSON(CATEGORIES_FILE, this.categories);
            console.log('Default categories (Men, Women, Gifts) created');
        } else {
            defaults.forEach(d => {
                if (!this.categories.find(c => c.slug === d.slug)) {
                    const id = Math.max(...this.categories.map(c => c.id), 0) + 1;
                    this.categories.push({ ...d, id });
                }
            });
            this.saveJSON(CATEGORIES_FILE, this.categories);
        }
    }

    loadJSON(file, defaultValue) {
        if (fs.existsSync(file)) {
            try {
                const data = fs.readFileSync(file, 'utf8');
                return JSON.parse(data);
            } catch (error) {
                console.error(`Error loading ${file}:`, error.message);
                return defaultValue;
            }
        }
        return defaultValue;
    }

    saveJSON(file, data) {
        try {
            fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            console.error(`Error saving ${file}:`, error.message);
        }
    }

    // ---- Site Settings (promo ticker) ----
    _loadSettingsFresh() {
        this.settings = this.loadJSON(SETTINGS_FILE, this.settings || {});
        if (!this.settings || typeof this.settings !== 'object') this.settings = {};
        if (!this.settings.promoTicker || typeof this.settings.promoTicker !== 'object') {
            this.settings.promoTicker = { lines: ['FREE SHIPPING ON ORDERS OVER LKR 15,000'], durationSeconds: 22 };
        }
        if (!Array.isArray(this.settings.promoTicker.lines)) this.settings.promoTicker.lines = [];
        if (!this.settings.promoTicker.durationSeconds) this.settings.promoTicker.durationSeconds = 22;

        if (!this.settings.carousel || typeof this.settings.carousel !== 'object') {
            this.settings.carousel = { slides: [] };
        }
        if (!Array.isArray(this.settings.carousel.slides)) this.settings.carousel.slides = [];
        if (this.settings.carousel.slides.length === 0) {
            this.settings.carousel.slides = [
                {
                    title: 'NEW ARRIVALS',
                    subtitle: 'Discover the latest collection',
                    image_url: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1600&h=600&fit=crop',
                    link_url: '/women.html',
                    button_text: 'SHOP NOW',
                    display_order: 0,
                    is_active: true
                },
                {
                    title: 'SUMMER COLLECTION',
                    subtitle: 'Light and comfortable styles',
                    image_url: 'https://images.unsplash.com/photo-1483181957632-8bda974cbc91?w=1600&h=600&fit=crop',
                    link_url: '/men.html',
                    button_text: 'EXPLORE',
                    display_order: 1,
                    is_active: true
                },
                {
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

        if (!this.settings.videoStrip || typeof this.settings.videoStrip !== 'object') {
            this.settings.videoStrip = { items: [] };
        }
        if (!Array.isArray(this.settings.videoStrip.items)) this.settings.videoStrip.items = [];
        if (this.settings.videoStrip.items.length === 0) {
            this.settings.videoStrip.items = [
                { label: 'SHOP WOMEN', href: 'women.html', videoSrc: 'videos/women.mp4' },
                { label: 'SHOP MEN', href: 'men.html', videoSrc: 'videos/men.mp4' },
                { label: 'GIFT VOUCHERS', href: 'gifts.html', videoSrc: 'videos/gifts.mp4' }
            ];
        }
    }

    getPromoTicker() {
        this._loadSettingsFresh();
        return {
            lines: Array.isArray(this.settings.promoTicker.lines) ? this.settings.promoTicker.lines : [],
            durationSeconds: Number(this.settings.promoTicker.durationSeconds) || 22
        };
    }

    setPromoTicker({ lines, durationSeconds }) {
        this._loadSettingsFresh();
        const cleaned = Array.isArray(lines) ? lines
            .map(s => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 30) : [];
        this.settings.promoTicker.lines = cleaned;
        const dur = Math.max(8, Math.min(120, Number(durationSeconds) || 22));
        this.settings.promoTicker.durationSeconds = dur;
        this.saveJSON(SETTINGS_FILE, this.settings);
        return this.getPromoTicker();
    }

    // ---- Hero carousel (home page) ----
    getCarouselSlides() {
        this._loadSettingsFresh();
        const slides = Array.isArray(this.settings.carousel.slides) ? this.settings.carousel.slides : [];
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
    }

    setCarouselSlides({ slides }) {
        this._loadSettingsFresh();
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

        this.settings.carousel.slides = cleaned;
        this.saveJSON(SETTINGS_FILE, this.settings);
        return this.getCarouselSlides();
    }

    // ---- Video strip (home page 3 videos) ----
    getVideoStrip() {
        this._loadSettingsFresh();
        const items = Array.isArray(this.settings.videoStrip.items) ? this.settings.videoStrip.items : [];
        // Return up to 3 items
        return items.slice(0, 3).map(it => ({
            label: it && it.label != null ? String(it.label).slice(0, 80).trim() : '',
            href: it && it.href != null ? String(it.href).slice(0, 250).trim() : '',
            videoSrc: it && it.videoSrc != null ? String(it.videoSrc).slice(0, 500).trim() : ''
        }));
    }

    // ---- Promotions (scroll-triggered popup; JSON mode) ----
    _reloadPromotions() {
        this.promotions = this.loadJSON(PROMOTIONS_FILE, []);
        if (!Array.isArray(this.promotions)) this.promotions = [];
    }

    _savePromotions() {
        this.saveJSON(PROMOTIONS_FILE, this.promotions);
    }

    getActivePromotion() {
        this._reloadPromotions();
        const withImage = this.promotions.filter(
            (p) => p && p.is_active && String(p.image_path || '').trim()
        );
        if (!withImage.length) return null;
        withImage.sort((a, b) => (b.id || 0) - (a.id || 0));
        const p = withImage[0];
        return {
            id: p.id,
            image_path: String(p.image_path || '').trim(),
            redirect_link: String(p.redirect_link || '').trim(),
            is_active: !!p.is_active
        };
    }

    getAllPromotions() {
        this._reloadPromotions();
        return [...this.promotions]
            .sort((a, b) => (b.id || 0) - (a.id || 0))
            .map((p) => ({
                id: p.id,
                image_path: String(p.image_path || ''),
                redirect_link: String(p.redirect_link || ''),
                is_active: !!p.is_active,
                created_at: p.created_at || null,
                updated_at: p.updated_at || null
            }));
    }

    createPromotion({ image_path, redirect_link, is_active }) {
        this._reloadPromotions();
        const active = !!is_active;
        if (active) {
            this.promotions.forEach((row) => {
                row.is_active = false;
            });
        }
        const id = this.promotions.length ? Math.max(...this.promotions.map((p) => p.id || 0)) + 1 : 1;
        const now = new Date().toISOString();
        const row = {
            id,
            image_path: String(image_path || '').trim().slice(0, 1024),
            redirect_link: String(redirect_link || '').trim().slice(0, 2048),
            is_active: active,
            created_at: now,
            updated_at: now
        };
        this.promotions.push(row);
        this._savePromotions();
        return { ...row };
    }

    updatePromotion(id, patch) {
        this._reloadPromotions();
        const nId = parseInt(id, 10);
        const idx = this.promotions.findIndex((p) => p.id === nId);
        if (idx === -1) return null;

        if (patch.is_active === true) {
            this.promotions.forEach((row) => {
                if (row.id !== nId) row.is_active = false;
            });
        }

        const row = this.promotions[idx];
        if (patch.image_path !== undefined) {
            row.image_path = String(patch.image_path).trim().slice(0, 1024);
        }
        if (patch.redirect_link !== undefined) {
            row.redirect_link = String(patch.redirect_link).trim().slice(0, 2048);
        }
        if (patch.is_active !== undefined) {
            row.is_active = !!patch.is_active;
        }
        row.updated_at = new Date().toISOString();
        this._savePromotions();
        return {
            id: row.id,
            image_path: row.image_path,
            redirect_link: row.redirect_link,
            is_active: !!row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

    deletePromotion(id) {
        this._reloadPromotions();
        const nId = parseInt(id, 10);
        const before = this.promotions.length;
        this.promotions = this.promotions.filter((p) => p.id !== nId);
        const removed = before - this.promotions.length;
        if (removed) this._savePromotions();
        return { changes: removed };
    }

    /** No-op in JSON mode (MySQL runs real migration via ensurePromotionsTable). */
    ensurePromotionsTable() {
        return Promise.resolve();
    }

    ensureDiscountEngineTables() {
        return Promise.resolve();
    }

    enrichProductsWithPricing(products) {
        const settings = {
            resolution_mode: 'best_price',
            allow_stack: false,
            tier_order: ['flash', 'seasonal', 'product', 'category', 'coupon']
        };
        return (products || []).map((p) => {
            const pricing = computeFinalPricing({
                product: p,
                categoryId: p.category_id != null ? Number(p.category_id) : null,
                rules: [],
                settings,
                quantity: 1,
                now: new Date()
            });
            const stock = p.stock != null ? Number(p.stock) : 0;
            return {
                ...p,
                pricing,
                stock,
                sold_out: stock <= 0,
                display_price: pricing.final_price,
                compare_at_price: pricing.compare_at_price
            };
        });
    }

    enrichSingleProductWithPricing(product, _couponCode) {
        const [one] = this.enrichProductsWithPricing([product]);
        return one || product;
    }

    getActiveOffersForStorefront() {
        return Promise.resolve({ campaigns: [], settings: { resolution_mode: 'best_price', allow_stack: false } });
    }

    getDiscountAnalyticsSummary() {
        return Promise.resolve({
            total_saved: 0,
            revenue_tracked: 0,
            event_count: 0,
            top_rules: []
        });
    }

    getPricingEngineSettings() {
        return Promise.resolve({
            resolution_mode: 'best_price',
            allow_stack: false,
            tier_order: ['flash', 'seasonal', 'product', 'category', 'coupon']
        });
    }

    updatePricingEngineSettings(patch) {
        return Promise.resolve({
            resolution_mode: (patch && patch.resolution_mode) || 'best_price',
            allow_stack: !!(patch && patch.allow_stack),
            tier_order: (patch && patch.tier_order) || ['flash', 'seasonal', 'product', 'category', 'coupon']
        });
    }

    listSeasonalCampaignsAdmin() {
        return Promise.resolve([]);
    }

    createSeasonalCampaign() {
        throw new Error('Seasonal campaigns require MySQL (set USE_MYSQL=true and run discount-engine-schema.sql).');
    }

    updateSeasonalCampaign() {
        return Promise.resolve({ changes: 0 });
    }

    deleteSeasonalCampaign() {
        return Promise.resolve({ changes: 0 });
    }

    listDiscountRulesAdmin() {
        return Promise.resolve([]);
    }

    createDiscountRule() {
        throw new Error('Discount rules require MySQL (set USE_MYSQL=true and run discount-engine-schema.sql).');
    }

    updateDiscountRule() {
        return Promise.resolve({ changes: 0 });
    }

    deleteDiscountRule() {
        return Promise.resolve({ changes: 0 });
    }

    listCouponsAdmin() {
        return Promise.resolve([]);
    }

    createCoupon() {
        throw new Error('Coupons require MySQL (set USE_MYSQL=true and run discount-engine-schema.sql).');
    }

    setVideoStrip({ items }) {
        this._loadSettingsFresh();
        const cleaned = Array.isArray(items) ? items
            .map(it => ({
                label: it && it.label != null ? String(it.label).replace(/\s+/g, ' ').trim().slice(0, 80) : '',
                href: it && it.href != null ? String(it.href).replace(/\s+/g, ' ').trim().slice(0, 250) : '',
                videoSrc: it && it.videoSrc != null ? String(it.videoSrc).replace(/\s+/g, ' ').trim().slice(0, 500) : ''
            }))
            .filter(it => it.href || it.videoSrc || it.label)
            .slice(0, 3) : [];

        // Ensure length 3 (frontend expects 3 panels)
        while (cleaned.length < 3) cleaned.push({ label: '', href: '', videoSrc: '' });

        this.settings.videoStrip.items = cleaned;
        this.saveJSON(SETTINGS_FILE, this.settings);
        return this.getVideoStrip();
    }

    createDefaultAdmin() {
        if (this.admin.length === 0) {
            const hash = bcrypt.hashSync('admin123', 10);
            this.admin.push({
                id: 1,
                username: 'admin',
                password_hash: hash,
                email: 'admin@calvoro.com',
                created_at: new Date().toISOString()
            });
            this.saveJSON(ADMIN_FILE, this.admin);
            console.log('Default admin created - Username: admin, Password: admin123');
        }
    }

    // Reload products from file so GET /api/products always returns latest (fixes "added in admin, not on frontend")
    reloadProductsFromFile() {
        this.products = this.loadJSON(PRODUCTS_FILE, this.products);
        this.categories = this.loadJSON(CATEGORIES_FILE, this.categories);
        if (this.categories.length === 0) this.seedDefaultCategories();
    }

    // Product methods
    getAllProducts() {
        this.reloadProductsFromFile();
        return this.products.map(p => {
            const category = this.categories.find(c => c.id === p.category_id);
            return {
                ...p,
                category_name: category ? category.name : null
            };
        });
    }

    getProductById(id) {
        const product = this.products.find(p => p.id == id);
        if (product) {
            const category = this.categories.find(c => c.id === product.category_id);
            return {
                ...product,
                category_name: category ? category.name : null
            };
        }
        return null;
    }

    createProduct(product) {
        const id = this.products.length > 0 ? Math.max(...this.products.map(p => p.id)) + 1 : 1;
        const newProduct = {
            ...product,
            id,
            created_at: new Date().toISOString()
        };
        this.products.push(newProduct);
        this.saveJSON(PRODUCTS_FILE, this.products);
        return { lastInsertRowid: id };
    }

    updateProduct(id, product) {
        const index = this.products.findIndex(p => p.id == id);
        if (index !== -1) {
            this.products[index] = {
                ...this.products[index],
                ...product,
                id: parseInt(id)
            };
            this.saveJSON(PRODUCTS_FILE, this.products);
            return { changes: 1 };
        }
        return { changes: 0 };
    }

    deleteProduct(id) {
        const index = this.products.findIndex(p => p.id == id);
        if (index !== -1) {
            this.products.splice(index, 1);
            this.saveJSON(PRODUCTS_FILE, this.products);
            return { changes: 1 };
        }
        return { changes: 0 };
    }

    // Category methods
    getAllCategories() {
        return this.categories;
    }

    getCategoryById(id) {
        return this.categories.find(c => c.id == id) || null;
    }

    createCategory(category) {
        const id = this.categories.length > 0 ? Math.max(...this.categories.map(c => c.id)) + 1 : 1;
        const newCategory = {
            ...category,
            id,
            created_at: new Date().toISOString()
        };
        this.categories.push(newCategory);
        this.saveJSON(CATEGORIES_FILE, this.categories);
        return { lastInsertRowid: id };
    }

    updateCategory(id, category) {
        const index = this.categories.findIndex(c => c.id == id);
        if (index !== -1) {
            this.categories[index] = {
                ...this.categories[index],
                ...category,
                id: parseInt(id)
            };
            this.saveJSON(CATEGORIES_FILE, this.categories);
            return { changes: 1 };
        }
        return { changes: 0 };
    }

    deleteCategory(id) {
        const index = this.categories.findIndex(c => c.id == id);
        if (index !== -1) {
            this.categories.splice(index, 1);
            this.saveJSON(CATEGORIES_FILE, this.categories);
            return { changes: 1 };
        }
        return { changes: 0 };
    }

    // Order methods
    getAllOrders() {
        return this.orders;
    }

    getOrderById(id) {
        return this.orders.find(o => o.id == id) || null;
    }

    createOrder(order) {
        this.reloadProductsFromFile();
        const items = order.items || [];
        for (const item of items) {
            const pid = item.id || item.product_id;
            const qty = parseInt(item.quantity, 10) || 1;
            const p = this.products.find((x) => x.id == pid);
            if (!p) {
                throw new Error(`Product not found: ${pid}`);
            }
            if ((p.stock || 0) < qty) {
                throw new Error(`Insufficient stock for product ${pid}`);
            }
        }
        const id = this.orders.length > 0 ? Math.max(...this.orders.map(o => o.id)) + 1 : 1;
        const newOrder = {
            ...order,
            id,
            user_id: order.user_id || null,
            created_at: new Date().toISOString()
        };
        this.orders.push(newOrder);
        this.saveJSON(ORDERS_FILE, this.orders);
        for (const item of items) {
            const pid = item.id || item.product_id;
            const qty = parseInt(item.quantity, 10) || 1;
            const idx = this.products.findIndex((x) => x.id == pid);
            if (idx !== -1) {
                this.products[idx].stock = Math.max(0, (this.products[idx].stock || 0) - qty);
            }
        }
        this.saveJSON(PRODUCTS_FILE, this.products);
        return { lastInsertRowid: id };
    }

    getOrdersByUserId(userId) {
        return this.orders.filter(o => o.user_id != null && o.user_id == userId);
    }

    updateOrderStatus(id, status) {
        const index = this.orders.findIndex(o => o.id == id);
        if (index !== -1) {
            this.orders[index].status = status;
            this.saveJSON(ORDERS_FILE, this.orders);
            return { changes: 1 };
        }
        return { changes: 0 };
    }

    // Gift vouchers (stub when using JSON DB; full support in MySQL)
    ensureGiftVoucherTables() { return Promise.resolve(); }
    createVoucher() { return Promise.resolve({ lastInsertRowid: 0 }); }
    getVoucherByCode() { return Promise.resolve(null); }
    getVoucherById() { return Promise.resolve(null); }
    validateVoucherForCart() { return Promise.resolve({ valid: false, message: 'Gift vouchers are not available in this mode.' }); }
    recordRedemption() { return Promise.resolve({ ok: true }); }
    getVouchersForAdmin() { return Promise.resolve([]); }
    updateVoucher() { return Promise.resolve({ changes: 0 }); }
    deleteVoucher() { return Promise.resolve({ changes: 0 }); }
    getRedemptionsByVoucherId() { return Promise.resolve([]); }

    // Admin methods
    getAdminByUsername(username) {
        return this.admin.find(a => a.username === username) || null;
    }

    // Customer user methods (for account section)
    getUserByEmail(email) {
        return this.users.find(u => u.email === email) || null;
    }

    getUserByEmailCaseInsensitive(email) {
        if (!email) return null;
        const lower = String(email).trim().toLowerCase();
        return this.users.find(u => (u.email || '').toLowerCase() === lower) || null;
    }

    createUser(user) {
        const id = this.users.length > 0 ? Math.max(...this.users.map(u => u.id)) + 1 : 1;
        this.users.push({
            ...user,
            id,
            email_verified: user.email_verified || false,
            verification_code: user.verification_code || null,
            verification_code_expires_at: user.verification_code_expires_at || null,
            created_at: new Date().toISOString()
        });
        this.saveJSON(USERS_FILE, this.users);
        return { lastInsertRowid: id };
    }

    updateUserVerification(email, data) {
        const u = this.users.find(x => (x.email || '').toLowerCase() === (email || '').toLowerCase());
        if (!u) return { changes: 0 };
        if (data.email_verified !== undefined) u.email_verified = !!data.email_verified;
        if (data.verification_code !== undefined) u.verification_code = data.verification_code;
        if (data.verification_code_expires_at !== undefined) u.verification_code_expires_at = data.verification_code_expires_at;
        this.saveJSON(USERS_FILE, this.users);
        return { changes: 1 };
    }

    getAllUsers() {
        return this.users.map(u => ({
            id: u.id,
            email: u.email,
            first_name: u.first_name,
            last_name: u.last_name,
            phone: u.phone,
            address: u.address,
            city: u.city,
            created_at: u.created_at
        }));
    }

    updateUserById(id, data) {
        const u = this.users.find(x => x.id == id);
        if (!u) return { changes: 0 };
        const allowed = ['first_name', 'last_name', 'phone', 'address', 'city'];
        allowed.forEach(k => { if (data[k] !== undefined) u[k] = data[k]; });
        this.saveJSON(USERS_FILE, this.users);
        return { changes: 1 };
    }

    deleteUserById(id) {
        const idx = this.users.findIndex(x => x.id == id);
        if (idx === -1) return { changes: 0 };
        this.users.splice(idx, 1);
        this.saveJSON(USERS_FILE, this.users);
        return { changes: 1 };
    }

    // Stats methods
    getStats() {
        const totalProducts = this.products.length;
        const totalOrders = this.orders.length;
        const completedOrders = this.orders.filter(o => o.status === 'completed');
        const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const pendingOrders = this.orders.filter(o => o.status === 'pending').length;

        return {
            totalProducts,
            totalOrders,
            totalUsers: (this.users || []).length,
            totalRevenue,
            pendingOrders
        };
    }

    getReviewsByProductId(productId) {
        return this.reviews.filter(r => r.product_id == productId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    getAllReviews() {
        return this.reviews;
    }

    getRecentReviewsWithProducts(limit = 20) {
        const sorted = [...this.reviews].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return sorted.slice(0, limit).map(r => {
            const p = this.products.find(pr => pr.id === r.product_id);
            return {
                ...r,
                product_name: p ? p.name : null,
                product_slug: p ? p.slug : null,
                product_images: p && p.images ? (Array.isArray(p.images) ? p.images : [p.images]) : []
            };
        });
    }

    createReview(review) {
        const id = this.reviews.length > 0 ? Math.max(...this.reviews.map(r => r.id)) + 1 : 1;
        const newReview = {
            id,
            product_id: parseInt(review.product_id),
            author_name: review.author_name || 'Guest',
            rating: Math.min(5, Math.max(1, parseInt(review.rating) || 5)),
            body: review.body || '',
            created_at: new Date().toISOString()
        };
        this.reviews.push(newReview);
        this.saveJSON(REVIEWS_FILE, this.reviews);
        return { lastInsertRowid: id };
    }

    getCartItems() { return []; }
    addToCart() { return {}; }
    updateCartItem() { return {}; }
    removeFromCart() { return {}; }
    clearCart() { return {}; }

    // Delivery stubs (full delivery engine requires MySQL; JSON mode returns basic defaults)
    ensureDeliveryTables() { return Promise.resolve(); }
    getDeliveryOptions({ cart_total }) {
        const total = Number(cart_total) || 0;
        return Promise.resolve([
            {
                id: null,
                code: 'standard',
                name: 'Standard Delivery',
                fee: total >= 15000 ? 0 : 500,
                eta_min_days: 3,
                eta_max_days: 5,
                is_pickup: false,
                is_same_day: false,
                cod_available: true
            }
        ]);
    }
    getOrderByTrackingNumber(trackingNumber) {
        return Promise.resolve(this.orders.find(o => o.tracking_number === trackingNumber) || null);
    }
    getOrderTrackingTimeline(orderId) {
        return Promise.resolve([]); // no timeline support in JSON mode
    }
    generateTrackingNumber() {
        const now = new Date();
        const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `CVR-${ymd}-${rand}`;
    }

    // Analytics stubs (full BI requires MySQL; these return empty data for JSON mode)
    ensureAnalyticsTables() { return Promise.resolve(); }
    getSalesMonthly() { return { data: [], totalRevenue: 0, totalOrders: 0 }; }
    getSalesAnnual() { return []; }
    getSalesDaily() { return { data: [] }; }
    getSalesBreakdown() { return { data: [] }; }
    getTopSoldProducts() { return []; }
    getLowStockProducts() { return []; }
    getOutOfStockProducts() { return []; }
    getProductViewsCount() { return []; }
    getTopCategoriesByRevenue() { return []; }
    getInventoryValue() { return { product_count: 0, total_value: 0 }; }
    getTotalCustomers() { return { total: this.users.length }; }
    getNewCustomers() { return { count: 0, data: [] }; }
    getTopCustomersBySpending() { return { data: [], total: 0 }; }
    getCustomerOrders() { return { data: [], total: 0 }; }
    getCustomerLocations() { return []; }
    getSearchTop() { return []; }
    getSearchNoResults() { return []; }
    getOrdersMetrics() { return { total: 0, pending: 0, completed: 0, cancelled: 0 }; }
    getRefundRate() { return { rate: 0, refunded: 0, total: 0 }; }
    getAOV() { return { aov: 0, totalRevenue: 0, orderCount: 0 }; }
    getLiveVisitorsCount() { return { count: 0 }; }
    getRecentOrdersForAnalytics() { return this.orders.slice(0, 10).map(o => ({ ...o, total: o.total })); }
    getRecentActivityFeed() { return this.orders.slice(0, 20).map(o => ({ type: 'order', id: o.id, message: `Order #${o.order_number}`, created_at: o.created_at })); }
    logSearch() {}
    logProductEvent() {}
    upsertLiveSession() {}
}

const syncDb = new CalvoroDatabase();

// Expose async interface (Promise-based) so server can use same code path as MySQL
const asyncDb = {};
for (const key of Object.getOwnPropertyNames(CalvoroDatabase.prototype)) {
    if (key !== 'constructor' && typeof syncDb[key] === 'function') {
        asyncDb[key] = function (...args) {
            return Promise.resolve(syncDb[key].apply(syncDb, args));
        };
    }
}

module.exports = asyncDb;
