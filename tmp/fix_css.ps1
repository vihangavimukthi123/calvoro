$file = "css\styles.css"
$c = Get-Content $file -Raw

# ── Fix 1: trending-viewport overflow ────────────────────────────────────────
$old1 = ".trending-viewport {`r`n    overflow: hidden;`r`n    cursor: grab;`r`n    -webkit-overflow-scrolling: touch;`r`n}"
$new1 = ".trending-viewport {`r`n    overflow-x: auto;`r`n    overflow-y: visible;`r`n    cursor: grab;`r`n    -webkit-overflow-scrolling: touch;`r`n    scrollbar-width: none;`r`n    scroll-behavior: smooth;`r`n}`r`n`r`n.trending-viewport::-webkit-scrollbar {`r`n    display: none;`r`n}"
$c = $c.Replace($old1, $new1)

# ── Fix 2: Remove transform transition from premium products-row-nowrap ───────
$old2 = "    transition: transform 0.5s cubic-bezier(0.25, 1, 0.5, 1);`r`n    scroll-behavior: smooth;`r`n    will-change: transform;"
$new2 = "    will-change: scroll-position;"
$c = $c.Replace($old2, $new2)

# ── Fix 3: Remove all content from line 3835 onwards and replace cleanly ─────
# Find the marker for "Mobile Menu Toggle" section (the real one, not duplicate)
$marker = "/* Mobile Menu Toggle */"
$idx = $c.IndexOf($marker)
$head = $c.Substring(0, $idx)

$newTail = @"
/* ========== MOBILE MENU SYSTEM ========== */

/* Trigger button (hamburger) */
.mobile-menu-trigger {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    color: var(--color-text);
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
}

/* Drawer overlay wrapper */
.mobile-menu {
    position: fixed;
    inset: 0;
    z-index: 10001;
    visibility: hidden;
    pointer-events: none;
    transition: visibility 0.3s;
}

.mobile-menu[aria-hidden="false"] {
    visibility: visible;
    pointer-events: auto;
}

/* Backdrop */
.mobile-menu-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    opacity: 0;
    transition: opacity 0.3s;
}

.mobile-menu[aria-hidden="false"] .mobile-menu-overlay {
    opacity: 1;
}

/* Sliding panel */
.mobile-menu-content {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 85%;
    max-width: 300px;
    background: var(--color-bg);
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    display: flex;
    flex-direction: column;
    padding: 20px;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.1);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
}

.mobile-menu[aria-hidden="false"] .mobile-menu-content {
    transform: translateX(0);
}

/* Header row: logo + close */
.mobile-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
}

.mobile-menu-header .logo {
    height: 32px;
    display: flex;
    align-items: center;
    padding: 0;
}

.mobile-menu-header .logo a {
    display: flex;
    align-items: center;
    height: 100%;
    text-decoration: none;
}

.mobile-menu-header .logo img {
    height: 32px;
    width: auto;
    max-width: 110px;
    object-fit: contain;
    display: block;
    filter: var(--color-logo-filter);
}

.mobile-menu-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--color-text);
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
}

/* Nav links */
.mobile-menu-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
}

.mobile-menu-nav a {
    text-decoration: none;
    color: var(--color-text);
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 12px 4px;
    min-height: 48px;
    display: flex;
    align-items: center;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    border-bottom: 1px solid var(--color-border);
}

.mobile-menu-nav a:last-child {
    border-bottom: none;
}

.mobile-menu-divider {
    height: 1px;
    background: var(--color-border);
    margin: 8px 0;
}

/* Footer social */
.mobile-menu-footer {
    margin-top: auto;
    padding-top: 20px;
    border-top: 1px solid var(--color-border);
}

.mobile-menu-social {
    display: flex;
    gap: 20px;
}

.mobile-menu-social a {
    text-decoration: none;
    color: var(--color-text-muted);
    font-size: 13px;
    font-weight: 600;
    min-height: 44px;
    display: flex;
    align-items: center;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
}

/* ========== GLOBAL MOBILE RESPONSIVE (max-width: 768px) ========== */
@media (max-width: 768px) {

    /* ── Header ── */
    .header nav {
        display: none !important;
    }

    .header .container {
        display: grid !important;
        grid-template-columns: 48px 1fr 148px !important;
        align-items: center !important;
        padding: 0 8px !important;
        gap: 0 !important;
        height: 60px !important;
    }

    .mobile-menu-trigger {
        grid-column: 1 !important;
        display: flex !important;
        justify-content: flex-start !important;
        padding: 0 !important;
        margin: 0 !important;
        z-index: 10 !important;
        min-width: 44px;
        min-height: 44px;
    }

    .logo {
        grid-column: 2 !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        margin: 0 !important;
        min-width: 0 !important;
        z-index: 5 !important;
    }

    .logo img {
        height: 28px !important;
        width: auto !important;
        max-width: 130px !important;
        object-fit: contain !important;
    }

    .actions {
        grid-column: 3 !important;
        display: flex !important;
        justify-content: flex-end !important;
        align-items: center !important;
        gap: 2px !important;
        z-index: 10 !important;
    }

    .actions .search-trigger,
    .actions .theme-toggle,
    .actions .account-btn,
    .actions .cart-btn {
        width: 36px !important;
        height: 36px !important;
        min-width: 36px !important;
        min-height: 36px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        background: none !important;
        border: none !important;
        touch-action: manipulation !important;
        -webkit-tap-highlight-color: transparent !important;
        cursor: pointer !important;
    }

    .actions .locale-btn {
        display: none !important;
    }

    .actions .search-trigger span {
        display: none !important;
    }

    /* ── Hero ── */
    .hero {
        height: 380px;
        margin-bottom: 32px;
    }

    .hero-content h1 {
        font-size: 28px;
        letter-spacing: 2px;
    }

    .hero-content p {
        font-size: 13px;
        letter-spacing: 2px;
    }

    /* ── Trending Slider on mobile: show arrows + native scroll ── */
    .trending-slider-section {
        padding: 40px 0;
        overflow: visible;
    }

    .trending-slider-section h2 {
        font-size: 22px;
        margin-bottom: 28px;
    }

    .trending-slider-container {
        padding: 0 16px;
        position: relative;
    }

    .trending-viewport {
        overflow-x: auto !important;
        padding: 8px 0;
    }

    .products-row-nowrap {
        gap: 12px !important;
        width: max-content !important;
    }

    .products-row-nowrap .card {
        flex: 0 0 160px !important;
        width: 160px !important;
    }

    /* Keep arrows visible on mobile but make them smaller */
    .slider-arrow {
        display: flex !important;
        width: 36px !important;
        height: 36px !important;
        position: absolute !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
    }

    .prev-arrow {
        left: -8px !important;
        z-index: 10 !important;
    }

    .next-arrow {
        right: -8px !important;
        z-index: 10 !important;
    }

    /* ── Category grid ── */
    .category-grid {
        grid-template-columns: 1fr;
    }

    .category-card img {
        height: 260px;
    }

    /* ── Footer (INSIDE media query - fixes the critical bug) ── */
    .footer-grid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 24px 20px !important;
        padding: 32px 16px 24px !important;
        margin-bottom: 16px !important;
    }

    footer .container {
        padding: 0 !important;
    }

    .footer-bottom {
        padding: 16px 16px 24px !important;
        font-size: 10px !important;
        line-height: 1.8 !important;
    }

    .footer-bottom p {
        display: flex !important;
        flex-direction: column !important;
        gap: 4px !important;
        align-items: center !important;
    }

    .footer-bar__row {
        flex-direction: column !important;
        align-items: center !important;
        gap: 16px !important;
        padding: 16px !important;
    }

    .footer-emblem {
        justify-content: center !important;
        margin: 0 !important;
    }

    .footer-social {
        justify-content: center !important;
    }

    /* ── Product Detail ── */
    .product-detail {
        display: flex !important;
        flex-direction: column !important;
        gap: 24px !important;
        padding: 16px !important;
    }

    .product-images {
        width: 100% !important;
        flex-direction: column-reverse !important;
    }

    .thumbnails {
        flex-direction: row !important;
        flex-wrap: wrap !important;
        overflow-x: auto !important;
    }

    .thumbnails img {
        width: 60px !important;
        height: 80px !important;
        min-width: 60px !important;
        min-height: 80px !important;
    }

    .product-info {
        width: 100% !important;
        padding: 0 !important;
    }

    /* ── Cart drawer: full width on mobile ── */
    .cart-drawer-left {
        display: none !important;
    }

    .cart-drawer {
        width: 100% !important;
        max-width: 100% !important;
    }

    /* ── Video strip ── */
    .video-strip-grid {
        grid-template-columns: 1fr !important;
    }

    .video-panel {
        aspect-ratio: 16/9 !important;
    }

    /* ── Donate banner ── */
    .donate-dogs-banner {
        height: 300px !important;
    }

    .donate-dogs-content h2 {
        font-size: 26px !important;
    }

    /* ── Newsletter ── */
    .newsletter .form {
        flex-direction: column !important;
        align-items: stretch !important;
    }

    /* ── Main layout ── */
    .main-layout {
        grid-template-columns: 1fr !important;
    }

    .sidebar {
        border: none !important;
    }

    .products {
        grid-template-columns: repeat(2, 1fr) !important;
    }

    .products-row {
        grid-template-columns: repeat(2, 1fr) !important;
    }

    /* ── Touch-friendly global ── */
    button, a {
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
    }
}

/* ── Extra small: narrow phones (320px - 390px) ── */
@media (max-width: 390px) {
    .header .container {
        grid-template-columns: 44px 1fr 124px !important;
    }

    .logo img {
        height: 24px !important;
        max-width: 100px !important;
    }

    .actions .search-trigger,
    .actions .theme-toggle,
    .actions .account-btn,
    .actions .cart-btn {
        width: 30px !important;
        min-width: 30px !important;
    }

    .footer-grid {
        grid-template-columns: 1fr 1fr !important;
        gap: 18px 14px !important;
        padding: 24px 12px !important;
    }

    .footer-grid h4 {
        font-size: 10px !important;
    }

    .footer-grid a {
        font-size: 11px !important;
        margin-bottom: 8px !important;
    }

    .hero {
        height: 320px !important;
    }

    .hero-content h1 {
        font-size: 22px !important;
    }

    .products-row-nowrap .card {
        flex: 0 0 145px !important;
        width: 145px !important;
    }
}

/* ── Large phones (6.7" - 6.9", 428px+) ── */
@media (min-width: 428px) and (max-width: 768px) {
    .products-row-nowrap .card {
        flex: 0 0 175px !important;
        width: 175px !important;
    }

    .footer-grid {
        grid-template-columns: repeat(2, 1fr) !important;
    }
}
"@

$c = $head + $newTail
Set-Content $file $c -NoNewline -Encoding UTF8
Write-Host "CSS fixed. Lines: $($c.Split("`n").Count)"
