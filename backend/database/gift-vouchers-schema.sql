-- Gift Vouchers & Redemptions
-- Run this when using MySQL (or let the app ensure tables via ensureGiftVoucherTables).

-- Voucher definitions (admin-created)
CREATE TABLE IF NOT EXISTS gift_vouchers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    discount_type ENUM('fixed_amount', 'percentage') NOT NULL DEFAULT 'fixed_amount',
    discount_value DECIMAL(10, 2) NOT NULL,
    min_cart_value DECIMAL(10, 2) DEFAULT 0,
    expiry_date DATE NULL,
    usage_limit INT NULL COMMENT 'NULL = unlimited',
    used_count INT NOT NULL DEFAULT 0,
    use_per_user_limit INT NULL COMMENT 'NULL = unlimited per user',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_code (code),
    INDEX idx_active_expiry (is_active, expiry_date)
);

-- Redemption log (one row per order that used a voucher)
CREATE TABLE IF NOT EXISTS voucher_redemptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voucher_id INT NOT NULL,
    order_id INT NOT NULL,
    user_id INT NULL,
    amount_discount DECIMAL(10, 2) NOT NULL,
    redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voucher_id) REFERENCES gift_vouchers(id) ON DELETE CASCADE,
    INDEX idx_voucher (voucher_id),
    INDEX idx_order (order_id)
);

-- Add voucher columns to orders (run if orders table already exists)
-- ALTER TABLE orders ADD COLUMN voucher_code VARCHAR(64) NULL AFTER notes;
-- ALTER TABLE orders ADD COLUMN voucher_discount DECIMAL(10, 2) DEFAULT 0 AFTER voucher_code;
