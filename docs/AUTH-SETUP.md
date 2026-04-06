# Calvoro – Google Sign-In (Auth) Setup & Guide

This document explains the **Sign in with Google** implementation using **Google Identity Services (GIS)**, how to configure it, and how to move to a backend later. It also covers security, JWT decoding, and connecting cart/wishlist per user.

---

## 1. What Was Implemented

- **Google Sign-In** via [Google Identity Services](https://developers.google.com/identity/gsi/web) (the current recommended method).
- **Login page** (`login.html`) with email/password (backend) and a “Sign in with Google” button.
- **Auth module** in `js/auth.js`: session storage, JWT decode (for UI only), navbar profile pill, logout.
- **Config** in `js/auth-config.js`: Google Client ID (see below where to put it).
- **Styles** in `css/auth.css`: premium, minimal login and navbar auth UI (theme-aware).
- **Navbar integration**: any page that includes the auth scripts and has `#auth-navbar-slot` will show either “Sign in” or the logged-in user (avatar + name + dropdown with My account / Log out).
- **Backend Google login**: After Google sign-in, the frontend calls `POST /api/users/google-login` with the Google `id_token`. The backend verifies the token, finds or creates the user, and sets the same server session as email/password login. So **all account features** (orders, wishlist, profile, addresses, checkout as logged-in user) work the same whether you sign in with the form or with Google.

---

## 2. Where to Put the Google Client ID

- **Current setup**: The Client ID is in `js/auth-config.js`:
  ```js
  window.CalvoroGoogleClientId = '681900223997-vm81gpia68ed2chs750lith3a7mo0896.apps.googleusercontent.com';
  ```
- **Override before auth runs**: You can set it earlier so the file does not need to hold the real value:
  ```html
  <script>window.CalvoroGoogleClientId = 'YOUR_CLIENT_ID';</script>
  <script src="js/auth-config.js"></script>
  <script src="js/auth.js"></script>
  ```
- **Production**: Do **not** commit a production Client ID in a public repo. Prefer:
  - A build step that injects `window.CalvoroGoogleClientId` from an env variable (e.g. `.env.production`), or
  - A small server endpoint that returns config (including `clientId`) so the frontend fetches it at runtime.
- **Getting a Client ID**: [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth 2.0 Client ID → Web application. Add **Authorized JavaScript origins** (e.g. `http://localhost`, `https://yourdomain.com`) and **Authorized redirect URIs** if required.
- **Backend (for full account features)**: Set the same Client ID on the server so Google sign-in can create a server session. In the backend folder, add to `.env`: `GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com`. Without this, Google sign-in still works for the navbar and client-side state, but account/orders/wishlist/checkout will not recognize the user until they sign in via the form or you set `GOOGLE_CLIENT_ID`.

---

## 3. Folder Structure Recommendation

```
calvoro-final/
├── index.html
├── login.html
├── account.html
├── css/
│   ├── styles.css      # Global + theme
│   └── auth.css        # Auth-only (login + navbar auth)
├── js/
│   ├── config.js       # API base URL
│   ├── auth-config.js  # Google Client ID (or leave empty and set via env/override)
│   ├── auth.js         # Google Sign-In, session, navbar, logout
│   ├── main.js         # Cart, search, etc.
│   └── account.js      # Account page (supports both backend and Google user)
├── docs/
│   └── AUTH-SETUP.md   # This file
└── ...
```

Keep auth-related files in one place; `auth-config.js` is the only file that should hold (or be overridden for) the Client ID.

---

## 4. Step-by-Step: How It Works

1. **Login page**
   - User opens `login.html`.
   - Script loads Google GIS from `https://accounts.google.com/gsi/client`.
   - `auth.js` initializes GIS with your Client ID and renders the “Sign in with Google” button into `#google-signin-container`.
   - On success, Google returns a **credential** (JWT `id_token`). We decode the payload **client-side** (for display only), save it and the token in `localStorage`, then redirect (e.g. to `account.html` or `?redirect=...`).

2. **Navbar**
   - On every page that includes `auth-config.js` and `auth.js` and has `#auth-navbar-slot`:
     - If there is a stored Google user: the slot shows **avatar + name** and a dropdown with “My account” and “Log out”.
     - If not: the slot shows a **“Sign in”** link to `login.html`.

3. **Account page**
   - If `CalvoroAuth.getCurrentUser()` exists (Google session), the account layout is shown with name, email, and picture from that user, and “Logout” calls `CalvoroAuth.logoutAndRedirect()`.
   - Otherwise, the existing backend `/api/users/me` is used; logout calls your backend logout endpoint.

4. **Logout**
   - **Google-only**: `CalvoroAuth.logout()` clears `localStorage` and re-renders the navbar; `CalvoroAuth.logoutAndRedirect()` also redirects to `login.html`.
   - **Backend**: Your existing logout (e.g. POST `/api/users/logout`) is unchanged.

---

## 5. JWT Decoding (Client-Side)

- Google returns an **ID token** (JWT). We only **decode** it in the browser to show name, email, and picture.
- **Decoding** = base64url-decode the middle part (payload) and parse JSON. This is **not verification**.
- **Security**: Client-side decoding must **never** be used for authorization. A malicious user can change `localStorage` or the decoded payload. Any protected action or data must be validated on the **backend** by verifying the JWT signature (e.g. using Google’s JWKS) and checking `iss`, `aud`, and `exp`.

Code in `auth.js`:

```js
function decodeJwtPayload(token) {
  // Split JWT into [header, payload, signature]
  // Base64url-decode payload and parse JSON
  // Return payload (email, name, picture, sub, etc.)
}
```

Use this only for UI; backend should use a proper JWT library and Google’s public keys.

---

## 6. Security Warnings

- **Client ID** is public (it’s in the frontend). Don’t put secrets in it; it only identifies your app to Google.
- **ID token in localStorage**: Any script on the same origin can read it. Prefer short-lived tokens and, when you have a backend, send the token to the server once and use **httpOnly, secure cookies** for the session instead of storing the token in JS-accessible storage.
- **HTTPS in production**: Use HTTPS for your site and in Google Cloud “Authorized JavaScript origins”.
- **Token verification**: Frontend decoding is for display only. Backend must verify the JWT with Google’s keys and validate `aud` (your Client ID), `iss` (accounts.google.com), and `exp`.
- **Redirect param**: We only allow relative redirects (no `http://` / `https://` in `?redirect=`) to avoid open redirects.

---

## 7. How to Move to a Backend Later

1. **Send token to backend on login**
   - After Google Sign-In, instead of (or in addition to) storing in `localStorage`, `POST` the `id_token` to your backend, e.g. `POST /api/auth/google` with `{ "id_token": "..." }`.

2. **Backend verifies the token**
   - Use a library (e.g. Google Auth Library or a JWT library with JWKS) to verify signature, `aud`, `iss`, `exp`.
   - Create or find the user by `sub`/email and create a **server-side session** (e.g. cookie).

3. **Frontend**
   - Redirect to account or home. On subsequent requests, send cookies; don’t rely on the raw token in `localStorage` for sensitive operations.
   - You can keep showing name/picture from your **session/user API** (e.g. `/api/users/me`) so the navbar stays the same.

4. **Optional**: Remove or reduce what you store in `localStorage` (e.g. stop storing the full ID token) once the backend owns the session.

---

## 8. Connecting Cart & Wishlist Per User

- **Current (frontend-only)**: Cart/wishlist are often keyed by `localStorage` (e.g. `calvoro_cart`). With Google Sign-In we have a stable user id: `sub` from the decoded JWT (or from your backend later).

- **Per-user cart/wishlist options**:

  1. **Key by user in localStorage**  
     When the user logs in (Google or backend), switch to a key that includes the user id, e.g. `calvoro_cart_<sub>` and `calvoro_wishlist_<sub>`. On logout, switch back to a “guest” key or clear. Merge guest cart into user cart on login if you want.

  2. **Backend cart/wishlist**  
     When you have a backend:
     - After login, send the user id (or session) with every cart/wishlist request.
     - Backend stores cart/wishlist by user id.
     - Frontend still uses the same UI; only the API and storage are server-side.

- **Getting the user id in JS**  
  After Google Sign-In, the decoded payload is in the object we store (see `auth.js`). You can read `CalvoroAuth.getCurrentUser()` which has `sub` (Google’s user id). Example:

  ```js
  var user = window.CalvoroAuth && window.CalvoroAuth.getCurrentUser();
  var userId = user && user.sub;
  if (userId) {
    // e.g. use 'calvoro_cart_' + userId for this user's cart
  }
  ```

- **Backend**: When you add `POST /api/auth/google`, your `/api/cart` and `/api/wishlist` can use the authenticated user from the session and return/store per-user data; no need to pass user id from the frontend if the session is cookie-based.

---

## 9. Navbar Integration (Copy to Other Pages)

To get the same “Sign in” / profile pill on any page:

1. Include styles and scripts (in `<head>` or before `</body>` as needed):
   ```html
   <link rel="stylesheet" href="css/auth.css">
   ...
   <script src="js/auth-config.js"></script>
   <script src="js/auth.js"></script>
   ```

2. Replace the single account button with the auth slot:
   ```html
   <div id="auth-navbar-slot">
       <button class="account-btn">
           <svg width="20" height="20">...</svg>
       </button>
   </div>
   ```
   `auth.js` will replace the content of `#auth-navbar-slot` with either the “Sign in” link or the user pill + dropdown. The default button is only a fallback before the script runs.

---

## 10. Loading States & Error Handling

- **Login page**: “Loading Google Sign-In…” is shown while the GIS script loads. If the button fails to render or Sign-In fails, an error message appears in `#auth-google-error`.
- **Email/password**: The “LOG IN” button shows “Signing in…” and is disabled during the request; errors are shown in `#loginError`.
- **Navbar**: Renders synchronously from stored data; no loading state. If you later load user from an API, you can extend `auth.js` to show a placeholder until the request completes.

---

## 11. Files Reference

| File | Purpose |
|------|--------|
| `login.html` | Login page with email/password form and Google Sign-In container |
| `css/auth.css` | Auth-specific styles (login form, divider, Google container, navbar pill/dropdown) |
| `js/auth-config.js` | Sets `window.CalvoroGoogleClientId` (override or env in production) |
| `js/auth.js` | GIS init, JWT decode, session save/clear, navbar render, logout |
| `docs/AUTH-SETUP.md` | This guide |

Your existing `js/main.js` (cart, search, etc.) and `js/account.js` (account layout, backend/Google user, logout) already integrate with this auth flow where needed.
