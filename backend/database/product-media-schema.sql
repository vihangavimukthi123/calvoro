-- ProductMedia table extension
-- Run this after schema.sql to add video support

USE calvoro_db;

-- ProductMedia table for images and videos
CREATE TABLE IF NOT EXISTS product_media (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    type ENUM('image', 'video') NOT NULL DEFAULT 'image',
    url VARCHAR(500) NOT NULL,
    hover_video_url VARCHAR(500) NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id),
    INDEX idx_type (type)
);

-- Add media support to products table (optional - for backward compatibility)
-- Products can still use images JSON field, but ProductMedia is preferred for videos
-- ALTER TABLE products ADD COLUMN media_enabled BOOLEAN DEFAULT FALSE;
