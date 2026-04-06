# Calvoro design system – theme (light/dark)

## Overview

- **Monochrome theme** via CSS variables; `<html data-theme="light">` or `data-theme="dark">`.
- **Toggle** in the navbar (moon = switch to dark, sun = switch to light).
- **Persistence**: `localStorage.calvoro_theme` (`"light"` | `"dark"`).
- **System preference**: if no stored value, `prefers-color-scheme: dark` is respected.
- **No FOUC**: a small inline script in `<head>` sets `data-theme` before first paint on every page.

## Tokens (use these in CSS)

| Token | Light | Dark |
|-------|--------|------|
| `--color-bg` | `#ffffff` | `#0a0a0a` |
| `--color-text` | `#1a1a1a` | `#f5f5f5` |
| `--color-text-muted` | `#666666` | `#a3a3a3` |
| `--color-border` | `#e5e5e5` | `#262626` |
| `--color-card` | `#f5f5f5` | `#171717` |
| `--color-btn-bg` | `#000000` | `#ffffff` |
| `--color-btn-text` | `#ffffff` | `#000000` |
| `--color-header-bg` | `#ffffff` | `#0a0a0a` |
| `--color-footer-bg` | `#1a1a1a` | `#0a0a0a` |
| `--color-logo-filter` | `brightness(0)` | `brightness(0) invert(1)` |

(Others: `--color-promo-bg`, `--color-promo-text`, `--color-input-bg`, `--color-modal-bg`, `--color-sale`, etc.)

## Integration steps for new pages

1. **Avoid FOUC**  
   In `<head>`, before the stylesheet, add:
   ```html
   <script>(function(){var v=localStorage.getItem('calvoro_theme');var dark=v==='dark'||(!v&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light');})();</script>
   ```

2. **Use tokens in CSS**  
   Use `var(--color-*)` for all backgrounds, text, and borders so they follow the theme.

3. **Theme toggle**  
   If the page has `.header .actions` and loads `js/main.js`, the theme toggle is injected. Otherwise add the same toggle button markup as in `index.html` (button with `.theme-toggle` and sun/moon SVGs).

4. **Logo**  
   - **Single PNG**: CSS handles it via `--color-logo-filter` (black in light, white in dark).
   - **Two assets**: set `data-logo-light="logo.png"` and `data-logo-dark="logo-white.png"` on the logo `<img>`; `main.js` will swap `src` when the theme changes.

## Files touched

- `css/styles.css`: theme tokens and component use of `var(--color-*)`.
- `js/main.js`: theme init, toggle handler, optional logo swap.
- `index.html`: inline FOUC script + theme toggle button in navbar.
- Other storefront pages: same FOUC script in `<head>`.
