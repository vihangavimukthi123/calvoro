const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to check admin auth
function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

function normalizeUrlPath(url) {
    if (typeof url !== 'string') return url;
    return url.trim().replace(/\\/g, '/');
}

function normalizeProductMediaFields(product) {
    if (!product || typeof product !== 'object') return product;
    const p = { ...product };

    if (typeof p.images === 'string') {
        p.images = p.images ? [normalizeUrlPath(p.images)] : [];
    } else if (Array.isArray(p.images)) {
        p.images = p.images.map(normalizeUrlPath).filter(Boolean);
    } else {
        p.images = [];
    }

    if (p.color_images && typeof p.color_images === 'object' && !Array.isArray(p.color_images)) {
        const normalized = {};
        Object.keys(p.color_images).forEach((k) => {
            const val = p.color_images[k];
            if (typeof val === 'string') {
                normalized[k] = normalizeUrlPath(val);
            } else if (val && typeof val === 'object') {
                normalized[k] = {
                    main: normalizeUrlPath(val.main || ''),
                    subs: Array.isArray(val.subs) ? val.subs.map(normalizeUrlPath).filter(Boolean) : [],
                    video: normalizeUrlPath(val.video || ''),
                    hex: val.hex || ''
                };
            } else {
                normalized[k] = val;
            }
        });
        p.color_images = normalized;
    } else {
        p.color_images = {};
    }

    if (p.color_videos && typeof p.color_videos === 'object' && !Array.isArray(p.color_videos)) {
        const normalized = {};
        Object.keys(p.color_videos).forEach((k) => {
            normalized[k] = normalizeUrlPath(p.color_videos[k]);
        });
        p.color_videos = normalized;
    } else {
        p.color_videos = {};
    }

    if (Array.isArray(p.media)) {
        p.media = p.media.map((m) => ({
            ...m,
            url: normalizeUrlPath(m && m.url),
            hover_video_url: normalizeUrlPath(m && m.hover_video_url),
            thumbnail: normalizeUrlPath(m && m.thumbnail)
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
    } else {
        p.image_url = normalizeUrlPath(p.image_url);
    }

    p.size_guide_url = normalizeUrlPath(p.size_guide_url || '');
    return p;
}

// Get all products (supports search, category, color, size, sort, trending)
router.get('/', async (req, res) => {
    try {
        let products = await db.getAllProducts();
        products = products.map(normalizeProductMediaFields);
        const { category, featured, status, search, sort, color, size, trending, min_price, max_price } = req.query;

        if (category) {
            const catParts = category.split(',').map(c => c.trim());
            const categories = await db.getAllCategories();
            const resolvedIds = [];
            catParts.forEach(part => {
                if (/^\d+$/.test(part)) resolvedIds.push(parseInt(part, 10));
                else {
                    const normalizedPart = part.toLowerCase();
                    const matches = categories.filter(c => {
                        const slug = (c.slug || '').toLowerCase();
                        const name = (c.name || '').toLowerCase();
                        
                        // Special case: 'men' should not match 'women'
                        if (normalizedPart === 'men') {
                            return slug === 'men' || name === 'men' || (slug.includes('men') && !slug.includes('women')) || (name.includes('men') && !name.includes('women'));
                        }
                        
                        return slug === normalizedPart || name === normalizedPart || slug.includes(normalizedPart) || name.includes(normalizedPart);
                    });
                    matches.forEach(m => {
                        if (!resolvedIds.includes(m.id)) resolvedIds.push(m.id);
                    });
                }
            });
            if (resolvedIds.length) {
                // Strict Filtering: Only show products in the requested categories
                products = products.filter(p => {
                    if (p.category_id == null) return false;
                    const pid = Number(p.category_id);
                    const match = resolvedIds.includes(pid);
                    return match;
                });
            }
        }

        if (color) {
            const colors = color.split(',').map(c => c.trim().toLowerCase());
            products = products.filter(p => {
                const pColors = (p.colors || []).map(c => (c || '').toLowerCase());
                return colors.some(c => pColors.includes(c));
            });
        }

        if (size) {
            const sizes = size.split(',').map(s => s.trim().toUpperCase());
            products = products.filter(p => {
                const pSizes = (p.sizes || []).map(s => (s || '').toString().toUpperCase());
                return pSizes.length > 0 && sizes.some(s => pSizes.includes(s));
            });
        }

        // Use effective price (sale_price when set and lower, else price) so filters match what customer sees
        const effectivePrice = (p) => {
            const base = p.price != null ? p.price : p.base_price || 0;
            const sale = p.sale_price != null ? p.sale_price : base;
            return sale < base ? sale : base;
        };
        if (min_price != null && min_price !== '') {
            const min = parseFloat(min_price);
            if (!isNaN(min)) {
                products = products.filter(p => effectivePrice(p) >= min);
            }
        }
        if (max_price != null && max_price !== '') {
            const max = parseFloat(max_price);
            if (!isNaN(max)) {
                products = products.filter(p => effectivePrice(p) <= max);
            }
        }

        if (req.query.product_type) {
            const types = req.query.product_type.split(',').map(t => (t || '').trim().toLowerCase()).filter(Boolean);
            if (types.length) {
                products = products.filter(p => {
                    const pt = (p.product_type || '').trim().toLowerCase();
                    return !!pt && types.includes(pt);
                });
            }
        }
        if (req.query.fit) {
            const fits = req.query.fit.split(',').map(f => (f || '').trim().toLowerCase()).filter(Boolean);
            if (fits.length) {
                products = products.filter(p => fits.includes((p.fit || '').trim().toLowerCase()));
            }
        }

        if (featured) {
            products = products.filter(p => p.featured);
        }

        if (status) {
            products = products.filter(p => p.status === status);
        } else {
            // Default: Show 'active' products or those with no status set (defaulting to active)
            products = products.filter(p => {
                const s = (p.status || '').toLowerCase();
                return s === 'active' || s === '' || p.status === undefined || p.status === null || p.is_active === true;
            });
        }

        if (search && search.trim().length >= 2) {
            const term = search.trim().toLowerCase();
            const compact = term.replace(/[\s'-]/g, '');
            const isMenTerm = compact === 'men' || compact === 'mens';
            const isWomenTerm = compact === 'women' || compact === 'womens';
            const isUnisexTerm = compact === 'unisex';

            let matchedCategoryIds = [];
            if (isMenTerm || isWomenTerm || isUnisexTerm) {
                const categories = await db.getAllCategories();
                matchedCategoryIds = (categories || [])
                    .filter((c) => {
                        const slug = String(c.slug || '').toLowerCase();
                        const name = String(c.name || '').toLowerCase();
                        const value = `${slug} ${name}`.replace(/[\s'-]/g, '');
                        if (isUnisexTerm) return value.includes('unisex');
                        if (isMenTerm) return value.includes('men') && !value.includes('women');
                        return value.includes('women');
                    })
                    .map((c) => Number(c.id))
                    .filter((id) => !isNaN(id));
            }

            products = products.filter((p) => {
                const textMatch =
                    (p.name && p.name.toLowerCase().includes(term)) ||
                    (p.description && p.description.toLowerCase().includes(term)) ||
                    (p.category_name && p.category_name.toLowerCase().includes(term));
                const categoryMatch = matchedCategoryIds.length > 0 && matchedCategoryIds.includes(Number(p.category_id));
                return textMatch || categoryMatch;
            });
        }

        if (trending === '1' || trending === 'true') {
            try {
                // Check for manual overrides first
                const manuallyTrendingIds = typeof db.getTrendingProductsSetting === 'function' ? await db.getTrendingProductsSetting() : [];
                
                if (manuallyTrendingIds && manuallyTrendingIds.length > 0) {
                    // Filter and sort according to the manual order
                    const manuallyTrendingProducts = products.filter(p => manuallyTrendingIds.includes(p.id));
                    manuallyTrendingProducts.sort((a, b) => {
                        return manuallyTrendingIds.indexOf(a.id) - manuallyTrendingIds.indexOf(b.id);
                    });
                    
                    // If we need more to reach 12, fill with auto-calculated ones
                    if (manuallyTrendingProducts.length < 12) {
                        const remainingToFill = 12 - manuallyTrendingProducts.length;
                        const otherProducts = products.filter(p => !manuallyTrendingIds.includes(p.id));
                        
                        const allReviews = await db.getAllReviews();
                        const reviewCounts = {};
                        (allReviews || []).forEach(r => {
                            reviewCounts[r.product_id] = (reviewCounts[r.product_id] || 0) + 1;
                        });
                        const orders = await db.getAllOrders();
                        const soldCount = {};
                        (orders || []).forEach(o => {
                            (o.items || []).forEach(item => {
                                const id = item.product_id || item.id;
                                if (id) { soldCount[id] = (soldCount[id] || 0) + (item.quantity || 1); }
                            });
                        });
                        
                        otherProducts.sort((a, b) => {
                            const scoreA = (soldCount[a.id] || 0) * 2 + (reviewCounts[a.id] || 0);
                            const scoreB = (soldCount[b.id] || 0) * 2 + (reviewCounts[b.id] || 0);
                            if (scoreB !== scoreA) return scoreB - scoreA;
                            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                        });
                        
                        products = [...manuallyTrendingProducts, ...otherProducts.slice(0, remainingToFill)];
                    } else {
                        products = manuallyTrendingProducts.slice(0, 12);
                    }
                } else {
                    // Fallback to auto-calculated logic if no manual overrides
                    const allReviews = await db.getAllReviews();
                    const reviewCounts = {};
                    (allReviews || []).forEach(r => {
                        reviewCounts[r.product_id] = (reviewCounts[r.product_id] || 0) + 1;
                    });
                    const orders = await db.getAllOrders();
                    const soldCount = {};
                    (orders || []).forEach(o => {
                        (o.items || []).forEach(item => {
                            const id = item.product_id || item.id;
                            if (id) { soldCount[id] = (soldCount[id] || 0) + (item.quantity || 1); }
                        });
                    });
                    products.sort((a, b) => {
                        const scoreA = (soldCount[a.id] || 0) * 2 + (reviewCounts[a.id] || 0);
                        const scoreB = (soldCount[b.id] || 0) * 2 + (reviewCounts[b.id] || 0);
                        if (scoreB !== scoreA) return scoreB - scoreA;
                        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                    });
                    products = products.slice(0, 12);
                }
            } catch (trendErr) {
                console.error('Trending fallback:', trendErr.message);
                products.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                products = products.slice(0, 12);
            }
        }
 else if (sort) {
            const effPrice = (p) => {
                const base = p.price != null ? p.price : p.base_price || 0;
                const sale = p.sale_price != null ? p.sale_price : base;
                return sale < base ? sale : base;
            };
            if (sort === 'price_asc') {
                products.sort((a, b) => effPrice(a) - effPrice(b));
            } else if (sort === 'price_desc') {
                products.sort((a, b) => effPrice(b) - effPrice(a));
            } else if (sort === 'name') {
                products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            } else if (sort === 'newest') {
                products.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            }
        }

        if (req.query.pricing !== '0' && typeof db.enrichProductsWithPricing === 'function') {
            const coupon = req.query.coupon || req.query.discount_code;
            products = await db.enrichProductsWithPricing(products, coupon || null);
        }

        res.json(products);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get single product
router.get('/:id', async (req, res) => {
    try {
        let product = await db.getProductById(req.params.id);

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        if (req.query.pricing !== '0' && typeof db.enrichSingleProductWithPricing === 'function') {
            const coupon = req.query.coupon || req.query.discount_code;
            product = await db.enrichSingleProductWithPricing(product, coupon || null);
        }

        res.json(normalizeProductMediaFields(product));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create product (admin only)
router.post('/', requireAdmin, async (req, res) => {
    const { name, description, price, sale_price, category_id, colors, sizes, stock, featured, color_images, color_videos, images, product_type, fit, media, size_guide_url } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Name and price are required' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let finalCategoryId = category_id ? parseInt(category_id, 10) : null;
    if (finalCategoryId && !isNaN(finalCategoryId)) {
        const categories = await db.getAllCategories();
        const selected = (categories || []).find(c => Number(c.id) === finalCategoryId);
        const isGiftCategory = selected && (((selected.slug || '').toLowerCase() === 'gifts') || ((selected.name || '').toLowerCase() === 'gifts'));
        if (isGiftCategory) {
            return res.status(400).json({ error: 'Gift Vouchers are managed separately. Please use the Vouchers section.' });
        }
    } else {
        finalCategoryId = null;
    }

    const normalizedImages = Array.isArray(images) ? images.map(normalizeUrlPath).filter(Boolean) : undefined;
    const normalizedColorImages = color_images && typeof color_images === 'object'
        ? Object.fromEntries(Object.entries(color_images).map(([k, v]) => {
            if (typeof v === 'string') return [k, normalizeUrlPath(v)];
            if (v && typeof v === 'object') return [k, {
                main: normalizeUrlPath(v.main || ''),
                subs: Array.isArray(v.subs) ? v.subs.map(normalizeUrlPath).filter(Boolean) : [],
                video: normalizeUrlPath(v.video || ''),
                hex: v.hex || ''
            }];
            return [k, v];
        }))
        : {};
    const normalizedColorVideos = color_videos && typeof color_videos === 'object' ? Object.fromEntries(Object.entries(color_videos).map(([k, v]) => [k, normalizeUrlPath(v)])) : {};
    const normalizedMedia = Array.isArray(media) ? media.map((m) => ({
        type: m && m.type ? m.type : 'image',
        url: normalizeUrlPath(m && m.url),
        hover_video_url: normalizeUrlPath(m && m.hover_video_url),
        thumbnail: normalizeUrlPath(m && m.thumbnail)
    })).filter((m) => !!m.url) : [];

    const product = {
        name,
        slug,
        description: description || '',
        price: parseFloat(price),
        sale_price: sale_price ? parseFloat(sale_price) : null,
        category_id: finalCategoryId,
        images: normalizedImages,
        colors: Array.isArray(colors) ? colors : (colors || []),
        sizes: Array.isArray(sizes) ? sizes : (sizes || []),
        stock: parseInt(stock) || 0,
        featured: featured ? true : false,
        status: 'active',
        color_images: normalizedColorImages,
        color_videos: normalizedColorVideos,
        product_type: product_type || null,
        fit: fit || null,
        media: normalizedMedia,
        size_guide_url: normalizeUrlPath(size_guide_url) || null
    };

    try {
        const result = await db.createProduct(product);
        res.json({
            success: true,
            id: result.lastInsertRowid,
            message: 'Product created successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

// Update product (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
    const { name, description, price, sale_price, category_id, images, colors, sizes, stock, featured, status, color_images, color_videos, product_type, fit, media, size_guide_url } = req.body;

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    let finalCategoryId = category_id !== undefined ? (category_id ? parseInt(category_id, 10) : null) : undefined;
    if (finalCategoryId && !isNaN(finalCategoryId)) {
        const categories = await db.getAllCategories();
        const selected = (categories || []).find(c => Number(c.id) === finalCategoryId);
        const isGiftCategory = selected && (((selected.slug || '').toLowerCase() === 'gifts') || ((selected.name || '').toLowerCase() === 'gifts'));
        if (isGiftCategory) {
            return res.status(400).json({ error: 'Gift Vouchers are managed separately. Please use the Vouchers section.' });
        }
    } else if (finalCategoryId === 0 || isNaN(finalCategoryId)) {
        if (category_id !== undefined) finalCategoryId = null;
    }

    const normalizedImages = Array.isArray(images) ? images.map(normalizeUrlPath).filter(Boolean) : undefined;
    const normalizedColorImages = color_images && typeof color_images === 'object'
        ? Object.fromEntries(Object.entries(color_images).map(([k, v]) => {
            if (typeof v === 'string') return [k, normalizeUrlPath(v)];
            if (v && typeof v === 'object') return [k, {
                main: normalizeUrlPath(v.main || ''),
                subs: Array.isArray(v.subs) ? v.subs.map(normalizeUrlPath).filter(Boolean) : [],
                video: normalizeUrlPath(v.video || ''),
                hex: v.hex || ''
            }];
            return [k, v];
        }))
        : undefined;
    const normalizedColorVideos = color_videos && typeof color_videos === 'object' ? Object.fromEntries(Object.entries(color_videos).map(([k, v]) => [k, normalizeUrlPath(v)])) : undefined;
    const normalizedMedia = Array.isArray(media) ? media.map((m) => ({
        type: m && m.type ? m.type : 'image',
        url: normalizeUrlPath(m && m.url),
        hover_video_url: normalizeUrlPath(m && m.hover_video_url),
        thumbnail: normalizeUrlPath(m && m.thumbnail)
    })).filter((m) => !!m.url) : undefined;

    const product = {
        name,
        slug,
        description: description || '',
        price: parseFloat(price),
        sale_price: sale_price ? parseFloat(sale_price) : null,
        category_id: finalCategoryId,
        images: normalizedImages,
        colors: Array.isArray(colors) ? colors : (colors || []),
        sizes: Array.isArray(sizes) ? sizes : (sizes || []),
        stock: parseInt(stock) || 0,
        featured: featured ? true : false,
        status: status || 'active',
        color_images: normalizedColorImages,
        color_videos: normalizedColorVideos,
        product_type: product_type !== undefined ? product_type : undefined,
        fit: fit !== undefined ? fit : undefined,
        media: normalizedMedia,
        size_guide_url: size_guide_url !== undefined ? normalizeUrlPath(size_guide_url) : undefined
    };
    if (product.color_images === undefined) delete product.color_images;
    if (product.color_videos === undefined) delete product.color_videos;
    if (product.product_type === undefined) delete product.product_type;
    if (product.fit === undefined) delete product.fit;
    if (product.media === undefined) delete product.media;
    if (product.size_guide_url === undefined) delete product.size_guide_url;

    try {
        await db.updateProduct(req.params.id, product);
        res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        await db.deleteProduct(req.params.id);
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

module.exports = router;
