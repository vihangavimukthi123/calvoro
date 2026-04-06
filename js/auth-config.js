/**
 * Google Sign-In configuration (Calvoro Auth)
 * -------------------------------------------
 * WHERE TO PUT THE GOOGLE CLIENT ID:
 * - For production: Do NOT commit this file with a real client ID to public repos.
 *   Use a build step to inject window.CalvoroGoogleClientId from env (e.g. .env.production)
 *   or serve it from a server-side config endpoint.
 * - For development: You can keep it here or override before loading auth.js:
 *   <script>window.CalvoroGoogleClientId = 'YOUR_CLIENT_ID';</script>
 * - Get your Client ID: Google Cloud Console → APIs & Services → Credentials →
 *   Create OAuth 2.0 Client ID (Web application). Add authorized JavaScript origins
 *   (e.g. http://localhost, https://yourdomain.com).
 */
(function () {
    'use strict';
    if (typeof window.CalvoroGoogleClientId !== 'undefined') return;
    // Development / single-origin client ID (replace in production with env-based value)
    window.CalvoroGoogleClientId = '681900223997-vm81gpia68ed2chs750lith3a7mo0896.apps.googleusercontent.com';
})();
