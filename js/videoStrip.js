// Home page video-strip loader (admin-configurable with lazy-loading)
(function () {
    function setText(el, value) {
        el.textContent = (value == null ? '' : String(value));
    }

    function buildVideoPanel(item) {
        var a = document.createElement('a');
        a.className = 'video-panel';
        a.href = item.href || '#';

        var video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'none'; // Do not preload aggressively
        video.setAttribute('data-src', item.videoSrc || '');

        var overlay = document.createElement('span');
        overlay.className = 'video-panel-overlay';

        var label = document.createElement('span');
        label.className = 'video-panel-label';
        setText(label, item.label || '');

        var arrow = document.createElement('span');
        arrow.className = 'video-panel-arrow';
        arrow.textContent = '→';

        overlay.appendChild(label);
        overlay.appendChild(arrow);

        a.appendChild(video);
        a.appendChild(overlay);

        return a;
    }

    function lazyLoadVideos() {
        var videos = document.querySelectorAll('.video-strip video');
        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function (entries, obs) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        var video = entry.target;
                        var src = video.getAttribute('data-src');
                        if (src) {
                            var source = document.createElement('source');
                            source.src = src;
                            var ext = src.split('.').pop().toLowerCase();
                            var mime = 'video/mp4';
                            if (ext === 'webm') mime = 'video/webm';
                            if (ext === 'mov' || ext === 'qt') mime = 'video/quicktime';
                            source.type = mime;
                            
                            video.appendChild(source);
                            video.load();
                            video.removeAttribute('data-src');
                        }
                        try {
                            video.muted = true;
                            video.play().catch(function() {});
                        } catch (e) {}
                        obs.unobserve(video);
                    }
                });
            }, { rootMargin: '100px' });

            videos.forEach(function (v) {
                observer.observe(v);
            });
        } else {
            // Fallback for older browsers
            videos.forEach(function (video) {
                var src = video.getAttribute('data-src');
                if (src) {
                    var source = document.createElement('source');
                    source.src = src;
                    video.appendChild(source);
                    video.load();
                }
                try {
                    video.muted = true;
                    video.play().catch(function() {});
                } catch(e) {}
            });
        }
    }

    async function init() {
        var grid = document.getElementById('videoStripGrid');
        if (!grid) return;

        try {
            var r = await fetch('/api/video-strip', { credentials: 'include' });
            var d = await r.json().catch(function () { return {}; });
            if (!r.ok) throw new Error((d && d.error) ? d.error : 'Failed to load');

            var items = d && Array.isArray(d.items) ? d.items : [];
            if (items && items.length) {
                grid.innerHTML = '';
                items.slice(0, 3).forEach(function (it) {
                    grid.appendChild(buildVideoPanel(it || {}));
                });
            }
        } catch (e) {
            // If admin config fails, keep the current hardcoded markup.
        } finally {
            lazyLoadVideos();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
