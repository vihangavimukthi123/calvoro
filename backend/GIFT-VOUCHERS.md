# Gift Voucher System

This document describes the gift voucher / gift code system used at checkout and in the admin panel.

## How It Works

- **Vouchers** are created by admins (fixed amount or percentage off, optional min cart, expiry, usage limits).
- **Customers** enter a code at checkout; the code is validated against the current cart subtotal and user. If valid, a discount is applied and the order total is reduced.
- **Validation is server-side only.** The frontend calls `POST /api/vouchers/validate` with `{ code, subtotal }` to get the discount amount; the order is then submitted with `voucher_code`. The backend re-validates when creating the order and records the redemption.

### Flow

1. **Checkout page**  
   User enters a gift code and clicks Apply. Frontend calls `POST /api/vouchers/validate` with current cart subtotal. Response includes `valid`, `discount`, and `voucher` (or an error message).

2. **Order creation**  
   Frontend sends `voucher_code` in the order payload. Backend:
   - Validates the voucher again (cart subtotal, expiry, usage limits, per-user limits).
   - Computes discount and `total = subtotal + shipping - discount`.
   - Saves the order with `voucher_code` and `voucher_discount`.
   - Calls `recordRedemption(voucherId, orderId, userId, amountDiscount)` and increments voucher `used_count`.

3. **Security**  
   - Validate endpoint is rate-limited (e.g. 15 requests per minute per IP) to reduce brute-force.
   - Codes are generated with crypto random (e.g. `XXXX-XXXX-XXXX`).
   - Redemption is recorded only after a successful order; validation uses a row lock (`FOR UPDATE`) to avoid race conditions.

---

## Database

- **`gift_vouchers`**  
  `code`, `discount_type` (fixed_amount | percentage), `discount_value`, `min_cart_value`, `expiry_date`, `usage_limit`, `used_count`, `use_per_user_limit`, `is_active`, `created_by`, timestamps.

- **`voucher_redemptions`**  
  `voucher_id`, `order_id`, `user_id`, `amount_discount`, `redeemed_at`.

- **`orders`**  
  Optional columns: `voucher_code`, `voucher_discount` (for audit and display).

Schema and migrations are in `database/gift-vouchers-schema.sql` and applied via `ensureGiftVoucherTables()` in the MySQL database layer (and at server startup).

---

## How to Create Vouchers

### Admin UI

1. Log in to the admin panel and open **Vouchers**.
2. **Add Voucher**  
   - Optionally set a **Code** (e.g. `SAVE20`). Leave blank to auto-generate (e.g. `A1B2-C3D4-E5F6`).
   - **Discount type**: Fixed amount (LKR) or Percentage (%).
   - **Discount value**: Amount in LKR or percentage (e.g. 20 for 20%).
   - **Min cart value**: Minimum subtotal in LKR for the voucher to apply (0 = no minimum).
   - **Expiry date**: Optional; after this date the voucher is invalid.
   - **Usage limit**: Max total redemptions (empty = unlimited). Set to **1** for one-time-use vouchers; after one successful order the code will no longer validate.
   - **Uses per user**: Max redemptions per user (empty = unlimited).
   - **Active**: Uncheck to disable without deleting.
3. **Bulk Generate**  
   Set count (e.g. 10) and the same discount/min/expiry/limit options; each code is auto-generated and unique.

### Sharing codes with customers

Admin-created codes are **not** shown on the storefront; customers must receive the code from you and enter it at **checkout** in the "Gift Code or Promo Code" field. Practical ways to share:

- **Email:** After creating a voucher (or bulk codes), copy the code(s) and send by email (e.g. welcome offer, win-back, or gift).
- **SMS / WhatsApp:** Send the code and a short message (e.g. "Use code SAVE20 at checkout for 20% off").
- **Print / receipt:** Include a one-time code on order packing slips or thank-you cards.
- **Campaigns:** Use a memorable code (e.g. `WELCOME10`) in ads or social; document it in Admin so you can track usage.
- **Bulk codes:** Generate many codes (Bulk Generate), export or copy them, and distribute via a mailing tool or loyalty platform.

For a more automated flow (e.g. "email this code to the customer" from Admin), you would add an action in the admin vouchers UI that calls your email service with the code and recipient.

---

### API (admin only)

- `POST /api/vouchers`  
  Body: `code`, `discount_type`, `discount_value`, `min_cart_value`, `expiry_date`, `usage_limit`, `use_per_user_limit`, `is_active`.  
  If `code` is omitted, the server generates one.

- `POST /api/vouchers/bulk`  
  Body: `count`, plus same fields as above (no per-code `code`). Creates that many vouchers with random codes.

- `PUT /api/vouchers/:id`  
  Update existing voucher.

- `DELETE /api/vouchers/:id`  
  Delete voucher (redemption history remains in `voucher_redemptions` if you keep that table).

---

## Public API (Checkout)

- **`POST /api/vouchers/validate`**  
  Body: `{ "code": "...", "subtotal": 12345 }`.  
  Returns `{ "valid": true, "discount": 500, "message": "...", "voucher": { ... } }` or `{ "valid": false, "message": "..." }`.  
  Uses session for `user_id` when enforcing per-user limits. Rate-limited.

---

## Extending the System (Gift Card Wallet, etc.)

The current design is a single code applied at checkout with one redemption per order. To extend:

- **Gift card wallet / balance**  
  - Add a table such as `user_gift_balances` (e.g. `user_id`, `balance`, `currency`) and optionally `balance_transactions` (credit/debit, order_id, voucher_redemption_id).  
  - When a “gift card” type voucher is redeemed, instead of (or in addition to) discount on the order, credit the user’s balance.  
  - At checkout, add an option “Use gift card balance” and reduce the order total from balance, creating a debit transaction.

- **Partial redemption**  
  - Allow using only part of a voucher’s value (e.g. a LKR 5,000 card on a LKR 2,000 order).  
  - Store remaining value: e.g. extend `voucher_redemptions` with `amount_used` and `remaining_value`, or issue a new “balance” record for the user.

- **Multiple vouchers per order**  
  - Change validation to accept an array of codes and return a combined discount (respecting min cart and limits per code).  
  - Store multiple voucher references on the order (e.g. `order_vouchers` with `order_id`, `voucher_id`, `amount_discount`).

- **Refunds**  
  - On order refund, optionally decrement `used_count` and insert a “reversal” row in `voucher_redemptions` (negative amount or type=refund).  
  - If you have a wallet, credit the refunded discount back to the user’s balance.

- **Balance history**  
  - Use a `balance_transactions` (or similar) table with `user_id`, `amount`, `type` (credit/debit/refund), `order_id`, `voucher_id`, `created_at` for full audit and “balance history” UI.

Keeping validation and redemption in the backend with transactions and row locks will allow you to add these features without changing the core “validate once at apply, validate again at order create and record redemption” pattern.
