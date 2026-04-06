(function() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const productDetailEl = document.getElementById('productDetail');
    if (!id) { productDetailEl.innerHTML = '<p><a href="../index.html">Product not found</a>. Go back to <a href="../men.html">shop</a>.</p>'; return; }

    const apiBase = window.CalvoroAPIBase || window.location.origin;
    const COLORS_HEX = { black: '#000', white: '#fff', grey: '#6b7280', gray: '#6b7280', blue: '#1e40af', brown: '#8b4513', green: '#065f46', red: '#dc2626', maroon: '#831843', navy: '#1e3a5f' };

    function toAbsoluteUrl(url) {
        if (!url) return '';
        try { return new URL(url, apiBase).href; } catch (e) { return url; }
    }
    function escapeAttr(s) {
        if (s == null || s === '') return '';
        return String(s)
            .replace(/\r/g, '').replace(/\n/g, '').replace(/[\x00-\x1F\x7F]/g, '')
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, '&#96;');
    }
    function escapeHtml(s) {
        if (s == null || s === '') return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    async function loadProduct() {
        try {
            const [prodRes, revRes, meRes] = await Promise.all([
                fetch(apiBase + '/api/products/' + id + '?pricing=1'),
                fetch(apiBase + '/api/reviews/product/' + id, { credentials: 'include' }),
                fetch(apiBase + '/api/users/me', { credentials: 'include' })
            ]);
            if (!prodRes.ok) {
                productDetailEl.innerHTML = '<p>Product not found. <a href="../men.html">Back to Men</a> | <a href="../women.html">Women</a> | <a href="../gifts.html">Gifts</a></p>';
                return;
            }
            const product = await prodRes.json();
            const reviews = revRes.ok ? await revRes.json() : [];
            const meData = meRes.ok ? await meRes.json() : {};
            const isLoggedIn = !!(meData && meData.user);

            const colorImagesRaw = product.color_images || {};
            const colorVideosRaw = product.color_videos || {};
            function getColorImage(colorKey) {
                if (!colorKey) return null;
                var k = Object.keys(colorImagesRaw).find(function(x) { return (x || '').toLowerCase() === (colorKey || '').toLowerCase(); });
                return k ? colorImagesRaw[k] : colorImagesRaw[colorKey];
            }
            function getColorVideo(colorKey) {
                if (!colorKey) return null;
                var k = Object.keys(colorVideosRaw).find(function(x) { return (x || '').toLowerCase() === (colorKey || '').toLowerCase(); });
                return k ? colorVideosRaw[k] : colorVideosRaw[colorKey];
            }
            var colorKeys = Object.keys(colorImagesRaw);
            var colorList = product.colors && product.colors.length ? product.colors : [];
            var colors = colorList.length || colorKeys.length ? Array.from(new Set(colorList.concat(colorKeys))) : ['Black'];
            const defaultImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect fill="#eee" width="600" height="800"/><text x="300" y="400" fill="#999" font-size="20" text-anchor="middle" dy=".3em">No image</text></svg>');
            
            // Process media array (supports images and videos)
            const media = product.media || [];
            let images = [];
            let videos = [];
            let hoverVideos = {}; // Map of image URL to hover video URL
            
            media.forEach(function(m) {
                if (m.type === 'video') {
                    videos.push({ url: toAbsoluteUrl(m.url), thumbnail: m.thumbnail || null });
                } else {
                    images.push(toAbsoluteUrl(m.url));
                    if (m.hover_video_url) {
                        hoverVideos[m.url] = toAbsoluteUrl(m.hover_video_url);
                    }
                }
            });
            // Per-variant (color) hover videos from color_videos
            Object.keys(colorVideosRaw).forEach(function(k) {
                var img = getColorImage(k);
                var vid = getColorVideo(k);
                if (img && vid) hoverVideos[img] = toAbsoluteUrl(vid);
            });
            
            // Fallback to legacy images array
            if (!images.length && !videos.length) {
                images = product.images && product.images.length ? product.images : (Object.values(colorImagesRaw).length ? Object.values(colorImagesRaw) : []);
                if (!images.length) images = [defaultImg];
            }
            images = images.map(function(u) { return toAbsoluteUrl(u); });
            
            // Get main image (first image or first video thumbnail)
            let mainImg = toAbsoluteUrl(getColorImage(colors[0]) || images[0]) || defaultImg;
            let mainHoverVideo = null;
            if (images[0] && hoverVideos[images[0]]) {
                mainHoverVideo = hoverVideos[images[0]];
            } else if (media.length && media[0].hover_video_url) {
                mainHoverVideo = toAbsoluteUrl(media[0].hover_video_url);
            }
            const sizes = product.sizes && product.sizes.length ? product.sizes : ['S', 'M', 'L', 'XL'];
            const compareAt = (product.pricing && product.pricing.compare_at_price != null)
                ? product.pricing.compare_at_price
                : product.price;
            const price = (product.pricing && typeof product.pricing.final_price === 'number')
                ? product.pricing.final_price
                : (product.sale_price != null && product.sale_price < product.price ? product.sale_price : product.price);
            const soldOut = !!product.sold_out;
            const onSale = !soldOut && compareAt > price + 0.005;

            document.getElementById('breadcrumbName').textContent = product.name;

            const currency = window.CalvoroCurrency && window.CalvoroCurrency.get() || 'LKR';
            const rate = (window.CalvoroCurrency && window.CalvoroCurrency.rate()) || 320;
            const fmt = function (amt) {
                return currency === 'USD' ? '$' + (amt / rate).toFixed(2) : 'LKR ' + Number(amt).toLocaleString();
            };
            const priceDisplay = (onSale ? '<del>' + fmt(compareAt) + '</del> ' : '') + fmt(price);

            const colorSwatches = colors.map((c, i) => {
                const img = toAbsoluteUrl(getColorImage(c) || images[i] || images[0]) || defaultImg;
                const hoverVid = getColorVideo(c) ? toAbsoluteUrl(getColorVideo(c)) : '';
                const hex = COLORS_HEX[(c || '').toLowerCase()] || '#666';
                const border = (c || '').toLowerCase() === 'white' ? ' border: 1px solid #ddd;' : '';
                return '<span class="color-swatch ' + (i === 0 ? 'active' : '') + '" data-color="' + escapeAttr(c) + '" data-image="' + escapeAttr(img) + '"' + (hoverVid ? ' data-hover-video="' + escapeAttr(hoverVid) + '"' : '') + ' style="background: ' + hex + ';' + border + '" title="' + escapeAttr(c) + '"></span>';
            }).join('');

            const sizeButtons = sizes.map((s, i) => '<button type="button" ' + (i === 0 ? 'class="active"' : '') + ' data-size="' + escapeAttr(s) + '">' + escapeAttr(s) + '</button>').join('');

            var thumbItems = [];
            var seen = {};
            
            // Add videos as thumbnails
            videos.forEach(function(v) {
                var thumbUrl = v.thumbnail || v.url;
                if (thumbUrl && !seen[thumbUrl]) {
                    seen[thumbUrl] = true;
                    thumbItems.push({ 
                        url: thumbUrl, 
                        videoUrl: v.url, 
                        type: 'video', 
                        color: '' 
                    });
                }
            });
            
            // Add images as thumbnails
            colors.forEach(function(c) {
                var img = getColorImage(c) || images[0];
                if (img) {
                    var abs = toAbsoluteUrl(img) || img;
                    if (abs && !seen[abs]) { 
                        seen[abs] = true; 
                        thumbItems.push({ 
                            url: abs, 
                            color: c, 
                            type: 'image',
                            hoverVideo: hoverVideos[img] || null
                        }); 
                    }
                }
            });
            
            if (!thumbItems.length) {
                thumbItems = images.slice(0, 8).map(function(u) { 
                    return { 
                        url: toAbsoluteUrl(u) || u, 
                        color: '', 
                        type: 'image',
                        hoverVideo: hoverVideos[u] || null
                    }; 
                });
            }
            thumbItems = thumbItems.slice(0, 12);

            var dist = [0,0,0,0,0];
            reviews.forEach(function(r) { if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++; });
            var total = reviews.length;
            var avg = total ? (dist.reduce(function(s,n,i){ return s + n*(i+1); }, 0) / total).toFixed(1) : '0';
            var avgStars = Math.min(5, Math.round(parseFloat(avg) || 0));
            var starHtml = '';
            for (var s = 5; s >= 1; s--) {
                var idx = s - 1;
                starHtml += '<div class="pd-review-bar-row"><span class="pd-review-bar-label">' + s + ' <span class="pd-star">★</span></span><div class="pd-review-bar"><div class="pd-review-bar-fill" style="width:' + (total ? Math.round((dist[idx]/total)*100) : 0) + '%"></div></div><span class="pd-review-bar-pct">' + (total ? Math.round((dist[idx]/total)*100) : 0) + '%</span></div>';
            }

            var reviewsLeftHtml = '<div class="pd-reviews-left"><h3 class="pd-reviews-title">Customer Reviews</h3>' +
                '<div class="pd-reviews-summary-card">' +
                '<div class="pd-reviews-summary-top"><span class="pd-reviews-stars">' + '★'.repeat(avgStars) + '☆'.repeat(5 - avgStars) + '</span> <span class="pd-reviews-based">Based on ' + total + ' review' + (total === 1 ? '' : 's') + '</span></div>' +
                '<div class="pd-reviews-bars">' + starHtml + '</div>' +
                '</div>';
            if (isLoggedIn) {
                reviewsLeftHtml += '<div class="pd-review-form-wrap"><h4>Write a review</h4><form id="reviewForm" class="pd-review-form"><div class="pd-review-form-row"><label>Rating</label><select name="rating"><option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option></select></div><div class="pd-review-form-row"><label>Your review</label><textarea name="body" placeholder="Share your experience with this product..." rows="4" required></textarea></div><button type="submit" class="pd-review-submit">Submit Review</button></form></div>';
            } else {
                reviewsLeftHtml += '<div class="pd-review-signin"><p>Sign in to write a review.</p><a href="../login.html?redirect=' + encodeURIComponent(window.location.pathname + '?id=' + id) + '" class="pd-review-signin-btn">Sign In</a></div>';
            }
            reviewsLeftHtml += '</div>';

            var reviewsRightHtml = '<div class="pd-reviews-right">';
            if (reviews.length) {
                reviewsRightHtml += '<h3 class="pd-reviews-title">All Reviews</h3><div class="pd-reviews-list">' +
                    reviews.map(r => '<div class="pd-review-item"><div class="pd-review-meta"><span class="pd-review-author">' + escapeHtml(r.author_name || 'Guest') + '</span><span class="pd-review-rating">' + '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) + '</span><span class="pd-review-date">' + new Date(r.created_at).toLocaleDateString() + '</span></div><p class="pd-review-body">' + escapeHtml(r.body || '') + '</p></div>').join('') +
                    '</div>';
            } else {
                reviewsRightHtml += '<p class="pd-reviews-empty">No reviews yet. Be the first to review this product!</p>';
            }
            reviewsRightHtml += '</div>';

            const fallbackEsc = escapeAttr(defaultImg);
            const mainImgEsc = escapeAttr(mainImg);
            const mainHoverVideoEsc = mainHoverVideo ? escapeAttr(mainHoverVideo) : '';
            const prodNameEsc = escapeAttr(product.name || '');
            document.getElementById('productDetail').innerHTML =
        '<div class="product-images">' +
            '<div class="main-image"><img src="' + mainImgEsc + '" alt="' + prodNameEsc + '" data-fallback="' + fallbackEsc + '"' + (mainHoverVideoEsc ? ' data-hover-video="' + mainHoverVideoEsc + '"' : '') + ' onerror="var f=this.dataset.fallback;if(f)this.src=f;"></div>' +
            '<div class="thumbnails">' + thumbItems.map(function(t, i) { 
                var attrs = 'class="' + (i === 0 ? 'active' : '') + '" data-color="' + escapeAttr(t.color) + '" data-image="' + escapeAttr(t.url) + '" data-fallback="' + fallbackEsc + '"';
                if (t.type === 'video') {
                    attrs += ' data-type="video" data-video-url="' + escapeAttr(t.videoUrl || t.url) + '"';
                }
                if (t.hoverVideo) {
                    attrs += ' data-hover-video="' + escapeAttr(t.hoverVideo) + '"';
                }
                return '<img src="' + escapeAttr(t.url) + '" alt="" ' + attrs + ' onerror="var f=this.dataset.fallback;if(f)this.src=f;">'; 
            }).join('') + '</div>' +
        '</div>' +
        '<div class="product-info-detail">' +
            '<p class="vendor">CALVORO</p>' +
            '<h1>' + escapeAttr(product.name) + '</h1>' +
            '<div class="rating" id="ratingLine">' + reviews.length + ' REVIEWS</div>' +
            '<p class="price-large" data-lkr="' + escapeAttr(price) + '">' + priceDisplay + '</p>' +
            '<div class="tax-info">Tax included. Shipping calculated at checkout.</div>' +
            '<div class="option-group">' +
                '<label>AVAILABLE COLOR: <strong id="selectedColorLabel">' + escapeAttr(colors[0]) + '</strong></label>' +
                '<div class="color-options">' + colorSwatches + '</div>' +
            '</div>' +
            '<div class="option-group">' +
                '<label>AVAILABLE SIZE: <strong id="selectedSizeLabel">' + escapeAttr(sizes[0]) + '</strong> <a href="#" class="size-guide">Size Guide</a></label>' +
                '<div class="size-options">' + sizeButtons + '</div>' +
            '</div>' +
            '<button class="btn-cart" ' + (soldOut ? 'disabled' : '') + '>' + (soldOut ? 'SOLD OUT' : 'ADD TO CART') + '</button>' +
            '<div class="info-items">' +
                '<div class="info-item"><span>Free delivery on orders above LKR 15,000</span></div>' +
                '<div class="info-item"><span>Free Exchanges & Returns</span></div>' +
            '</div>' +
            '<details open><summary>Details</summary><p>' + escapeHtml(product.description || 'Premium quality.') + '</p></details>' +
        '</div>' +
        reviewsLeftHtml +
        reviewsRightHtml;

            var sizeGuideBtn = document.querySelector('.size-guide');
            if (sizeGuideBtn) {
                sizeGuideBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (!product.size_guide_url) {
                        alert('No Size Guide image is available for this product.');
                        return;
                    }
                    const modal = document.createElement('div');
                    modal.className = 'premium-modal-overlay';
                    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity 0.3s ease;';
                    
                    modal.innerHTML = '<div class="premium-modal-content" style="background:#fff;max-width:800px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);position:relative;transform:scale(0.9);transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1);">' +
                            '<div style="padding:20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">' +
                                '<h3 style="margin:0;font-size:18px;font-weight:600;">Size Guide</h3>' +
                                '<button class="close-modal" style="background:#f3f4f6;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;">&times;</button>' +
                            '</div>' +
                            '<div style="padding:20px;overflow-y:auto;max-height:70vh;text-align:center;background:#f9fafb;">' +
                                '<img src="' + escapeAttr(toAbsoluteUrl(product.size_guide_url)) + '" style="max-width:100%;height:auto;border-radius:8px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">' +
                            '</div>' +
                        '</div>';

                    document.body.appendChild(modal);
                    
                    requestAnimationFrame(function() {
                        modal.style.opacity = '1';
                        modal.querySelector('.premium-modal-content').style.transform = 'scale(1)';
                    });

                    var close = function() {
                        modal.style.opacity = '0';
                        modal.querySelector('.premium-modal-content').style.transform = 'scale(0.9)';
                        setTimeout(function() { modal.remove(); }, 300);
                    };

                    modal.querySelector('.close-modal').onclick = close;
                    modal.onclick = function(ev) { if (ev.target === modal) close(); };
                });
            }

            document.querySelectorAll('.color-swatch').forEach(function(el) {
                el.addEventListener('click', function() {
                    document.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('active'); });
                    this.classList.add('active');
                    document.getElementById('selectedColorLabel').textContent = this.dataset.color || '';
                    var img = this.dataset.image;
                    if (img) {
                        var mainEl = document.querySelector('.main-image img');
                        if (mainEl) {
                            mainEl.src = img;
                            mainEl.dataset.hoverVideo = this.dataset.hoverVideo || '';
                        }
                        document.querySelectorAll('.thumbnails img').forEach(function(t) {
                            t.classList.toggle('active', (t.dataset.image || t.src) === img);
                        });
                    }
                });
            });
            document.querySelectorAll('.thumbnails img').forEach(function(thumb) {
                thumb.addEventListener('click', function() {
                    var src = this.src;
                    var color = this.dataset.color || '';
                    var mainEl = document.querySelector('.main-image img');
                    if (mainEl && src) {
                        mainEl.src = src;
                        mainEl.dataset.hoverVideo = this.dataset.hoverVideo || '';
                    }
                    document.querySelectorAll('.thumbnails img').forEach(function(t) { t.classList.remove('active'); });
                    this.classList.add('active');
                    if (color) {
                        document.getElementById('selectedColorLabel').textContent = color;
                        document.querySelectorAll('.color-swatch').forEach(function(s) {
                            s.classList.toggle('active', (s.dataset.color || '').toLowerCase() === color.toLowerCase());
                        });
                    }
                });
            });
            document.querySelectorAll('.size-options button').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.size-options button').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    document.getElementById('selectedSizeLabel').textContent = this.dataset.size;
                });
            });

            document.querySelector('.btn-cart').addEventListener('click', function() {
                if (soldOut) return;
                var cartObj = window.cart;
                if (!cartObj) { alert('Cart not loaded. Please refresh the page.'); return; }
                var size = document.getElementById('selectedSizeLabel').textContent;
                var color = document.getElementById('selectedColorLabel').textContent;
                var priceEl = document.querySelector('.price-large');
                var priceLkr = priceEl && priceEl.dataset.lkr ? parseFloat(priceEl.dataset.lkr) : price;
                if (!size) { alert('Please select a size'); return; }
                var imgSrc = '';
                var activeSwatch = document.querySelector('.color-swatch.active');
                if (activeSwatch && activeSwatch.dataset.image) {
                    imgSrc = toAbsoluteUrl(activeSwatch.dataset.image);
                } else {
                    var backendImg = (getColorImage(color) || images[0]);
                    imgSrc = backendImg ? toAbsoluteUrl(backendImg) : '';
                }
                if (!imgSrc || imgSrc.indexOf('data:image/svg') === 0) {
                    var fallback = (product.images && product.images[0]) ? toAbsoluteUrl(product.images[0]) : '';
                    if (fallback) imgSrc = fallback;
                }
                cartObj.addItem({ id: id, name: document.querySelector('.product-info-detail h1').textContent, price: priceLkr, color: color, size: size, image: imgSrc, quantity: 1 });
                this.textContent = 'ADDED TO CART!'; this.style.background = '#16a34a';
                setTimeout(() => { this.textContent = 'ADD TO CART'; this.style.background = ''; }, 2000);
            });

            var formEl = document.getElementById('reviewForm');
            if (formEl) {
                formEl.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const fd = new FormData(this);
                    try {
                        const res = await fetch(apiBase + '/api/reviews', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                product_id: id,
                                rating: fd.get('rating'),
                                body: fd.get('body')
                            })
                        });
                        const data = res.ok ? null : await res.json().catch(function(){ return {}; });
                        if (res.ok) { alert('Thank you for your review!'); loadProduct(); }
                        else alert(data && data.error ? data.error : 'Failed to submit.');
                    } catch (err) { alert('Error submitting review'); }
                });
            }

            if (window.initProductHoverVideo) window.initProductHoverVideo();
            trackRecentlyViewed(product);
            loadAlsoLike(product);
        } catch (err) {
            productDetailEl.innerHTML = '<p>Error loading product. Make sure you are opening the site from the server (e.g. <a href="' + apiBase + '">' + apiBase + '</a>). <a href="../index.html">Go home</a>.</p>';
        }
    }

    function trackRecentlyViewed(product) {
        var mainImg = document.querySelector('.main-image img');
        var imgSrc = mainImg ? toAbsoluteUrl(mainImg.src) : (product.images && product.images[0] ? toAbsoluteUrl(product.images[0]) : '');
        var data = { id: product.id, name: product.name, image: imgSrc, price: product.price };
        try {
            var recent = JSON.parse(localStorage.getItem('recently_viewed') || '[]');
            recent = recent.filter(function(item) { return String(item.id) !== String(product.id); });
            recent.unshift(data);
            recent = recent.slice(0, 4);
            localStorage.setItem('recently_viewed', JSON.stringify(recent));
        } catch (e) {}
    }

    async function loadAlsoLike(currentProduct) {
        var section = document.getElementById('alsoLike');
        var row = document.getElementById('alsoLikeRow');
        if (!section || !row) return;
        try {
            var url = apiBase + '/api/products?pricing=1';
            if (currentProduct.category_id) url += '&category=' + currentProduct.category_id;
            var res = await fetch(url);
            var products = res.ok ? await res.json() : [];
            products = products.filter(function(p) { return String(p.id) !== String(currentProduct.id); });
            products = products.slice(0, 4);
            if (!products.length) {
                res = await fetch(apiBase + '/api/products?trending=1&pricing=1');
                products = res.ok ? await res.json() : [];
            }
            if (!products.length) {
                res = await fetch(apiBase + '/api/products?sort=newest&pricing=1');
                products = res.ok ? await res.json() : [];
            }
            products = products.filter(function(p) { return String(p.id) !== String(currentProduct.id); }).slice(0, 4);
            if (!products.length) return;
            var currency = window.CalvoroCurrency && window.CalvoroCurrency.get() || 'LKR';
            var rate = (window.CalvoroCurrency && window.CalvoroCurrency.rate()) || 320;
            var formatPrice = function(amount) { return currency === 'USD' ? '$' + (amount / rate).toFixed(2) : 'LKR ' + Number(amount).toLocaleString(); };
            var noImg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="550" viewBox="0 0 400 550"%3E%3Crect fill="%23eee" width="400" height="550"/%3E%3Ctext x="200" y="275" fill="%23999" font-size="16" text-anchor="middle" dy=".3em"%3ENo image%3C/text%3E%3C/svg%3E';
            row.innerHTML = products.map(function(p) {
                var price = (p.pricing && p.pricing.final_price != null) ? p.pricing.final_price : (p.sale_price != null && p.sale_price < p.price ? p.sale_price : p.price);
                var img = p.image_url || (p.images && p.images[0]) || (p.color_images && Object.values(p.color_images)[0]) || noImg;
                img = toAbsoluteUrl(img) || noImg;
                var href = 'product.html?id=' + p.id;
                var colorsCount = (p.colors && p.colors.length) ? p.colors.length : (p.color_images && Object.keys(p.color_images).length) || 0;
                var colorStr = colorsCount ? colorsCount + ' Color' + (colorsCount !== 1 ? 's' : '') : '';
                var fitStr = (p.fit && String(p.fit).trim()) ? String(p.fit).trim() : (p.product_type && String(p.product_type).trim()) ? String(p.product_type).trim() : '';
                var details = colorStr + (colorStr && fitStr ? ' \u2022 ' : '') + fitStr;
                return '<a href="' + href + '" class="card"><div class="img"><img src="' + escapeAttr(img) + '" alt="' + escapeAttr(p.name || '') + '" data-fallback="' + escapeAttr(noImg) + '" onerror="var f=this.dataset.fallback;if(f)this.src=f;"></div><h3>' + escapeAttr(p.name || '') + '</h3>' + (details ? '<p class="card-meta">' + escapeAttr(details) + '</p>' : '') + '<p class="price">' + formatPrice(price) + '</p></a>';
            }).join('');
            section.style.display = 'block';
        } catch (e) {}
    }

    loadProduct();
})();
