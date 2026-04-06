# Calvoro Backend & Admin Panel

Complete backend system with admin panel for managing the Calvoro e-commerce website.

## Features

✅ **RESTful API** - Full CRUD operations for products, categories, and orders
✅ **Admin Panel** - Beautiful dashboard to manage everything
✅ **Authentication** - Secure session-based admin login
✅ **Dual database support** - MySQL or JSON files (set `USE_MYSQL` in .env)
✅ **Image Uploads** - Multer integration for product images
✅ **Order Management** - Track and manage customer orders

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm

### Setup

1. Navigate to backend folder:
```bash
cd calvoro-final/backend
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Create `.env` file from example:
```bash
copy .env.example .env
```

4. **Database** (choose one):
   - **JSON (default)**: Leave `USE_MYSQL` unset or set to `false`. Data is stored in `data/*.json`.
   - **MySQL**: Set `USE_MYSQL=true` in `.env`, set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, then run:
     ```bash
     node setup-database.js
     ```
     This creates the database and tables. Ensure MySQL is running.

5. Start the server:
```bash
npm start
```

The server will start on `http://localhost:3000`

## Default Admin Credentials

- **Username**: `admin`
- **Password**: `admin123`

⚠️ **IMPORTANT**: Change these credentials in production!

## API Endpoints

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category (admin only)
- `PUT /api/categories/:id` - Update category (admin only)
- `DELETE /api/categories/:id` - Delete category (admin only)

### Orders
- `GET /api/orders` - Get all orders (admin only)
- `GET /api/orders/:id` - Get single order
- `POST /api/orders` - Create order
- `PUT /api/orders/:id/status` - Update order status (admin only)

### Payment (PayHere Gateway)
- `GET /api/payment/initiate/:orderId` - Initiate PayHere payment
- `POST /api/payment/notify` - PayHere webhook (internal)
- `GET /api/payment/return` - Payment success return URL
- `GET /api/payment/cancel` - Payment cancel return URL

### Authentication
- `POST /api/auth/login` - Admin login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/status` - Check auth status


## Admin Panel

Access the admin panel at: `http://localhost:3000/admin`

### Pages
- **Dashboard** - Overview stats and recent orders
- **Products** - Manage all products
- **Categories** - Manage product categories
- **Orders** - View and manage orders

## Database

**Mode** is controlled by `USE_MYSQL` in `.env`:
- **`USE_MYSQL=false` or unset**: JSON files in `data/` (products.json, orders.json, users.json, etc.). No setup needed.
- **`USE_MYSQL=true`**: MySQL. Run `node setup-database.js` once (with MySQL running and `.env` DB_* set). Tables:
  - `categories` – Product categories
  - `products` – Products (name, price, colors, sizes, stock, etc.)
  - `users` – Storefront customer accounts
  - `admin_users` – Admin login
  - `orders` – Orders
  - `order_items` – Order line items

## Frontend Integration

The frontend is automatically served from the parent directory. The API is available at `/api/*` endpoints.

To integrate with frontend:
1. Update product pages to fetch from `/api/products`
2. Use `/api/orders` to submit orders
3. Load categories from `/api/categories`

## Development

Run with auto-restart on changes:
```bash
npm run dev
```

## Production Notes

1. Change SESSION_SECRET in .env
2. Use HTTPS in production
3. Change default admin password
4. Consider using PostgreSQL or MySQL for production
5. Add rate limiting and security headers
6. **PayHere Payment Gateway**:
   - Sign up at https://www.payhere.lk/merchant/
   - Get your live MERCHANT_ID and MERCHANT_SECRET
   - Update .env with live credentials
   - Set PAYHERE_MODE=live
   - Update BASE_URL to your production domain
   - Ensure /api/payment/notify is accessible publicly
   - Test with PayHere sandbox before going live


## Troubleshooting

### Server won't start
- Check if port 3000 is already in use
- Make sure Node.js is installed
- Run `npm install` to ensure all dependencies are installed

### Can't login
- Default credentials: admin / admin123
- Check browser console for errors
- Ensure server is running

### Database errors
- **JSON mode**: Delete or fix files in `data/` (products.json, orders.json, users.json, etc.) and restart.
- **MySQL mode**: Ensure MySQL is running, `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` in `.env` are correct, and run `node setup-database.js` to create/update tables.

## Support

For issues or questions, check the console logs for error messages.
