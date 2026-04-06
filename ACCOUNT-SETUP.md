# My Account Setup

This document describes the My Account dashboard implementation for the Calvoro e-commerce site.

## Folder Structure

```
calvoro-final/
├── account.html              # My Account dashboard (sidebar + sections)
├── js/
│   └── account.js            # Account page logic (API calls, modals, sections)
├── backend/
│   ├── middleware/
│   │   └── requireUser.js    # Auth middleware for account routes
│   ├── routes/
│   │   └── account.js        # Account API routes
│   ├── database/
│   │   └── account-schema.sql # Optional manual SQL (tables auto-created on startup)
│   └── database_mysql.js     # Contains ensureAccountTables() and CRUD methods
```

## Database Tables

Tables are created automatically on server startup via `ensureAccountTables()`:

| Table | Purpose |
|-------|---------|
| `user_profiles` | Profile picture URL (extends `users`) |
| `user_addresses` | Multiple addresses per user, default shipping |
| `user_payment_methods` | Masked card data only (last 4 digits, brand, exp) |
| `user_settings` | Notifications, marketing preferences |

To create tables manually (optional):

```bash
mysql -u root -p calvoro_db < backend/database/account-schema.sql
```

## API Endpoints (requires login)

All `/api/account/*` routes require an authenticated user session.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/account/profile` | Get profile |
| PUT | `/api/account/profile` | Update profile (name, phone, address, city, profile_picture_url) |
| PUT | `/api/account/password` | Change password |
| GET | `/api/account/addresses` | List addresses |
| POST | `/api/account/addresses` | Add address |
| PUT | `/api/account/addresses/:id` | Update address |
| DELETE | `/api/account/addresses/:id` | Delete address |
| POST | `/api/account/addresses/:id/default` | Set default address |
| GET | `/api/account/payment-methods` | List payment methods |
| POST | `/api/account/payment-methods` | Add card (masked: last4, brand, exp) |
| DELETE | `/api/account/payment-methods/:id` | Remove card |
| GET | `/api/account/settings` | Get settings |
| PUT | `/api/account/settings` | Update settings (notifications) |
| GET | `/api/account/wishlist` | Get wishlist products |
| GET | `/api/account/cart` | Get cart items |
| GET | `/api/account/orders` | Get order history |

## Security

- **Auth**: `requireUser` middleware returns 401 if not logged in
- **Input validation**: All inputs trimmed and length-limited
- **Card data**: Only last 4 digits, brand, and expiry stored. Full card numbers are never stored.

## Setup Instructions

1. Ensure MySQL is configured in `.env`:
   ```
   USE_MYSQL=true
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=calvoro_db
   ```

2. Start the backend:
   ```bash
   cd backend && npm start
   ```

3. Tables `user_profiles`, `user_addresses`, `user_payment_methods`, `user_settings` are created automatically on first run.

4. Open the site, log in, and go to **My Account** (`account.html`).

## Account Sections

- **Profile**: Edit name, phone, address, city, profile picture URL
- **Addresses**: Add, edit, delete, set default shipping address
- **Payment Methods**: Add/remove masked cards (last 4 digits only)
- **Orders**: Order history
- **Wishlist**: Saved products (from backend wishlist table)
- **Cart**: Cart overview (server cart when logged in)
- **Settings**: Change password, notification toggles
- **Logout**: Signs out and redirects to home
