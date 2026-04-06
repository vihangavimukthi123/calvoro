// Home page video-strip loader (admin-configurable)
(function () {
    function getApiBase() {
        return (window.CalvoroAPIBase || '');
    }

    function playStripVideos() {
        var videos = document.querySelectorAll('.video-strip video');
        videos.forEach(function (v) {
            try {
                v.muted = true;
                v.play().catch(function () { });
            } catch (e) { }
        });
    }

    function setText(el, value) {
        el.textContent = (value == null ? '' : String(value));
    }

    function buildVideoPanel(item) {
        var a = document.createElement('a');
        a.className = 'video-panel';
        a.href = item.href || '#';

        var video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';

        var source = document.createElement('source');
        source.src = item.videoSrc || '';
        // Set a best-effort mime type based on file extension.
        var ext = String(item.videoSrc || '').split('.').pop().toLowerCase();
        var mime = 'video/mp4';
        if (ext === 'webm') mime = 'video/webm';
        if (ext === 'mov' || ext === 'qt') mime = 'video/quicktime';
        source.type = mime;
        video.appendChild(source);

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

    async function init() {
        var grid = document.getElementById('videoStripGrid');
        if (!grid) return;

        var base = getApiBase();
        try {
            var r = await fetch(base + '/api/video-strip', { credentials: 'include' });
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
            playStripVideos();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

