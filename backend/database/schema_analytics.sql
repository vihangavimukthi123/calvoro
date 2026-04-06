-- Calvoro BI & Analytics tables
-- Run after main schema; use database calvoro_db

USE calvoro_db;

-- Search logs (storefront)
CREATE TABLE IF NOT EXISTS analytics_search_log (
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

-- Product events (view, add_to_cart, wishlist)
CREATE TABLE IF NOT EXISTS analytics_product_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(32) NOT NULL,
    product_id INT NOT NULL,
    user_id INT NULL,
    session_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at),
    INDEX idx_product (product_id),
    INDEX idx_event_type (event_type),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Daily aggregated snapshot
CREATE TABLE IF NOT EXISTS analytics_daily (
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

-- Live sessions (for visitor count)
CREATE TABLE IF NOT EXISTS analytics_live_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL UNIQUE,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_last_seen (last_seen_at)
);

-- Add index on orders for reporting if not exists
-- CREATE INDEX idx_orders_created_at ON orders(created_at);
-- CREATE INDEX idx_orders_status_created ON orders(status, created_at);
