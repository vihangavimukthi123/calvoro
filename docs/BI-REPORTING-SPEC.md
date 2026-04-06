# Calvoro – Business Intelligence & Reporting System

**Production-ready BI & Reporting** at Zara / H&M / Nike-level standards for the Admin Panel.

---

## 1. Database Structure

### 1.1 New Analytics Tables (MySQL)

```sql
-- Search & behavior events (storefront logs)
CREATE TABLE analytics_search_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    keyword VARCHAR(255) NOT NULL,
    has_results TINYINT(1) NOT NULL DEFAULT 1,
    result_count INT DEFAULT 0,
    session_id VARCHAR(64),
    user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at),
    INDEX idx_keyword (keyword(50)),
    INDEX idx_has_results (has_results)
);

-- Product views / add-to-cart / wishlist (behavior)
CREATE TABLE analytics_product_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type ENUM('view', 'add_to_cart', 'wishlist_add', 'wishlist_remove') NOT NULL,
    product_id INT NOT NULL,
    user_id INT NULL,
    session_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at),
    INDEX idx_product (product_id),
    INDEX idx_event_type (event_type),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Daily aggregated snapshots (for fast reporting & caching)
CREATE TABLE analytics_daily (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    revenue DECIMAL(14, 2) DEFAULT 0,
    order_count INT DEFAULT 0,
    new_customers INT DEFAULT 0,
    product_views INT DEFAULT 0,
    searches_with_results INT DEFAULT 0,
    searches_no_results INT DEFAULT 0,
    add_to_cart_count INT DEFAULT 0,
    wishlist_adds INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_date (date)
);

-- Live visitors (optional: in-memory or Redis in production; table for persistence)
CREATE TABLE analytics_live_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL UNIQUE,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_last_seen (last_seen_at)
);
```

### 1.2 Existing Tables Used for Reports

- **orders** – revenue, order count, status, date (indexed on `created_at`, `status`)
- **order_items** – revenue by product/category, quantity sold
- **products** – stock, category_id (for inventory value, low stock, categories)
- **users** – registered customers, `created_at` for new customers
- **categories** – category names for breakdowns
- **cart_items** / **wishlist** – for abandonment and “add-to-cart but not purchased” (if applicable)

### 1.3 Indexing for Reports

- `orders`: `(status)`, `(created_at)`, `(DATE(created_at))` for daily/monthly
- `order_items`: `(order_id)`, `(product_id)`
- `products`: `(category_id)`, `(stock)`, `(status)`
- `analytics_*`: as in schema above

---

## 2. API Routes

All under **`/api/admin/analytics`**, protected by **requireAdmin**. Base URL prefix: `/api/admin/analytics`.

| Method | Route | Description | Query Params |
|--------|--------|-------------|--------------|
| GET | `/sales/monthly` | Monthly sales (graph + revenue + order count) | `year`, `month` (optional) |
| GET | `/sales/annual` | Annual sales, year comparison | `years` (e.g. 2023,2024) |
| GET | `/sales/daily` | Daily sales overview | `from`, `to` (date) |
| GET | `/sales/breakdown` | Revenue by category / product | `from`, `to`, `groupBy=category\|product` |
| GET | `/sales/export` | Export (PDF/CSV/Excel) | `from`, `to`, `format=csv\|xlsx` |
| GET | `/products/top-sold` | Most sold products | `from`, `to`, `limit` |
| GET | `/products/low-stock` | Low stock products | `threshold` (default 10) |
| GET | `/products/out-of-stock` | Out of stock | - |
| GET | `/products/views` | Product views count | `from`, `to`, `limit` |
| GET | `/products/conversion` | Conversion rate per product | `from`, `to` |
| GET | `/products/categories-performance` | Top categories | `from`, `to`, `limit` |
| GET | `/products/inventory-value` | Inventory value summary | - |
| GET | `/customers/total` | Total registered | - |
| GET | `/customers/new` | New customers (monthly) | `year`, `month` or `from`, `to` |
| GET | `/customers/returning-ratio` | Returning vs new ratio | `from`, `to` |
| GET | `/customers/top` | Top customers by spending | `from`, `to`, `limit`, `page` |
| GET | `/customers/:id/orders` | Customer order history | `page`, `limit` |
| GET | `/customers/locations` | Country/city insights | `from`, `to` |
| GET | `/behavior/search-top` | Most searched keywords | `from`, `to`, `limit` |
| GET | `/behavior/search-no-results` | No-result keywords | `from`, `to`, `limit` |
| GET | `/behavior/most-viewed` | Most viewed products | `from`, `to`, `limit` |
| GET | `/behavior/add-to-cart-not-purchased` | Abandoned add-to-cart | `from`, `to`, `limit` |
| GET | `/behavior/wishlist-trends` | Wishlist trends | `from`, `to` |
| GET | `/behavior/cart-abandonment-rate` | Cart abandonment rate | `from`, `to` |
| GET | `/metrics/orders` | Total / pending / completed / cancelled | `from`, `to` |
| GET | `/metrics/refund-rate` | Refund rate | `from`, `to` |
| GET | `/metrics/aov` | Average order value | `from`, `to` |
| GET | `/metrics/conversion-rate` | Conversion rate | `from`, `to` |
| GET | `/realtime/visitors` | Live visitors count | - |
| GET | `/realtime/orders` | Live/recent orders | `limit` |
| GET | `/realtime/ticker` | Real-time sales ticker | `limit` |
| GET | `/realtime/activity` | Recent activity feed | `limit` |

**Validation (all date/filter params):**

- `from`, `to`: ISO date (YYYY-MM-DD), `to` ≥ `from`, max range 1 year (configurable).
- `year`, `month`: integer, sane bounds.
- `limit`, `page`: integer, limit ≤ 500, page ≥ 1.
- `groupBy`, `format`: whitelist only (e.g. `category`|`product`, `csv`|`xlsx`).

**Security:** requireAdmin on all; validate and parameterize all inputs (no raw SQL from query); use caching for heavy reports (e.g. 5–15 min TTL).

---

## 3. Admin UI Structure

### 3.1 Navigation (Sidebar)

- **Analytics** (or **Reports**) → `/admin/analytics.html`  
  Sub-items (optional): Overview, Sales, Products, Customers, Behavior, Export.

### 3.2 Analytics Page Layout (Single Page with Sections)

1. **Top bar**  
   - Title “Analytics” (or “Reports”)  
   - Date range picker (from / to)  
   - Theme toggle (dark/light)  
   - Export dropdown (PDF, CSV, Excel) for current view

2. **KPI cards (top row)**  
   - Total revenue (period)  
   - Orders count  
   - AOV  
   - Conversion rate (or top metric)  
   - Live visitors (real-time)

3. **Modules (collapsible or tabs)**  
   - **Sales Analytics** – Monthly chart, annual comparison, daily table, revenue breakdown (category/product), export.  
   - **Product Performance** – Most sold, low stock, out of stock alerts, views, conversion per product, top categories, inventory value.  
   - **Customer Analytics** – Total, new (monthly), returning vs new, top customers table (paginated), link to order history, location insights.  
   - **Search & Behavior** – Top search terms, no-result searches, most viewed, add-to-cart not purchased, wishlist trends, cart abandonment rate.  
   - **E‑commerce Metrics** – Orders by status, refund rate, AOV, conversion rate.  
   - **Real-time** – Live visitors, live orders list, sales ticker, activity feed.

4. **Charts**  
   - Line: monthly/daily revenue, trends.  
   - Bar: year comparison, category/product breakdown.  
   - Donut/Pie: category split, order status split.  
   - Use Chart.js or ApexCharts; keep one library for consistency.

5. **Responsive & UX**  
   - Cards with clear headings and loading states.  
   - Tables: sortable, paginated where needed.  
   - Smooth transitions and minimal, luxury-style aesthetic (aligned with brand).  
   - No framework: vanilla JS, one shared admin CSS (and optional analytics-specific overrides).

### 3.3 File Layout

```
backend/
  admin/
    analytics.html      # Single BI dashboard page
    dashboard.html      # Existing; link to Analytics
    products.html
    ...
    css/
      admin.css         # Base + analytics + theme
    js/
      admin.js          # Auth, formatCurrency, etc.
      analytics.js      # Charts, API calls, date filter, export
```

---

## 4. Backend Logic (Required)

### 4.1 Analytics Data Writing (Storefront)

- **Search:** On storefront search request, log to `analytics_search_log` (keyword, has_results, result_count, session_id, user_id if logged in).  
- **Product view:** When product page is loaded, POST to e.g. `/api/analytics/event` with `{ type: 'view', product_id }` (session_id/user_id); backend inserts into `analytics_product_events`.  
- **Add to cart / wishlist:** Same `analytics_product_events` with type `add_to_cart`, `wishlist_add`, `wishlist_remove` (from storefront or backend when cart/wishlist is updated).  
- **Live visitors:** Optional heartbeat from storefront (e.g. every 60s) to `/api/analytics/heartbeat`; backend upserts `analytics_live_sessions` by session_id and prunes entries older than e.g. 5 minutes.

### 4.2 Aggregation (Daily Snapshot)

- Cron or scheduled job (e.g. daily at 00:05):  
  - Compute previous day’s revenue, order_count, new_customers, product_views, search counts, add_to_cart_count, wishlist_adds from orders, users, analytics_* tables.  
  - INSERT or UPDATE `analytics_daily` for that date.  
- Reports can use `analytics_daily` for fast date-range queries and fall back to raw tables for “today” or when snapshot not yet run.

### 4.3 Report Queries (Examples)

- **Monthly sales:** SUM revenue, COUNT orders from `orders` WHERE status IN ('completed','paid') AND created_at in month; group by month for chart.  
- **Annual comparison:** Same by year (and optionally month).  
- **Revenue by category:** JOIN order_items → products → categories, SUM(quantity * price), GROUP BY category.  
- **Most sold products:** FROM order_items GROUP BY product_id ORDER BY SUM(quantity) DESC.  
- **Low stock:** FROM products WHERE stock &lt; threshold AND status = 'active'.  
- **Conversion rate:** (orders with status completed/paid) / (unique sessions or users who added to cart) in period; use analytics_product_events and orders.  
- **Cart abandonment:** Count add_to_cart events minus count of orders in same period (by session or user); ratio = 1 - (orders / add_to_cart_sessions).  
- **Top customers:** FROM orders WHERE status IN ('completed','paid') GROUP BY user_id ORDER BY SUM(total) DESC, with pagination.  
- **Customer locations:** From orders (customer_address / city/country if stored) or user_profiles; aggregate by country/city.

All queries must use parameterized statements and avoid string concatenation (prevent SQL injection).

### 4.4 Caching

- Cache heavy report responses (e.g. monthly sales, annual, breakdown) in memory (e.g. node-cache) or Redis.  
- TTL: 5–15 minutes; cache key = route + serialized query params (e.g. from, to, groupBy).  
- Invalidate or skip cache when “today” is in range if real-time is critical.  
- Real-time endpoints (visitors, live orders, ticker, activity) typically not cached or very short TTL (e.g. 30s).

### 4.5 Export (CSV/Excel)

- **CSV:** Generate in-memory (e.g. array of rows → string with proper escaping) and send with `Content-Disposition: attachment; filename="report.csv"`.  
- **Excel:** Use library (e.g. `exceljs`) to build .xlsx and stream or send buffer.  
- **PDF:** Use library (e.g. `puppeteer` or `pdfkit`) to generate from HTML or structured data; optional “Print to PDF” from admin UI as fallback.  
- Export uses same date range and filters as current view; validate and limit range (e.g. max 1 year).

---

## 5. File Storage (Banners, Images, Videos)

### 5.1 Directory Layout

- **Storage root:** `backend/storage/` (or project root `storage/` if you prefer).  
- **Suggested structure:**  
  - `storage/app/public/banners/`  
  - `storage/app/public/products/`  
  - `storage/app/public/categories/`  
  - `storage/app/public/videos/`  
- Uploads (from admin or API) should be written under `storage/app/public/...` so they persist and are not overwritten by deployments.

### 5.2 Public Access (storage:link Concept)

- **Option A (recommended):** Express static route mapping URL to storage directory.  
  - Example: `app.use('/storage', express.static(path.join(__dirname, 'storage', 'app', 'public')));`  
  - So `https://yourdomain.com/storage/banners/image.png` serves `backend/storage/app/public/banners/image.png`.  
- **Option B:** Symlink from `backend/public/storage` → `backend/storage/app/public`, then serve `public` as static.  
- **Script (Node):** In `package.json`, add script:  
  - `"storage:link": "node scripts/storage-link.js"`  
  - `storage-link.js` creates the symlink (e.g. `public/storage` → `../storage/app/public`) if it doesn’t exist.  
- Store in DB only **relative paths** (e.g. `/storage/banners/xyz.jpg`) so the same path works in dev and production.

### 5.3 Security for Storage

- Do not execute files; serve only as static assets.  
- Validate file type and size on upload; restrict extensions (e.g. jpg, png, webp, mp4).  
- Prefer unique filenames (uuid + extension) to avoid overwrites and enumeration.

---

## 6. Performance & Security

### 6.1 Analytics Routes

- All `/api/admin/analytics/*` protected by **requireAdmin** (session.admin).  
- Validate every input (dates, limits, enums); reject invalid or out-of-range values.  
- Use **parameterized queries** only; no raw SQL from request params.  
- Rate limit admin API (e.g. 100 req/min per IP or per admin) to avoid abuse.

### 6.2 SQL Injection & Validation

- Never concatenate user input into SQL.  
- Use placeholders (`?` or named params) for all filters (dates, ids, limits).  
- Whitelist enums (groupBy, format, event_type) in code.

### 6.3 Caching

- Use caching for expensive reports (sales, breakdowns, annual); short TTL for real-time.  
- Cache key includes normalized params to avoid poisoning.

### 6.4 Pagination

- All list endpoints (top customers, order history, product lists) support `page` and `limit`; enforce max `limit` (e.g. 100 or 500).  
- Return `total` or `hasMore` for UI pagination.

### 6.5 Role-Based Access (Future)

- Current: single admin role.  
- For multiple roles: add `admin_roles` table and `role` to `admin_users`; in middleware check `req.session.admin.role` and allow only “analytics” or “super_admin” for analytics routes.

---

## 7. Recommended Tech Stack Improvements

| Area | Current | Recommendation |
|------|--------|-----------------|
| **Charts** | - | Chart.js or ApexCharts (vanilla JS, no React) |
| **Export Excel** | - | exceljs |
| **Export PDF** | - | pdfkit or puppeteer (for HTML→PDF) |
| **Caching** | - | node-cache (in-memory) or Redis for multi-instance |
| **Real-time** | - | Optional: Socket.io for live ticker/visitors; else short-interval polling |
| **Scheduling** | - | node-cron for daily analytics_daily aggregation |
| **Validation** | - | express-validator or Joi for request params |
| **Rate limiting** | - | express-rate-limit on /api/admin/* |
| **File upload** | Existing | Ensure all uploads go to storage/app/public and use /storage route |

---

## 8. Summary Checklist

- [ ] Analytics tables created and indexed.  
- [ ] Storefront logs search and product events (and optional heartbeat).  
- [ ] Daily aggregation job for analytics_daily.  
- [ ] All analytics API routes implemented with validation and caching.  
- [ ] Admin analytics UI with KPIs, charts, date range, export.  
- [ ] Storage directory and /storage (or symlink) for persistent public files.  
- [ ] requireAdmin and rate limiting on admin/analytics.  
- [ ] Pagination on list endpoints; safe, parameterized queries everywhere.

This spec gives you the full structure for a production-ready BI and reporting system; implementation details (exact SQL for each report and front-end chart config) can follow this document.
