-- Floating promotional popup (admin-managed). Only one row should have is_active = 1 at a time (enforced in application layer).
CREATE TABLE IF NOT EXISTS promotions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    image_path VARCHAR(1024) NOT NULL DEFAULT '',
    redirect_link VARCHAR(2048) NOT NULL DEFAULT '',
    is_active TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_promotions_active (is_active)
);
