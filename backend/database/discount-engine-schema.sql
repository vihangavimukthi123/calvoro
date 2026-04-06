-- ============================================================================
-- Calvoro Discount Engine — seasonal campaigns, rules, coupons, analytics
-- Run against MySQL 8+. Indexes tuned for storefront + admin queries.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pricing_engine_settings (
    id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
    resolution_mode ENUM('priority', 'best_price') NOT NULL DEFAULT 'best_price',
    allow_stack TINYINT(1) NOT NULL DEFAULT 0,
    tier_order JSON NULL COMMENT 'e.g. ["flash","seasonal","product","category","coupon"]',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO pricing_engine_settings (id, resolution_mode, allow_stack, tier_order)
VALUES (1, 'best_price', 0, JSON_ARRAY('flash', 'seasonal', 'product', 'category', 'coupon'));

CREATE TABLE IF NOT EXISTS seasonal_campaigns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    hero_headline VARCHAR(255) NOT NULL DEFAULT '',
    hero_subheadline VARCHAR(255) NOT NULL DEFAULT '',
    hero_image_url VARCHAR(1024) NOT NULL DEFAULT '',
    gradient_css VARCHAR(200) NOT NULL DEFAULT 'linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)',
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_flash_sale TINYINT(1) NOT NULL DEFAULT 0,
    display_priority INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_campaign_live (is_active, starts_at, ends_at),
    UNIQUE KEY uk_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discount_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campaign_id INT NULL,
    scope ENUM('product', 'category', 'sitewide') NOT NULL DEFAULT 'product',
    product_id INT NULL,
    category_id INT NULL,
    tier ENUM('flash', 'seasonal', 'product', 'category', 'coupon') NOT NULL DEFAULT 'product',
    discount_type ENUM('percent', 'fixed', 'bogo') NOT NULL DEFAULT 'percent',
    percent_off DECIMAL(7,2) NULL,
    fixed_off DECIMAL(12,2) NULL,
    bogo_json JSON NULL COMMENT '{"buy":2,"get":1,"getDiscountPercent":100}',
    min_quantity INT NOT NULL DEFAULT 1,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    stackable TINYINT(1) NOT NULL DEFAULT 0,
    rule_priority INT NOT NULL DEFAULT 100,
    max_uses INT NULL,
    use_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rule_active (is_active, starts_at, ends_at),
    INDEX idx_rule_product (product_id),
    INDEX idx_rule_category (category_id),
    INDEX idx_rule_campaign (campaign_id),
    CONSTRAINT fk_discount_campaign FOREIGN KEY (campaign_id) REFERENCES seasonal_campaigns(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discount_coupons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(64) NOT NULL,
    discount_rule_id INT NOT NULL,
    max_uses INT NULL,
    use_count INT NOT NULL DEFAULT 0,
    expires_at DATETIME NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_coupon_code (code),
    INDEX idx_coupon_rule (discount_rule_id),
    CONSTRAINT fk_coupon_rule FOREIGN KEY (discount_rule_id) REFERENCES discount_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discount_analytics (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NULL,
    discount_rule_id INT NULL,
    coupon_code VARCHAR(64) NULL,
    amount_saved DECIMAL(12,2) NOT NULL DEFAULT 0,
    order_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    product_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_da_rule (discount_rule_id),
    INDEX idx_da_order (order_id),
    INDEX idx_da_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
