# Calvoro Account System Setup Guide

## 1. Database Schema

Run the extended schema to add Cart, Wishlist, and Admin Activity Logs tables:

```bash
mysql -u root -p calvoro_db < backend/database/schema-extended.sql
```

Or run manually in MySQL:

```sql
USE calvoro_db;

-- Cart items (user_id, product_id, quantity, color, size)
CREATE TABLE IF NOT EXISTS cart_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    color VARCHAR(50) NULL,
    size VARCHAR(20) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_product_color_size (user_id, product_id, color(50), size(20)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
);

-- Wishlist
CREATE TABLE IF NOT EXISTS wishlist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_product (user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
);

-- Admin activity logs
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    admin_username VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NULL,
    entity_id VARCHAR(50) NULL,
    details JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_id (admin_id),
    INDEX idx_created_at (created_at)
);
```

## 2. Features Implemented

### Wishlist
- **Heart icon**: Click on any product card to add/remove from wishlist (localStorage for guests)
- **Wishlist page**: `wishlist.html` - view all saved items, remove with heart button
- **Footer link**: "Wishlist" in MY ACCOUNT section navigates to wishlist

### Add to Cart – Correct Image
- Product page now uses the **backend product image** (from API) when adding to cart
- Uses selected color’s image or main product image from database

### User Dashboard (account.html)
- **Profile**: Name, email
- **Order history**: List of past orders with status
- **My Cart**: When logged in, shows backend cart (after sync)
- **My Wishlist**: When logged in, shows backend wishlist (after sync)

### Admin Panel
- **Dashboard**: Stats (products, orders, revenue, pending)
- **Users**: View all users, add users, edit roles, delete users (see `/admin/users.html`)
- **Products, Categories, Orders**: As before

### Security
- **bcrypt** for password hashing
- **Session-based** authentication (admin and user)
- **Role-based** middleware: `requireAdmin`, `requireUser`
- Admin routes require admin session

## 3. API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/users/me | Current user (storefront) |
| POST | /api/users/login | User login |
| POST | /api/users/register | User registration |
| POST | /api/users/logout | User logout |
| GET | /api/orders | User's orders (when logged in) |
| GET | /api/admin/users | List all users (admin) |
| POST | /api/admin/users | Add user (admin) |
| PUT | /api/admin/users/:id | Update user/role (admin) |
| DELETE | /api/admin/users/:id | Delete user (admin) |
| GET | /api/admin/stats | Dashboard stats (admin) |

## 4. Default Admin
- URL: /api/admin
- Username: `admin`
- Password: `admin123`

## 5. Start Server
```bash
cd backend
npm install
node server.js
```
