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

// Get all products (supports search, category, color, size, sort, trending)
router.get('/', async (req, res) => {
    try {
        let products = await db.getAllProducts();
        const { category, featured, status, search, sort, color, size, trending, min_price, max_price } = req.query;

        if (category) {
            const catParts = category.split(',').map(c => c.trim());
            const categories = await db.getAllCategories();
            const resolvedIds = [];
            catParts.forEach(part => {
                if (/^\d+$/.test(part)) resolvedIds.push(parseInt(part, 10));
                else {
                    const bySlug = categories.find(c => (c.slug || '').toLowerCase() === part.toLowerCase());
                    const byName = categories.find(c => (c.name || '').toLowerCase() === part.toLowerCase());
                    if (bySlug) resolvedIds.push(bySlug.id);
                    else if (byName) resolvedIds.push(byName.id);
                }
            });
            if (resolvedIds.length) {
                // Show products in this category OR uncategorized (null) so new products appear until admin sets category
                products = products.filter(p => p.category_id == null || resolvedIds.includes(Number(p.category_id)));
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
            products = products.filter(p => (p.status || p.is_active) === 'active' || p.status === undefined);
        }

        if (search && search.trim().length >= 2) {
            const term = search.trim().toLowerCase();
            products = products.filter(p =>
                (p.name && p.name.toLowerCase().includes(term)) ||
                (p.description && p.description.toLowerCase().includes(term))
            );
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

        res.json(product);
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
    let finalCategoryId = category_id || null;
    if (finalCategoryId) {
        const categories = await db.getAllCategories();
        const selected = (categories || []).find(c => String(c.id) === String(finalCategoryId));
        const isGiftCategory = selected && (((selected.slug || '').toLowerCase() === 'gifts') || ((selected.name || '').toLowerCase() === 'gifts'));
        if (isGiftCategory) {
            return res.status(400).json({ error: 'Gift Vouchers are managed separately. Please use the Vouchers section.' });
        }
    }

    const product = {
        name,
        slug,
        description: description || '',
        price: parseFloat(price),
        sale_price: sale_price ? parseFloat(sale_price) : null,
        category_id: finalCategoryId,
        images: images || [],
        colors: Array.isArray(colors) ? colors : (colors || []),
        sizes: Array.isArray(sizes) ? sizes : (sizes || []),
        stock: parseInt(stock) || 0,
        featured: featured ? true : false,
        status: 'active',
        color_images: color_images && typeof color_images === 'object' ? color_images : {},
        color_videos: color_videos && typeof color_videos === 'object' ? color_videos : {},
        product_type: product_type || null,
        fit: fit || null,
        media: Array.isArray(media) ? media : [],
        size_guide_url: size_guide_url || null
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

    let finalCategoryId = category_id || null;
    if (finalCategoryId) {
        const categories = await db.getAllCategories();
        const selected = (categories || []).find(c => String(c.id) === String(finalCategoryId));
        const isGiftCategory = selected && (((selected.slug || '').toLowerCase() === 'gifts') || ((selected.name || '').toLowerCase() === 'gifts'));
        if (isGiftCategory) {
            return res.status(400).json({ error: 'Gift Vouchers are managed separately. Please use the Vouchers section.' });
        }
    }

    const product = {
        name,
        slug,
        description: description || '',
        price: parseFloat(price),
        sale_price: sale_price ? parseFloat(sale_price) : null,
        category_id: finalCategoryId,
        images: images || [],
        colors: Array.isArray(colors) ? colors : (colors || []),
        sizes: Array.isArray(sizes) ? sizes : (sizes || []),
        stock: parseInt(stock) || 0,
        featured: featured ? true : false,
        status: status || 'active',
        color_images: color_images && typeof color_images === 'object' ? color_images : undefined,
        color_videos: color_videos && typeof color_videos === 'object' ? color_videos : undefined,
        product_type: product_type !== undefined ? product_type : undefined,
        fit: fit !== undefined ? fit : undefined,
        media: Array.isArray(media) ? media : undefined,
        size_guide_url: size_guide_url !== undefined ? size_guide_url : undefined
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
