// Enhanced main.js with full e-commerce functionality

// ======================
// CART MANAGEMENT (user-specific when logged in)
// Supports both backend session (API cart) and Google Sign-In (localStorage cart).
// ======================
class ShoppingCart {
    constructor() {
        this.items = this.loadCart();
        this._loggedIn = null; // cached: true/false/null (for "any" login)
        this._backendSession = null; // cached: true/false/null (backend only, for API vs localStorage)
        this.updateUI();
        this.refreshCartCount();
    }

    loadCart() {
        try {
            const saved = localStorage.getItem('calvoro_cart');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }

    saveCart() {
        localStorage.setItem('calvoro_cart', JSON.stringify(this.items));
        this.updateUI();
    }

    /** True if user has a backend session (cookie). Used to decide API cart vs localStorage cart. */
    async hasBackendSession() {
        if (this._backendSession !== null) return this._backendSession;
        try {
            const r = await fetch((window.CalvoroAPIBase || '') + '/api/users/me', { credentials: 'include' });
            const d = await r.json().catch(function() { return {}; });
            this._backendSession = !!(d && d.user);
            return this._backendSession;
        } catch (e) {
            this._backendSession = false;
            return false;
        }
    }

    /** True if user can use cart: either backend session OR Google Sign-In. */
    async isLoggedIn() {
        // Google Sign-In: treat as logged in so we don't redirect to login
        if (typeof window !== 'undefined' && window.CalvoroAuth && window.CalvoroAuth.getCurrentUser()) {
            return true;
        }
        if (this._loggedIn !== null) return this._loggedIn;
        try {
            const hasBackend = await this.hasBackendSession();
            this._loggedIn = hasBackend;
            return this._loggedIn;
        } catch (e) {
            this._loggedIn = false;
            return false;
        }
    }

    async refreshCartCount() {
        const loggedIn = await this.isLoggedIn();
        if (!loggedIn) {
            this.items = [];
            try { localStorage.removeItem('calvoro_cart'); } catch (e) {}
            this.updateUI();
            return;
        }
        const useApi = await this.hasBackendSession();
        if (useApi) {
            try {
                const r = await fetch((window.CalvoroAPIBase || '') + '/api/cart', { credentials: 'include' });
                const d = await r.json();
                const count = (d && d.itemCount) || 0;
                const badge = document.getElementById('cart-count');
                if (badge) {
                    badge.textContent = count;
                    badge.style.display = count > 0 ? 'flex' : 'none';
                }
            } catch (e) {}
            return;
        }
        // Google Sign-In only: use localStorage cart for count
        this.items = this.loadCart();
        const count = this.getCount();
        const badge = document.getElementById('cart-count');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
        this.updateUI();
    }

    async addItem(product) {
        const loggedIn = await this.isLoggedIn();
        if (!loggedIn) {
            alert('Please sign in or create an account to add items to your cart.');
            var returnPath = window.location.pathname + window.location.search;
            var sep = returnPath.indexOf('?') >= 0 ? '&' : '?';
            var q = 'cart_add=' + product.id;
            if (product.color) q += '&cart_color=' + encodeURIComponent(product.color);
            if (product.size) q += '&cart_size=' + encodeURIComponent(product.size);
            var loginUrl = new URL('login.html', window.location.origin);
            loginUrl.searchParams.set('redirect', returnPath + sep + q);
            window.location.href = loginUrl.href;
            return;
        }
        const useApi = await this.hasBackendSession();
        if (useApi) {
            try {
                const res = await fetch((window.CalvoroAPIBase || '') + '/api/cart/add', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        product_id: product.id,
                        quantity: product.quantity || 1,
                        color: product.color || '',
                        size: product.size || ''
                    })
                });
                if (res.ok) {
                    await this.refreshCartCount();
                    this.showNotification('Item added to cart!');
                } else {
                    alert('Please log in to add to cart.');
                }
            } catch (e) { alert('Please log in to add to cart.'); }
            return;
        }
        // Google Sign-In only: add to localStorage cart
        var item = {
            id: product.id,
            quantity: product.quantity || 1,
            color: product.color || '',
            size: product.size || '',
            name: product.name || ('Product ' + product.id),
            price: typeof product.price === 'number' ? product.price : 0,
            image: product.image || ''
        };
        this.items.push(item);
        this.saveCart();
        this.refreshCartCount();
        this.showNotification('Item added to cart!');
    }

    removeItem(index) {
        this.items.splice(index, 1);
        this.saveCart();
    }

    updateQuantity(index, quantity) {
        if (quantity > 0) {
            this.items[index].quantity = quantity;
            this.saveCart();
        } else {
            this.removeItem(index);
        }
    }

    getTotal() {
        return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    getCount() {
        return this.items.reduce((count, item) => count + item.quantity, 0);
    }

    clear() {
        this.items = [];
        this.saveCart();
    }

    updateUI() {
        const badge = document.getElementById('cart-count');
        if (badge) {
            const count = this.getCount();
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    showNotification(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'cart-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
}

const cart = new ShoppingCart();
if (typeof window !== 'undefined') window.cart = cart;

// ======================
// CART DRAWER (sidebar)
// ======================
window.CartDrawer = {
    overlay: null,
    drawer: null,
    FREE_SHIPPING_THRESHOLD: 15000,
    SHIPPING_FEE: 500,
    base() { return (window.CalvoroAPIBase !== undefined && window.CalvoroAPIBase) ? window.CalvoroAPIBase : (window.location && window.location.origin) || ''; },
    currency() { return (window.CalvoroCurrency && window.CalvoroCurrency.get()) || 'LKR'; },
    rate() { return (window.CalvoroCurrency && window.CalvoroCurrency.rate()) || 320; },
    fmt(n) { return this.currency() === 'USD' ? '$' + (n / this.rate()).toFixed(2) : 'LKR ' + Number(n).toLocaleString(); },
    noImg: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'72\' height=\'96\' viewBox=\'0 0 72 96\'%3E%3Crect fill=\'%23eee\' width=\'72\' height=\'96\'/%3E%3Ctext x=\'36\' y=\'48\' fill=\'%23999\' font-size=\'10\' text-anchor=\'middle\' dy=\'.3em\'%3ENo image%3C/text%3E%3C/svg%3E',

    init() {
        if (this.overlay) return;
        const overlay = document.createElement('div');
        overlay.className = 'cart-drawer-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = '<div class="cart-drawer-backdrop" aria-label="Close cart"></div>' +
            '<div class="cart-drawer-left" id="cart-drawer-left"><h2>You May Also Like</h2><div class="cart-drawer-left-products" id="cart-drawer-left-products">Loading...</div></div>' +
            '<div class="cart-drawer">' +
            '<div class="cart-drawer-header"><h2>My Cart</h2><button type="button" class="cart-drawer-close" aria-label="Close cart">&times;</button></div>' +
            '<div class="cart-drawer-body"><div class="cart-drawer-empty"><p>Your cart is empty.</p><a href="cart.html" class="cart-drawer-view-full">View cart</a></div></div>' +
            '<div class="cart-drawer-footer" style="display:none;">' +
            '<div class="cart-drawer-total"><span>Total</span><span id="cart-drawer-total">LKR 0</span></div>' +
            '<a href="checkout.html" id="cart-drawer-checkout" class="cart-drawer-btn-checkout" style="display:block;text-align:center;text-decoration:none;color:inherit;">CHECK OUT</a>' +
            '<button type="button" class="cart-drawer-btn-continue">CONTINUE SHOPPING</button>' +
            '<a href="cart.html" class="cart-drawer-view-full" style="margin-top:12px;">View full cart</a>' +
            '</div></div>';
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this.drawer = overlay.querySelector('.cart-drawer');
        overlay.querySelector('.cart-drawer-close').addEventListener('click', () => this.close());
        overlay.querySelector('.cart-drawer-backdrop').addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.overlay && this.overlay.classList.contains('active')) this.close(); });
        document.querySelectorAll('.header .cart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.open();
            });
        });
    },

    close() {
        if (this.overlay) this.overlay.classList.remove('active');
    },

    async open() {
        this.init();
        const body = this.drawer.querySelector('.cart-drawer-body');
        const footer = this.drawer.querySelector('.cart-drawer-footer');
        body.innerHTML = '<p style="text-align:center;padding:24px;color:var(--color-text-muted);">Loading...</p>';
        footer.style.display = 'none';
        this.overlay.classList.add('active');
        this.loadAlsoLikeLeft();
        const pathPrefix = (window.location.pathname || '').indexOf('/products/') >= 0 ? '../' : '';

        let items = [];
        let fromApi = false;
        try {
            const meRes = await fetch(this.base() + '/api/users/me', { credentials: 'include' });
            const meData = await meRes.json();
            if (meData && meData.user) {
                const cartRes = await fetch(this.base() + '/api/cart', { credentials: 'include' });
                const cartData = await cartRes.json();
                items = (cartData && cartData.items) ? cartData.items : [];
                fromApi = true;
            }
        } catch (e) {}
        if (!fromApi && window.cart && window.cart.items && window.cart.items.length) {
            items = window.cart.items.map(i => ({
                id: i.id,
                product_id: i.id,
                name: i.name,
                price: i.price || i.base_price,
                quantity: i.quantity,
                color: i.color || '',
                size: i.size || '',
                image: i.image || (i.images && i.images[0]) || ''
            }));
        }

        let subtotal = 0;
        items.forEach(i => { subtotal += (i.price || 0) * (i.quantity || 1); });
        const shipping = subtotal >= this.FREE_SHIPPING_THRESHOLD ? 0 : this.SHIPPING_FEE;
        const total = subtotal + shipping;
        const progressPct = Math.min(100, (subtotal / this.FREE_SHIPPING_THRESHOLD) * 100);

        let savedNote = '';
        try { savedNote = localStorage.getItem('calvoro_cart_note') || ''; } catch (e) {}

        if (!items.length) {
            body.innerHTML = '<div class="cart-drawer-empty"><p>Your cart is empty.</p><a href="' + pathPrefix + 'cart.html" class="cart-drawer-view-full">View cart</a></div>';
            footer.style.display = 'none';
            return;
        }

        const shippingHtml = subtotal >= this.FREE_SHIPPING_THRESHOLD
            ? '<div class="cart-drawer-shipping unlocked">CONGRATS! FREE SHIPPING UNLOCKED</div>'
            : '<div class="cart-drawer-shipping">Free shipping on orders over ' + this.fmt(this.FREE_SHIPPING_THRESHOLD) + '<div class="cart-drawer-shipping-progress"><div class="cart-drawer-shipping-progress-fill" style="width:' + progressPct + '%"></div></div><div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;">' + this.fmt(0) + ' — ' + this.fmt(this.FREE_SHIPPING_THRESHOLD) + '</div></div>';

        const itemsHtml = items.map((item, idx) => {
            const price = item.price || item.base_price || 0;
            const img = (item.image || (item.images && item.images[0])) || this.noImg;
            const lineTotal = price * (item.quantity || 1);
            const cartItemId = fromApi ? item.id : idx;
            return '<div class="cart-drawer-item" data-cart-id="' + cartItemId + '" data-index="' + idx + '">' +
                '<img src="' + (img + '').replace(/"/g, '&quot;') + '" alt="">' +
                '<div class="cart-drawer-item-details">' +
                '<h4>' + (item.name || '').replace(/</g, '&lt;') + '</h4>' +
                '<p>' + (item.color || 'N/A') + ' / ' + (item.size || 'N/A') + '</p>' +
                '<p><strong>' + this.fmt(lineTotal) + '</strong></p>' +
                '<div class="cart-drawer-item-qty">' +
                '<button type="button" data-action="minus">−</button>' +
                '<input type="number" value="' + (item.quantity || 1) + '" min="1" data-qty>' +
                '<button type="button" data-action="plus">+</button>' +
                '</div>' +
                '<button type="button" class="cart-drawer-item-remove" data-remove>Remove</button>' +
                '</div></div>';
        }).join('');

        body.innerHTML = shippingHtml + itemsHtml + '<div class="cart-drawer-note"><label><span class="note-icon">+</span> Leave a note with your order</label><textarea id="cart-drawer-note" placeholder="Gift message, delivery instructions..."></textarea></div>';

        const noteEl = document.getElementById('cart-drawer-note');
        if (noteEl) {
            noteEl.value = savedNote;
            noteEl.addEventListener('input', function() { try { localStorage.setItem('calvoro_cart_note', this.value); } catch (e) {} });
        }

        footer.style.display = 'block';
        footer.querySelector('#cart-drawer-total').textContent = this.fmt(total);
        const checkoutLink = footer.querySelector('#cart-drawer-checkout');
        if (checkoutLink) {
            checkoutLink.href = pathPrefix + 'checkout.html';
            checkoutLink.onclick = function() { try { var n = document.getElementById('cart-drawer-note'); if (n) localStorage.setItem('calvoro_cart_note', n.value); } catch (e) {} };
        }
        const fullCartLink = footer.querySelector('.cart-drawer-view-full');
        if (fullCartLink) fullCartLink.href = pathPrefix + 'cart.html';
        footer.querySelector('.cart-drawer-btn-continue').onclick = () => this.close();

        body.querySelectorAll('.cart-drawer-item-qty [data-action="minus"]').forEach(btn => {
            btn.addEventListener('click', () => this.updateQty(btn.closest('.cart-drawer-item'), -1, fromApi));
        });
        body.querySelectorAll('.cart-drawer-item-qty [data-action="plus"]').forEach(btn => {
            btn.addEventListener('click', () => this.updateQty(btn.closest('.cart-drawer-item'), 1, fromApi));
        });
        body.querySelectorAll('.cart-drawer-item-qty input[data-qty]').forEach(inp => {
            inp.addEventListener('change', (e) => this.setQty(e.target.closest('.cart-drawer-item'), parseInt(e.target.value, 10), fromApi));
        });
        body.querySelectorAll('.cart-drawer-item-remove').forEach(btn => {
            btn.addEventListener('click', () => this.removeItem(btn.closest('.cart-drawer-item'), fromApi));
        });
    },

    async loadAlsoLikeLeft() {
        const container = document.getElementById('cart-drawer-left-products');
        if (!container) return;
        try {
            const res = await fetch(this.base() + '/api/products?sort=newest');
            const products = await res.json();
            const list = Array.isArray(products) ? products.slice(0, 6) : [];
            if (!list.length) { container.innerHTML = '<p style="color:var(--color-text-muted);font-size:14px;">No products right now.</p>'; return; }
            const path = window.location.pathname || '';
            const inProducts = path.indexOf('/products/') >= 0 || path.endsWith('/products');
            const pathPrefix = inProducts ? '../' : '';
            const link = (id) => pathPrefix + (inProducts ? 'product.html?id=' + id : 'products/product.html?id=' + id);
            container.innerHTML = list.map(p => {
                const price = p.sale_price != null && p.sale_price < p.price ? p.sale_price : p.price;
                const img = (p.image_url || (p.images && p.images[0]) || (p.color_images && Object.values(p.color_images)[0]) || '').replace(/"/g, '&quot;');
                const name = (p.name || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
                const colorsCount = (p.colors && p.colors.length) ? p.colors.length : (p.color_images && Object.keys(p.color_images).length) || 0;
                const colorStr = colorsCount ? colorsCount + ' Color' + (colorsCount !== 1 ? 's' : '') : '';
                const fitStr = (p.fit && String(p.fit).trim()) ? String(p.fit).trim() : (p.product_type && String(p.product_type).trim()) ? String(p.product_type).trim() : '';
                const meta = (colorStr + (colorStr && fitStr ? ' \u2022 ' : '') + fitStr).replace(/</g, '&lt;').replace(/"/g, '&quot;');
                return '<a href="' + link(p.id) + '" class="card" onclick="window.CartDrawer.close()"><div class="img"><img src="' + img + '" alt=""></div><h3>' + name + '</h3>' + (meta ? '<p class="card-meta">' + meta + '</p>' : '') + '<p class="price">' + this.fmt(price) + '</p></a>';
            }).join('');
        } catch (e) {
            container.innerHTML = '<p style="color:var(--color-text-muted);font-size:14px;">Could not load recommendations.</p>';
        }
    },

    async updateQty(row, delta, fromApi) {
        const idx = parseInt(row.dataset.index, 10);
        const input = row.querySelector('input[data-qty]');
        let qty = parseInt(input.value, 10) + delta;
        if (qty < 1) { this.removeItem(row, fromApi); return; }
        input.value = qty;
        await this.syncQty(row, qty, fromApi);
    },
    async setQty(row, qty, fromApi) {
        if (qty < 1) { this.removeItem(row, fromApi); return; }
        row.querySelector('input[data-qty]').value = qty;
        await this.syncQty(row, qty, fromApi);
    },
    async syncQty(row, qty, fromApi) {
        const cartId = row.dataset.cartId;
        if (fromApi && cartId) {
            try {
                await fetch(this.base() + '/api/cart/' + cartId, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: qty }) });
                if (window.cart && window.cart.refreshCartCount) window.cart.refreshCartCount();
                this.open();
                return;
            } catch (e) {}
        }
        if (window.cart && window.cart.items) {
            const idx = parseInt(row.dataset.index, 10);
            window.cart.updateQuantity(idx, qty);
            if (window.cart.refreshCartCount) window.cart.refreshCartCount();
            this.open();
        }
    },
    async removeItem(row, fromApi) {
        const cartId = row.dataset.cartId;
        if (fromApi && cartId) {
            try {
                await fetch(this.base() + '/api/cart/' + cartId, { method: 'DELETE', credentials: 'include' });
                if (window.cart && window.cart.refreshCartCount) window.cart.refreshCartCount();
                this.open();
                return;
            } catch (e) {}
        }
        const idx = parseInt(row.dataset.index, 10);
        if (window.cart && window.cart.removeItem) window.cart.removeItem(idx);
        if (window.cart && window.cart.refreshCartCount) window.cart.refreshCartCount();
        this.open();
    },

};

document.addEventListener('DOMContentLoaded', function() {
    if (window.CartDrawer && window.CartDrawer.init) window.CartDrawer.init();
});

// ======================
// SEARCH FUNCTIONALITY
// ======================
class ProductSearch {
    constructor() {
        this.searchInput = document.getElementById('searchInput');
        this.searchOverlay = document.getElementById('searchOverlay');
        this.searchTrigger = document.querySelector('.search-trigger');
        this.initializeSearch();
    }

    initializeSearch() {
        if (this.searchTrigger && this.searchOverlay) {
            this.searchTrigger.addEventListener('click', () => this.open());
        }

        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.searchOverlay?.classList.contains('active')) {
                this.close();
            }
        });
    }

    open() {
        this.searchOverlay.classList.add('active');
        this.searchInput.focus();
    }

    close() {
        this.searchOverlay.classList.remove('active');
        this.searchInput.value = '';
    }

    async handleSearch(query) {
        if (query.length < 2) return;

        try {
            const response = await fetch(`/api/products?search=${encodeURIComponent(query)}`);
            const products = await response.json();
            this.displayResults(products);
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    displayResults(products) {
        const container = this.searchOverlay && this.searchOverlay.querySelector('.search-results');
        const productLink = (id) => `products/product.html?id=${id}`;
        if (container) {
            if (!products.length) {
                container.innerHTML = '<p class="search-no-results">No products found.</p>';
                container.style.display = 'block';
                return;
            }
            container.innerHTML = products.slice(0, 8).map(p => `
                <a href="${productLink(p.id)}" class="search-result-item" onclick="search.close();">
                    <img src="${p.image_url || (p.images && p.images[0]) || (p.color_images && Object.values(p.color_images)[0]) || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 48 48%22%3E%3Crect fill=%22%23eee%22 width=%2248%22 height=%2248%22/%3E%3Ctext x=%2224%22 y=%2226%22 fill=%22%23999%22 font-size=%228%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo image%3C/text%3E%3C/svg%3E'}" alt="${p.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 48 48%22%3E%3Crect fill=%22%23eee%22 width=%2248%22 height=%2248%22/%3E%3Ctext x=%2224%22 y=%2226%22 fill=%22%23999%22 font-size=%228%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo image%3C/text%3E%3C/svg%3E'">
                    <span>${p.name}</span>
                    <span class="search-result-price">${(window.CalvoroCurrency && window.CalvoroCurrency.get() === 'USD') ? '$' + (p.price / (window.CalvoroCurrency.rate() || 320)).toFixed(2) : 'LKR ' + Number(p.price).toLocaleString()}</span>
                </a>
            `).join('');
            container.style.display = 'block';
        } else {
            if (products.length === 1) window.location.href = productLink(products[0].id);
            else if (products.length > 0) window.location.href = `men.html?search=${encodeURIComponent(this.searchInput.value)}`;
        }
    }
}

const search = new ProductSearch();

// ======================
// PRODUCT FILTERING
// ======================
class ProductFilters {
    constructor() {
        this.activeFilters = {
            categories: [],
            productTypes: [],
            colors: [],
            sizes: [],
            fits: [],
            priceRange: { min: 0, max: Infinity },
            sort: 'featured'
        };
        this.initialProductsHTML = null;
        this.initializeFilters();
    }

    initializeFilters() {
        // Category and checkbox filters
        document.querySelectorAll('.filter-options input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.handleFilterChange(e));
        });

        // Sort and price radio filters
        document.querySelectorAll('.filter-options input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const name = (e.target.getAttribute('name') || '').toLowerCase();
                const value = (e.target.value || '').trim();
                if (name === 'sort') {
                    this.activeFilters.sort = value;
                    this.applyFilters();
                } else if (name === 'price' || name === 'gift_price') {
                    const parts = value.split('-').map(n => parseInt(n, 10));
                    this.activeFilters.priceRange = {
                        min: isNaN(parts[0]) ? 0 : parts[0],
                        max: (parts.length > 1 && !isNaN(parts[1])) ? parts[1] : Infinity
                    };
                    this.applyFilters();
                }
            });
        });

        document.querySelectorAll('.sort-options input').forEach(radio => {
            if (radio.checked) this.activeFilters.sort = radio.value || 'featured';
        });

        // Filter toggles - open/close each section
        document.querySelectorAll('.filter-toggle').forEach(toggle => {
            toggle.addEventListener('click', function () {
                const options = this.nextElementSibling;
                if (options && options.classList.contains('filter-options')) {
                    options.classList.toggle('active');
                    const arrow = this.querySelector('span');
                    if (arrow) {
                        arrow.textContent = options.classList.contains('active') ? '▲' : '▼';
                    }
                }
            });
        });

        // Initial load: always fetch products for this collection so "no filters" shows correct list
        const runInitialLoad = () => {
            const container = document.querySelector('.products');
            if (container && document.body.dataset.collection) {
                this.initialProductsHTML = null;
                this.applyFilters();
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runInitialLoad);
        } else {
            runInitialLoad();
        }
    }

    handleFilterChange(event) {
        const checkbox = event.target;
        const filterEl = checkbox.closest('.filter');
        const filterLabel = filterEl ? filterEl.querySelector('.filter-toggle').textContent.trim().toLowerCase() : '';
        const value = (checkbox.value || (checkbox.nextSibling && checkbox.nextSibling.textContent ? checkbox.nextSibling.textContent.trim() : '')).trim();
        const name = (checkbox.getAttribute('name') || '').toLowerCase();
        const normalized = value.toLowerCase();

        if (filterLabel.includes('category') && !filterLabel.includes('collection')) {
            if (checkbox.checked) {
                if (!this.activeFilters.productTypes.includes(value)) this.activeFilters.productTypes.push(value);
            } else {
                this.activeFilters.productTypes = this.activeFilters.productTypes.filter(t => t !== value);
            }
        } else if (name === 'color') {
            if (checkbox.checked) {
                if (!this.activeFilters.colors.includes(normalized)) this.activeFilters.colors.push(normalized);
            } else this.activeFilters.colors = this.activeFilters.colors.filter(c => c !== normalized);
        } else if (name === 'size') {
            if (checkbox.checked) {
                if (!this.activeFilters.sizes.includes(value)) this.activeFilters.sizes.push(value);
            } else this.activeFilters.sizes = this.activeFilters.sizes.filter(s => s !== value);
        } else if (name === 'fit') {
            if (checkbox.checked) {
                if (!this.activeFilters.fits.includes(normalized)) this.activeFilters.fits.push(normalized);
            } else this.activeFilters.fits = this.activeFilters.fits.filter(f => f !== normalized);
        }

        this.applyFilters();
    }

    async applyFilters() {
        const container = document.querySelector('.products');
        if (!container) return;

        const collectionCategory = document.body.dataset.collection || '';
        const pr = this.activeFilters.priceRange || {};
        const priceActive = (pr.min != null && pr.min > 0) || (pr.max != null && pr.max < Infinity);
        const hasFilterSelection = this.activeFilters.productTypes.length > 0 || this.activeFilters.colors.length > 0 || this.activeFilters.sizes.length > 0 || this.activeFilters.fits.length > 0 || priceActive || (this.activeFilters.sort && this.activeFilters.sort !== 'featured');

        try {
            if (!hasFilterSelection && this.initialProductsHTML != null) {
                container.innerHTML = this.initialProductsHTML;
                return;
            }
            container.innerHTML = '<p class="products-loading">' + (this.initialProductsHTML == null ? 'Loading...' : 'Updating...') + '</p>';
            const params = new URLSearchParams();
            if (collectionCategory) params.append('category', collectionCategory);
            if (this.activeFilters.productTypes.length) params.append('product_type', this.activeFilters.productTypes.join(','));
            if (this.activeFilters.colors.length) params.append('color', this.activeFilters.colors.join(','));
            if (this.activeFilters.sizes.length) params.append('size', this.activeFilters.sizes.join(','));
            if (this.activeFilters.fits.length) params.append('fit', this.activeFilters.fits.join(','));
            if (this.activeFilters.sort && this.activeFilters.sort !== 'featured') params.append('sort', this.activeFilters.sort);
            if (pr.min != null && pr.min > 0) params.append('min_price', String(pr.min));
            if (pr.max != null && pr.max < Infinity) params.append('max_price', String(pr.max));
            params.append('pricing', '1');

            const apiBase = (window.CalvoroAPIBase !== undefined) ? window.CalvoroAPIBase : (window.location.origin || '');
            const apiUrl = apiBase + '/api/products?' + params.toString();
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error('Server returned ' + response.status);
            const data = await response.json();
            const products = Array.isArray(data) ? data : (data.products || []);
            this.displayProducts(products);
            if (this.initialProductsHTML == null && !hasFilterSelection) this.initialProductsHTML = container.innerHTML;
        } catch (error) {
            console.error('Filter error:', error);
            container.innerHTML = '<p class="no-products-msg">Could not load products. Make sure the server is running (e.g. <code>node server.js</code> in the backend folder) and you open this site at <a href="/">' + (window.location.origin || '') + '</a>.</p>';
            const countEl = document.querySelector('.results-count');
            if (countEl) countEl.textContent = 'Error loading';
        }
    }

    displayProducts(products) {
        const container = document.querySelector('.products');
        if (!container) return;

        if (!products || products.length === 0) {
            container.innerHTML = '<p class="no-products-msg">No products found. Add products from the <a href="/admin/">admin panel</a>.</p>';
            const countEl = document.querySelector('.results-count');
            if (countEl) countEl.textContent = 'Showing 0 products';
            return;
        }

        const baseCmp = (p) => {
            if (p.pricing && p.pricing.compare_at_price != null) return p.pricing.compare_at_price;
            return p.price != null ? p.price : p.base_price;
        };
        const finalP = (p) => {
            if (p.pricing && typeof p.pricing.final_price === 'number') return p.pricing.final_price;
            const b = p.price != null ? p.price : p.base_price;
            const s = p.sale_price != null ? p.sale_price : b;
            return s < b ? s : b;
        };
        const productLink = (id) => `products/product.html?id=${id}`;

        const currency = (window.CalvoroCurrency && window.CalvoroCurrency.get()) || 'LKR';
            const formatPrice = (amount) => currency === 'USD' ? `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `LKR ${Number(amount).toLocaleString()}`;
            const rate = (window.CalvoroCurrency && window.CalvoroCurrency.rate()) || 320;
            const toDisplay = (amount) => currency === 'USD' ? amount / rate : amount;
            container.innerHTML = products.map(product => {
            const p = baseCmp(product);
            const sp = finalP(product);
            const onSale = sp < p - 0.005;
            const engineBadge = (product.pricing && product.pricing.badge && String(product.pricing.badge).trim())
                ? `<span class="discount-badge">${String(product.pricing.badge).replace(/</g, '')}</span>` : '';
            const created = product.created_at ? new Date(product.created_at) : null;
            const now = new Date();
            let newTag = '';
            if (created) {
                const days = (now - created) / (24 * 60 * 60 * 1000);
                if (days < 7) newTag = '<span class="badge-new badge-new-red">NEW</span>';
                else if (days < 14) newTag = '<span class="badge-new">NEW</span>';
            }
            const displayP = toDisplay(p);
            const displaySp = toDisplay(sp);
            const wishlistIds = JSON.parse(localStorage.getItem('calvoro_wishlist') || '[]');
            const inWishlist = wishlistIds.includes(String(product.id));
            const soldOut = !!product.sold_out;
            return `
            <a href="${soldOut ? '#' : productLink(product.id)}" class="card${soldOut ? ' card--sold-out' : ''}" ${soldOut ? 'onclick="return false;" aria-disabled="true"' : ''}>
                <div class="img">
                    ${soldOut ? '<span class="sold-out-badge">Sold out</span>' : 
                      (engineBadge ? engineBadge : (onSale ? '<span class="sale">SALE</span>' : newTag))}
                    <button type="button" class="wishlist-btn ${inWishlist ? 'active' : ''}" data-product-id="${product.id}" onclick="event.preventDefault();event.stopPropagation();window.CalvoroWishlist && CalvoroWishlist.toggle(${product.id}, this);" aria-label="Wishlist">♥</button>
                    <img src="${product.image_url || product.images && product.images[0] || (product.color_images && Object.values(product.color_images)[0]) || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'550\' viewBox=\'0 0 400 550\'%3E%3Crect fill=\'%23eee\' width=\'400\' height=\'550\'/%3E%3Ctext x=\'200\' y=\'275\' fill=\'%23999\' font-size=\'16\' text-anchor=\'middle\' dy=\'.3em\'%3ENo image%3C/text%3E%3C/svg%3E'}" alt="${product.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22550%22 viewBox=%220 0 400 550%22%3E%3Crect fill=%22%23eee%22 width=%22400%22 height=%22550%22/%3E%3Ctext x=%22200%22 y=%22275%22 fill=%22%23999%22 font-size=%2216%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo image%3C/text%3E%3C/svg%3E'">
                </div>
                <h3>${product.name}</h3>
                <p>${product.category_name || ''}</p>
                <p class="price">
                    ${soldOut ? '<span class="price-sold-out">Unavailable</span>' : (onSale ? `<del>${formatPrice(displayP)}</del> <span class="red">${formatPrice(displaySp)}</span>` : formatPrice(displayP))}
                </p>
            </a>
        `;
        }).join('');
        const countEl = document.querySelector('.results-count');
        if (countEl) countEl.textContent = 'Showing ' + products.length + ' product' + (products.length !== 1 ? 's' : '');
    }
}

const filters = new ProductFilters();

// ======================
// PRODUCT PAGE - VARIANTS
// ======================
class ProductVariants {
    constructor() {
        this.selectedColor = null;
        this.selectedSize = null;
        this.currentProduct = null;
        this.initialize();
    }

    initialize() {
        // Color selection
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', (e) => this.selectColor(e.currentTarget));
        });
        // Sync initial selected color from active swatch
        const activeColor = document.querySelector('.color-swatch.active');
        if (activeColor) {
            this.selectedColor = activeColor.dataset.color;
        }

        // Size selection
        document.querySelectorAll('.size-options button').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectSize(e.currentTarget));
        });
        // Sync initial selected size from active button (fix: pre-selected size is used on Add to Cart)
        const activeSize = document.querySelector('.size-options button.active');
        if (activeSize) {
            this.selectedSize = activeSize.dataset.size || activeSize.textContent.trim();
        }

        // Image thumbnails
        document.querySelectorAll('.thumbnails img').forEach(thumb => {
            thumb.addEventListener('click', (e) => this.changeMainImage(e.currentTarget.src));
        });

        // Add to cart
        const addToCartBtn = document.querySelector('.btn-cart');
        if (addToCartBtn) {
            addToCartBtn.addEventListener('click', (e) => { e.preventDefault(); this.addToCart(); });
        }
    }

    selectColor(swatch) {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.selectedColor = swatch.dataset.color;

        // Change main image based on color
        const newImage = swatch.dataset.image;
        if (newImage) {
            this.changeMainImage(newImage);
        }
    }

    selectSize(btn) {
        document.querySelectorAll('.size-options button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedSize = btn.dataset.size || btn.textContent;
    }

    changeMainImage(src) {
        const mainImage = document.querySelector('.main-image img');
        if (mainImage) {
            mainImage.src = src;
        }
    }

    addToCart() {
        // Get product details (in real implementation, fetch from data-attributes or API)
        const product = {
            id: this.getProductId(),
            name: document.querySelector('.product-info-detail h1')?.textContent,
            price: this.getPrice(),
            color: this.selectedColor,
            size: this.selectedSize,
            image: document.querySelector('.main-image img')?.src,
            quantity: 1
        };

        if (!product.size) {
            alert('Please select a size');
            return;
        }

        const cartObj = typeof window !== 'undefined' && window.cart;
        if (!cartObj) { alert('Cart not loaded. Please refresh the page.'); return; }
        cartObj.addItem(product);

        // Visual feedback
        const btn = document.querySelector('.btn-cart');
        const originalText = btn.textContent;
        btn.textContent = 'ADDED TO CART!';
        btn.style.background = '#16a34a';

        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '#000';
        }, 2000);
    }

    getProductId() {
        const path = window.location.pathname || '';
        const match = path.match(/product-?(\d+)/);
        if (match) return match[1];
        if (path.includes('product1')) return '1';
        if (path.includes('product2')) return '2';
        return '1';
    }

    getPrice() {
        const priceEl = document.querySelector('.price-large');
        if (priceEl) {
            const text = priceEl.textContent;
            const lkrMatch = text.match(/LKR ([\d,]+)/);
            const usdMatch = text.match(/\$([\d,.]+)/);
            if (lkrMatch) return parseFloat(lkrMatch[1].replace(/,/g, ''));
            if (usdMatch) return parseFloat(usdMatch[1].replace(/,/g, '')) * (window.CalvoroCurrency && window.CalvoroCurrency.rate() || 320);
        }
        return 0;
    }
}

const productVariants = new ProductVariants();

// ======================
// HERO CAROUSEL
// ======================
class HeroCarousel {
    constructor() {
        this.currentSlide = 0;
        this.slides = [];
        this.initialize();
    }

    async initialize() {
        try {
            const base = (typeof window !== 'undefined' && window.CalvoroAPIBase !== undefined) ? window.CalvoroAPIBase : '';
            const response = await fetch(base + '/api/carousel');
            if (!response.ok) return;
            const data = await response.json();
            this.slides = Array.isArray(data) ? data : [];
            if (this.slides.length > 0) {
                this.render();
                this.startAutoPlay();
            }
        } catch (error) {
            console.log('No dynamic carousel data, using static hero');
        }
    }

    render() {
        const hero = document.querySelector('.hero');
        if (!hero) return;

        hero.innerHTML = `
            <div class="carousel-container">
                ${this.slides.map((slide, index) => `
                    <div class="carousel-slide ${index === 0 ? 'active' : ''}">
                        <img src="${slide.image_url}" alt="${slide.title}">
                        <div class="hero-content">
                            <h1>${slide.title}</h1>
                            <p>${slide.subtitle}</p>
                            ${slide.button_text ? `<a href="${slide.link_url}" class="btn-hero">${slide.button_text}</a>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    next() {
        this.currentSlide = (this.currentSlide + 1) % this.slides.length;
        this.updateSlides();
    }

    prev() {
        this.currentSlide = (this.currentSlide - 1 + this.slides.length) % this.slides.length;
        this.updateSlides();
    }

    goToSlide(index) {
        this.currentSlide = index;
        this.updateSlides();
    }

    updateSlides() {
        const slides = document.querySelectorAll('.carousel-slide');
        slides.forEach((slide, index) => {
            slide.classList.toggle('active', index === this.currentSlide);
        });
    }

    startAutoPlay() {
        setInterval(() => this.next(), 5000);
    }
}

const heroCarousel = new HeroCarousel();

// ======================
// USER ACCOUNT
// ======================
class UserAccount {
    constructor() {
        this.user = null;
        this.initializeAccount();
    }

    async initializeAccount() {
        const accountBtn = document.querySelector('.account-btn');
        if (accountBtn) {
            accountBtn.addEventListener('click', () => this.showAccountModal());
        }

        // Check if user is logged in
        try {
            const response = await fetch((window.CalvoroAPIBase || '') + '/api/users/me');
            if (response.ok) {
                const data = await response.json();
                this.user = (data && data.user !== undefined) ? data.user : (data && data.id ? data : null);
                this.updateAccountUI();
            }
        } catch (error) {
            console.log('User not logged in');
        }
    }

    showAccountModal() {
        const root = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : '';
        if (this.user) {
            window.location.href = root + '/account.html';
        } else {
            window.location.href = root + '/login.html';
        }
    }

    updateAccountUI() {
        const accountBtn = document.querySelector('.account-btn');
        if (accountBtn && this.user) {
            const name = [this.user.first_name, this.user.last_name].filter(Boolean).join(' ') || this.user.email;
            accountBtn.title = `Logged in as ${name}`;
            accountBtn.setAttribute('aria-label', `Account: ${name}`);
        }
        if (this.user && typeof window.cart !== 'undefined' && window.cart.refreshCartCount) {
            window.cart._loggedIn = true;
            window.cart.refreshCartCount();
        }
        if (this.user && window.CalvoroWishlist && window.CalvoroWishlist.refreshButtonStates) {
            window.CalvoroWishlist.refreshButtonStates();
        }
    }

    async login(email, password) {
        try {
            const response = await fetch((window.CalvoroAPIBase || '') + '/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                this.user = await response.json();
                window.location.href = '/account.html';
            } else {
                const error = await response.json();
                alert(error.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed');
        }
    }

    async logout() {
        try {
            await fetch((window.CalvoroAPIBase || '') + '/api/users/logout', { method: 'POST' });
            this.user = null;
            window.location.href = '/';
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
}

const userAccount = new UserAccount();

// ======================
// RECENTLY VIEWED
// ======================
class RecentlyViewed {
    constructor() {
        this.maxItems = 4;
        this.initialize();
    }

    initialize() {
        // Note: tracking is handled by product.js after product data is fully loaded.
        // We only display here (works on all pages including the product page itself).
        this.displayRecentlyViewed();
    }

    trackProduct() {
        const productId = this.getCurrentProductId();
        if (!productId || !/^\d+$/.test(String(productId))) return;
        const imgEl = document.querySelector('.main-image img');
        let imgSrc = imgEl ? imgEl.src : '';
        try { imgSrc = imgSrc ? new URL(imgSrc, window.location.origin).href : ''; } catch (e) {}
        const productData = {
            id: productId,
            name: document.querySelector('.product-info-detail h1')?.textContent || '',
            image: imgSrc,
            price: document.querySelector('.price-large')?.textContent || ''
        };

        let recent = JSON.parse(localStorage.getItem('recently_viewed') || '[]');
        // Filter out invalid items and the current product
        recent = recent.filter(item => item && item.id && String(item.id) !== String(productId));
        recent.unshift(productData);
        recent = recent.slice(0, this.maxItems);
        localStorage.setItem('recently_viewed', JSON.stringify(recent));
    }

    displayRecentlyViewed() {
        const container = document.querySelector('.recently-viewed .thumbs');
        if (!container) return;

        let recent = JSON.parse(localStorage.getItem('recently_viewed') || '[]');
        recent = recent.filter(item => item && (item.id != null) && /^\d+$/.test(String(item.id)));

        // On product pages, exclude the current product so it doesn't show itself
        const currentId = this.getCurrentProductId();
        if (currentId) {
            recent = recent.filter(item => String(item.id) !== String(currentId));
        }

        if (recent.length > 0) {
            const base = window.location.pathname.includes('products/') ? '' : 'products/';
            const placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect fill="%23eee" width="100" height="100"/%3E%3Ctext x="50" y="50" fill="%23999" font-size="12" text-anchor="middle" dy=".3em"%3ENo image%3C/text%3E%3C/svg%3E';
            container.innerHTML = recent.map(product => {
                const href = (base || 'products/') + 'product.html?id=' + product.id;
                const img = product.image || placeholder;
                return `<a href="${href}"><img src="${img}" alt="${(product.name || 'Product').replace(/"/g, '&quot;')}" onerror="this.src='${placeholder}'"></a>`;
            }).join('');
        }
    }

    getCurrentProductId() {
        const pathMatch = window.location.pathname.match(/product-?(\d+)/);
        if (pathMatch) return pathMatch[1];
        if (window.location.pathname.indexOf('product') !== -1) {
            const q = new URLSearchParams(window.location.search);
            const id = q.get('id');
            if (id) return id;
        }
        return null;
    }
}

const recentlyViewed = new RecentlyViewed();

// ======================
// NEWSLETTER
// ======================
const newsletterForm = document.getElementById('newsletterForm');
if (newsletterForm) {
    newsletterForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const emailInput = this.querySelector('input[type="email"]');
        const email = (emailInput && emailInput.value || '').trim();
        const button = this.querySelector('button');
        if (!email) return;

        var apiBase = window.CalvoroAPIBase;
        if (apiBase === undefined || apiBase === null || apiBase === '') {
            var loc = window.location;
            var p = (loc.port || (loc.protocol === 'https:' ? '443' : '80'));
            apiBase = p === '3000' ? (loc.origin || '') : (loc.protocol + '//' + (loc.hostname || 'localhost') + ':3000');
        }
        var origText = button ? button.textContent : '';
        if (button) { button.disabled = true; button.textContent = '…'; }
        try {
            var res = await fetch(apiBase + '/api/users/newsletter-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email: email })
            });
            var data = await res.json().catch(function() { return {}; });
            if (res.ok) {
                if (emailInput) emailInput.value = '';
                button.textContent = 'SIGNED UP!';
                if (button) button.style.background = '#16a34a';
                try {
                    var meRes = await fetch(apiBase + '/api/users/me', { credentials: 'include' });
                    var meData = meRes.ok ? await meRes.json().catch(function() { return null; }) : null;
                    if (meData && meData.user) {
                        var u = meData.user;
                        var name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'User';
                        localStorage.setItem('calvoro_google_user', JSON.stringify({ email: u.email, name: name, picture: '', sub: String(u.id) }));
                    }
                } catch (e) {}
                if (window.CalvoroAuth && typeof window.CalvoroAuth.renderNavbar === 'function') window.CalvoroAuth.renderNavbar();
                setTimeout(function() { 
                    if (button) { button.textContent = origText; button.style.background = ''; button.disabled = false; }
                    window.location.reload(); // Reload to sync auth state across all components (Reviews, etc)
                }, 1500);
            } else {
                if (button) { button.disabled = false; button.textContent = origText; }
                var msg = (data && data.error) ? data.error : (res.status === 400 ? 'Please enter a valid email address.' : 'Sign-up failed. If you already have an account, try signing in.');
                alert(msg);
            }
        } catch (err) {
            if (button) { button.disabled = false; button.textContent = origText; }
            alert('Connection error. Use the site via the server (e.g. /api).');
        }
    });
}

// ======================
// CLOSE SEARCH
// ======================
function closeSearch() {
    search.close();
}

// ======================
// THEME (light/dark) – localStorage + prefers-color-scheme
// ======================
(function initTheme() {
    const STORAGE_KEY = 'calvoro_theme';
    const root = document.documentElement;

    function getTheme() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') return stored;
        if (typeof window.matchMedia !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        return 'light';
    }

    function setTheme(theme) {
        root.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        updateLogo(theme);
    }

    function updateLogo(theme) {
        var img = document.querySelector('.logo img');
        if (!img) return;
        var darkSrc = img.getAttribute('data-logo-dark');
        var lightSrc = img.getAttribute('data-logo-light');
        if (theme === 'dark' && darkSrc) img.src = darkSrc;
        else if (theme === 'light' && lightSrc) img.src = lightSrc;
        /* else: CSS --color-logo-filter handles PNG (brightness(0) / invert(1)) */
    }

    function bindToggle(btn) {
        if (!btn || btn._themeBound) return;
        btn._themeBound = true;
        btn.addEventListener('click', function () {
            var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            setTheme(next);
        });
    }

    function injectToggle() {
        var btn = document.querySelector('.theme-toggle');
        if (btn) {
            bindToggle(btn);
            return;
        }
        var actions = document.querySelector('.header .actions');
        if (!actions) return;
        var newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.className = 'theme-toggle';
        newBtn.setAttribute('aria-label', 'Toggle dark mode');
        newBtn.title = 'Toggle theme';
        newBtn.innerHTML = '<svg class="icon-moon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><svg class="icon-sun" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
        var cart = actions.querySelector('.cart-btn');
        actions.insertBefore(newBtn, cart ? cart : actions.firstChild);
        bindToggle(newBtn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectToggle);
    } else {
        injectToggle();
    }
})();

// ======================
// CURRENCY (LK / $)
// ======================
window.CalvoroCurrency = {
    KEY: 'calvoro_currency',
    RATE: 320,
    get() { return localStorage.getItem(this.KEY) || 'LKR'; },
    set(v) { localStorage.setItem(this.KEY, v === 'USD' ? 'USD' : 'LKR'); this.updateUI(); this.updatePrices(); window.dispatchEvent(new CustomEvent('calvoro-currency-change')); },
    rate() { return this.RATE; },
    updateUI() {
        document.querySelectorAll('.locale-btn').forEach(btn => {
            btn.textContent = this.get() === 'USD' ? '$ ▼' : 'LK ▼';
        });
    },
    updatePrices() {
        document.querySelectorAll('.price-large, .price').forEach(el => {
            const lkr = el.dataset.lkr;
            if (lkr != null) {
                const num = parseFloat(lkr);
                el.textContent = this.get() === 'USD' ? '$' + (num / this.RATE).toFixed(2) : 'LKR ' + Number(num).toLocaleString();
            }
        });
    }
};

// Locale button: toggle LK / $
document.addEventListener('DOMContentLoaded', () => {
    CalvoroCurrency.updateUI();
    document.querySelectorAll('.locale-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const next = CalvoroCurrency.get() === 'LKR' ? 'USD' : 'LKR';
            CalvoroCurrency.set(next);
        });
    });
});

// ======================
// WISHLIST (user-specific when logged in)
// ======================
window.CalvoroWishlist = {
    KEY: 'calvoro_wishlist',
    _apiIds: null,
    get() { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); },
    async isLoggedIn() {
        try {
            const r = await fetch((window.CalvoroAPIBase || '') + '/api/users/me', { credentials: 'include' });
            const d = await r.json();
            return !!(d && d.user);
        } catch (e) { return false; }
    },
    async getApiIds() {
        if (this._apiIds) return this._apiIds;
        try {
            const r = await fetch((window.CalvoroAPIBase || '') + '/api/wishlist', { credentials: 'include' });
            const list = await r.json();
            this._apiIds = Array.isArray(list) ? list.map(p => String(p.id)) : [];
            return this._apiIds;
        } catch (e) { this._apiIds = []; return []; }
    },
    async has(productId) {
        if (await this.isLoggedIn()) {
            const ids = await this.getApiIds();
            return ids.includes(String(productId));
        }
        return this.get().includes(String(productId));
    },
    async toggle(productId, btnEl) {
        const loggedIn = await this.isLoggedIn();
        if (!loggedIn) {
            alert('Please sign in or create an account to add items to your wishlist.');
            var returnPath = window.location.pathname + window.location.search;
            var sep = returnPath.indexOf('?') >= 0 ? '&' : '?';
            var loginUrl = new URL('/login.html', window.location.origin);
            loginUrl.searchParams.set('redirect', returnPath + sep + 'wishlist=' + productId);
            window.location.href = loginUrl.href;
            return;
        }
        try {
            const ids = await this.getApiIds();
            const id = String(productId);
            const inList = ids.includes(id);
            if (inList) {
                const r = await fetch((window.CalvoroAPIBase || '') + '/api/wishlist/' + productId, { method: 'DELETE', credentials: 'include' });
                if (r.ok) this._apiIds = ids.filter(x => x !== id);
            } else {
                const r = await fetch((window.CalvoroAPIBase || '') + '/api/wishlist/add', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_id: parseInt(productId, 10) })
                });
                const data = r.ok ? await r.json() : null;
                if (r.ok && data) this._apiIds = [...ids, id];
                else if (!r.ok) { alert('Please log in to add to wishlist.'); return; }
            }
            if (btnEl) btnEl.classList.toggle('active', !inList);
        } catch (e) { alert('Please log in to add to wishlist.'); }
    },
    goToWishlist() { window.location.href = 'wishlist.html'; },
    async refreshButtonStates() {
        if (!await this.isLoggedIn()) return;
        try {
            const r = await fetch((window.CalvoroAPIBase || '') + '/api/wishlist', { credentials: 'include' });
            const list = await r.json();
            this._apiIds = Array.isArray(list) ? list.map(p => String(p.id)) : [];
            document.querySelectorAll('.wishlist-btn[data-product-id]').forEach(btn => {
                const id = String(btn.dataset.productId || '');
                btn.classList.toggle('active', this._apiIds.includes(id));
            });
        } catch (e) {}
    }
};

// Handle post-login wishlist add: ?wishlist=productId in URL
document.addEventListener('DOMContentLoaded', function() {
    var params = new URLSearchParams(window.location.search);
    var wishlistId = params.get('wishlist');
    if (wishlistId && window.CalvoroWishlist) {
        CalvoroWishlist.isLoggedIn().then(function(loggedIn) {
            if (loggedIn) {
                CalvoroWishlist.toggle(parseInt(wishlistId, 10)).then(function() {
                    CalvoroWishlist.refreshButtonStates();
                });
                params.delete('wishlist');
                var clean = params.toString() ? '?' + params.toString() : '';
                history.replaceState({}, '', window.location.pathname + clean);
            }
        });
    }
});

// Handle post-login cart add: ?cart_add=productId&cart_color=&cart_size= in URL
document.addEventListener('DOMContentLoaded', function() {
    var params = new URLSearchParams(window.location.search);
    var cartAddId = params.get('cart_add');
    if (cartAddId && window.cart) {
        cart.isLoggedIn().then(function(loggedIn) {
            if (loggedIn) {
                var item = { id: parseInt(cartAddId, 10), quantity: 1, color: params.get('cart_color') || '', size: params.get('cart_size') || '' };
                cart.addItem(item);
                params.delete('cart_add'); params.delete('cart_color'); params.delete('cart_size');
                var clean = params.toString() ? '?' + params.toString() : '';
                history.replaceState({}, '', window.location.pathname + clean);
            }
        });
    }
});

// First-visit Terms & Conditions / Cookies bar — shows once per visitor on any page
(function () {
    var TC_KEY = 'calvoro_tc_accepted_v2';
    try {
        if (localStorage.getItem(TC_KEY)) return;
    } catch (e) { /* localStorage disabled, show bar anyway */ }
    function showTcBar() {
        if (document.getElementById('calvoro-tc-bar')) return;
        if (!document.body) return;
        var bar = document.createElement('div');
        bar.id = 'calvoro-tc-bar';
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-label', 'Terms and Conditions');
        bar.className = 'calvoro-tc-bar';
        bar.innerHTML = '<div class="calvoro-tc-bar-inner">' +
            '<p class="calvoro-tc-bar-text">By using CALVORO you agree to our <a href="terms-and-conditions.html">Terms &amp; Conditions</a> and <a href="privacy-policy.html">Privacy Policy</a>. We use cookies to enhance your experience.</p>' +
            '<button type="button" id="calvoro-tc-accept" class="calvoro-tc-bar-btn">I Accept</button>' +
            '</div>';
        document.body.appendChild(bar);
        document.getElementById('calvoro-tc-accept').addEventListener('click', function () {
            try { localStorage.setItem(TC_KEY, '1'); } catch (e) { }
            bar.classList.add('calvoro-tc-bar--hiding');
            setTimeout(function () {
                if (bar.parentNode) bar.parentNode.removeChild(bar);
            }, 300);
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showTcBar);
    } else {
        setTimeout(showTcBar, 0);
    }
})();

// Promo ticker (top bar): fetch admin-managed lines and scroll continuously right-to-left
(function () {
    function uniqCleanLines(lines) {
        if (!Array.isArray(lines)) return [];
        var out = [];
        for (var i = 0; i < lines.length; i++) {
            var s = (lines[i] == null ? '' : String(lines[i])).replace(/\s+/g, ' ').trim();
            if (!s) continue;
            if (out.indexOf(s) === -1) out.push(s);
        }
        return out;
    }

    function renderPromoTicker(promoEl, lines, durationSeconds) {
        var safeLines = uniqCleanLines(lines);
        var fallback = (promoEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (safeLines.length === 0 && fallback) safeLines = [fallback];
        if (safeLines.length === 0) safeLines = ['FREE SHIPPING ON ORDERS OVER LKR 15,000'];

        var text = safeLines.join('  •  ');
        promoEl.classList.add('promo--ticker');
        promoEl.style.setProperty('--promo-ticker-duration', (Math.max(8, Number(durationSeconds) || 22)) + 's');
        promoEl.innerHTML =
            '<div class="promo-ticker__viewport" aria-label="Promotions">' +
            '  <div class="promo-ticker__track" aria-hidden="true">' +
            '    <div class="promo-ticker__item"><span>' + escapeHtml(text) + '</span></div>' +
            '    <div class="promo-ticker__item"><span>' + escapeHtml(text) + '</span></div>' +
            '  </div>' +
            '</div>';
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function initPromoTicker() {
        var promoEl = document.querySelector('.promo');
        if (!promoEl) return;

        var base = (window.CalvoroAPIBase !== undefined && window.CalvoroAPIBase) ? window.CalvoroAPIBase : '';
        try {
            var r = await fetch(base + '/api/promo-ticker', { credentials: 'include' });
            var d = await r.json().catch(function () { return {}; });
            if (r.ok && d) {
                renderPromoTicker(promoEl, d.lines || d.taglines || [], d.durationSeconds || d.duration_seconds || 22);
                return;
            }
        } catch (e) { /* ignore; fallback to current text */ }
        renderPromoTicker(promoEl, [], 22);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPromoTicker);
    } else {
        setTimeout(initPromoTicker, 0);
    }
})();

// ======================
// TRENDING NOW SLIDER
// ======================
class TrendingSlider {
    constructor() {
        this.row = document.getElementById('trendingRow');
        this.prevBtn = document.getElementById('trendingPrev');
        this.nextBtn = document.getElementById('trendingNext');
        this.viewport = document.querySelector('.trending-viewport');
        this.scrollPos = 0;
        
        if (this.row) {
            this.init();
        }
    }

    async init() {
        await this.fetchProducts();
        this.setupEventListeners();
        this.updateButtons();
    }

    async fetchProducts() {
        try {
            const apiBase = (window.CalvoroAPIBase !== undefined) ? window.CalvoroAPIBase : (window.location.origin || '');
            const res = await fetch(`${apiBase}/api/products?trending=1`);
            const products = await res.json();
            
            if (!products || products.length === 0) {
                this.row.innerHTML = '<p class="loading-trending">No trending products found.</p>';
                if (this.prevBtn) this.prevBtn.style.display = 'none';
                if (this.nextBtn) this.nextBtn.style.display = 'none';
                return;
            }

            this.renderProducts(products);
        } catch (err) {
            console.error('Trending fetch error:', err);
            this.row.innerHTML = '<p class="loading-trending">Experience our latest collection below.</p>';
        }
    }

    renderProducts(products) {
        const currency = (window.CalvoroCurrency && window.CalvoroCurrency.get()) || 'LKR';
        const rate = (window.CalvoroCurrency && window.CalvoroCurrency.rate()) || 320;
        const formatPrice = (amount) => currency === 'USD' ? `$${(amount / rate).toFixed(2)}` : `LKR ${Number(amount).toLocaleString()}`;
        
        this.row.innerHTML = products.map(p => {
            const price = p.price || 0;
            const salePrice = p.sale_price || price;
            const onSale = salePrice < price;
            const img = (p.image_url || (p.images && p.images[0]) || 'data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"550\"%3E%3Crect fill=\"%23eee\" width=\"400\" height=\"550\"/%3E%3C/svg%3E');
            
            return `
                <a href="products/product.html?id=${p.id}" class="card">
                    <div class="img">
                        <img src="${img}" alt="${p.name}">
                    </div>
                    <h3>${p.name}</h3>
                    <p>${p.category_name || ''}</p>
                    <p class="price">
                        ${onSale ? `<del>${formatPrice(price)}</del> <span class="red">${formatPrice(salePrice)}</span>` : formatPrice(price)}
                    </p>
                </a>
            `;
        }).join('');
    }

    setupEventListeners() {
        if (this.prevBtn) this.prevBtn.onclick = () => this.scroll(-1);
        if (this.nextBtn) this.nextBtn.onclick = () => this.scroll(1);
        
        // Touch/Drag support
        let isDown = false;
        let startX;
        let scrollLeft;

        this.viewport.addEventListener('mousedown', (e) => {
            isDown = true;
            this.viewport.classList.add('active');
            startX = e.pageX - this.viewport.offsetLeft;
            scrollLeft = this.viewport.scrollLeft;
        });

        this.viewport.addEventListener('mouseleave', () => {
            isDown = false;
            this.viewport.classList.remove('active');
        });

        this.viewport.addEventListener('mouseup', () => {
            isDown = false;
            this.viewport.classList.remove('active');
        });

        this.viewport.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - this.viewport.offsetLeft;
            const walk = (x - startX) * 2;
            this.viewport.scrollLeft = scrollLeft - walk;
            this.updateButtons();
        });

        this.viewport.addEventListener('scroll', () => this.updateButtons());
    }

    scroll(direction) {
        const amount = this.viewport.clientWidth * 0.8;
        this.viewport.scrollBy({
            left: direction * amount,
            behavior: 'smooth'
        });
    }

    updateButtons() {
        if (!this.prevBtn || !this.nextBtn) return;
        
        const sl = this.viewport.scrollLeft;
        const cw = this.viewport.clientWidth;
        const sw = this.viewport.scrollWidth;
        
        this.prevBtn.disabled = sl <= 5;
        this.nextBtn.disabled = sl + cw >= sw - 5;
    }
}

// Initialize components
document.addEventListener('DOMContentLoaded', () => {
    new TrendingSlider();
});

// Initialize everything
console.log('✅ Calvoro e-commerce system loaded');
