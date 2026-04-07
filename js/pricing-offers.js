/**
 * Seasonal offer strip + countdown (uses GET /api/offers/active).
 */
(function () {
    function pad(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function runCountdown(endTs, el) {
        if (!el) return;
        function tick() {
            var left = Math.max(0, endTs - Date.now());
            var s = Math.floor(left / 1000);
            var d = Math.floor(s / 86400);
            var h = Math.floor((s % 86400) / 3600);
            var m = Math.floor((s % 3600) / 60);
            var sec = s % 60;
            el.textContent = d > 0
                ? 'Ends in ' + d + 'd ' + pad(h) + ':' + pad(m) + ':' + pad(sec)
                : pad(h) + ':' + pad(m) + ':' + pad(sec);
        }
        tick();
        setInterval(tick, 1000);
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function init() {
        var wrap = document.getElementById('calvoro-seasonal-offer');
        if (!wrap) return;

        // වෙනස් කළ කොටස: කෙලින්ම /api/... යොදා ඇත
        fetch('/api/offers/active', { credentials: 'include' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var list = (data && data.campaigns) || [];
                if (!list.length) return;
                var c = list[0];
                var end = c.ends_at ? new Date(c.ends_at).getTime() : 0;
                wrap.style.background = c.gradient_css || 'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)';
                wrap.innerHTML =
                    '<div class="calvoro-seasonal-offer__inner">' +
                    '  <div class="calvoro-seasonal-offer__copy">' +
                    '    <h2 class="calvoro-seasonal-offer__headline">' + esc(c.hero_headline) + '</h2>' +
                    '    <p class="calvoro-seasonal-offer__sub">' + esc(c.hero_subheadline) + '</p>' +
                    '  </div>' +
                    '  <div class="calvoro-seasonal-offer__meta">' +
                    (c.is_flash_sale ? '<span class="calvoro-seasonal-offer__flash">Flash</span>' : '') +
                    '    <div class="calvoro-seasonal-offer__countdown" id="calvoro-offer-countdown" aria-live="polite"></div>' +
                    '  </div>' +
                    '</div>';
                wrap.removeAttribute('hidden');
                if (end > Date.now()) {
                    runCountdown(end, document.getElementById('calvoro-offer-countdown'));
                }
            })
            .catch(function () { /* no API */ });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
