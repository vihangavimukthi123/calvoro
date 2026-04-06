# User-Specific Cart, Wishlist & My Account

Enterprise e-commerce integration: each logged-in user sees only their own cart, wishlist, and orders.

## 1. Database Design

Tables are **auto-created on server startup** (no manual SQL needed). Reference schema:

```
users (id, email, password_hash, first_name, last_name, phone, address, city)
cart_items (id, user_id → users.id, product_id, quantity, color, size)
wishlist (id, user_id → users.id, product_id)
orders (id, user_id, total, status, ...)
```

Optional manual run:
```bash
mysql -u root -p calvoro_db < backend/database/user-data-schema.sql
```

## 2. User-Specific Logic

| Action | Guest | Logged In |
|--------|-------|-----------|
| Add to cart | localStorage | API → `cart_items` (user_id) |
| Add to wishlist | localStorage | API → `wishlist` (user_id) |
| View cart | localStorage | API → `cart_items` WHERE user_id = session |
| View wishlist | localStorage | API → `wishlist` WHERE user_id = session |
| My Account | Login prompt | Profile, addresses, cart, wishlist, orders |

## 3. Backend API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/cart` | Optional | User's cart (empty if guest) |
| GET | `/api/cart/my-cart` | Optional | Same as above |
| POST | `/api/cart/add` | Optional | Add item (persists if logged in) |
| PUT | `/api/cart/:id` | Required | Update quantity |
| DELETE | `/api/cart/:id` | Required | Remove item |
| GET | `/api/wishlist` | Optional | User's wishlist products |
| GET | `/api/wishlist/my-wishlist` | Optional | Same |
| POST | `/api/wishlist/add` | Required | Add product |
| DELETE | `/api/wishlist/:productId` | Required | Remove product |
| GET | `/api/account/my-data` | Required | Profile, addresses, cart, wishlist, orders |

## 4. Authentication

- **Session-based** (express-session)
- **Middleware**: `requireUser` for `/api/account/*`
- **Cart/Wishlist**: `req.session.user.id` attached to all writes

## 5. Frontend Behavior

- **Navbar**: Account icon tooltip shows "Logged in as [name]"
- **Cart badge**: Reflects server cart count when logged in
- **Add to cart**: POST to API when logged in; localStorage for guests
- **Wishlist heart**: Toggle via API when logged in
- **Cart page**: Loads from API when logged in
- **Wishlist page**: Loads from API when logged in
- **Logout**: Cart/wishlist clear from session; badge shows 0

## 6. Security

- User ID scoped on all cart/wishlist/orders queries
- Input validation: product_id, quantity, color, size
- No raw credit card data stored (payment methods use masked last4)

## 7. Setup

1. Ensure `.env` has `USE_MYSQL=true`
2. Start backend: `cd backend && npm start`
3. Tables created automatically
4. **Open the site via the backend**: `http://localhost:3000` (not Live Server)

**If using Live Server (e.g. port 5500):** `js/config.js` auto-detects and points API calls to `http://localhost:3000`. Ensure the backend is running on port 3000.
