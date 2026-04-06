/**
 * Calvoro – Google Sign-In (Google Identity Services)
 * ---------------------------------------------------
 * Production-style auth for frontend-only flow. Uses GIS (accounts.google.com/gsi/client).
 * SECURITY: Client-side JWT decode is for UI only; backend MUST verify the token.
 */
(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // Storage keys (namespaced to avoid collisions; easy to clear on logout)
    // -------------------------------------------------------------------------
    var STORAGE_KEY_TOKEN = 'calvoro_google_id_token';
    var STORAGE_KEY_USER = 'calvoro_google_user';

    /**
     * Decode a JWT payload without verification (client-side only, for display).
     * SECURITY: Do not trust this for authorization. Backend must verify signature
     * and issuer using Google's public keys (e.g. JWKS).
     */
    function decodeJwtPayload(token) {
        if (!token || typeof token !== 'string') return null;
        try {
            var parts = token.split('.');
            if (parts.length !== 3) return null;
            var payload = parts[1];
            var base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
            var json = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map(function (c) {
                        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                    })
                    .join('')
            );
            return JSON.parse(json);
        } catch (e) {
            return null;
        }
    }

    /**
     * Persist session in localStorage. We store minimal data; token is for future
     * backend verification; user object is decoded payload for UI only.
     */
    function saveSession(idToken, decoded) {
        try {
            var user = {
                email: decoded.email || '',
                name: (decoded.name || decoded.email || 'User').trim(),
                picture: decoded.picture || '',
                sub: decoded.sub || ''
            };
            localStorage.setItem(STORAGE_KEY_TOKEN, idToken);
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
            return user;
        } catch (e) {
            clearSession();
            return null;
        }
    }

    function clearSession() {
        try {
            localStorage.removeItem(STORAGE_KEY_TOKEN);
            localStorage.removeItem(STORAGE_KEY_USER);
        } catch (e) {}
    }

    /**
     * Get current user from storage (does not validate token expiry; for UI only).
     */
    function getCurrentUser() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY_USER);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Check if we have a stored session (quick check for navbar).
     */
    function isLoggedIn() {
        return !!getCurrentUser();
    }

    // -------------------------------------------------------------------------
    // Navbar: render account slot (profile pill + dropdown or login link)
    // -------------------------------------------------------------------------
    function renderNavbarAuth() {
        var slot = document.getElementById('auth-navbar-slot');
        if (!slot) return;

        var user = getCurrentUser();
        var isLoginPage = /login\.html/i.test(window.location.pathname);

        if (user) {
            slot.innerHTML =
                '<div class="auth-user-wrap">' +
                '  <button type="button" class="auth-user-pill" id="auth-user-pill" aria-haspopup="true" aria-expanded="false" aria-label="Account menu">' +
                (user.picture
                    ? '<img class="auth-user-avatar" src="' + escapeHtml(user.picture) + '" alt="" width="28" height="28">'
                    : '<span class="auth-user-avatar-placeholder">' + (user.name.charAt(0) || '?').toUpperCase() + '</span>') +
                '    <span class="auth-user-name">' + escapeHtml(user.name) + '</span>' +
                '    <svg class="auth-user-chevron" width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2"/></svg>' +
                '  </button>' +
                '  <div class="auth-user-dropdown" id="auth-user-dropdown" role="menu" hidden>' +
                '    <a href="account.html" role="menuitem">My account</a>' +
                '    <button type="button" role="menuitem" id="auth-logout-btn">Log out</button>' +
                '  </div>' +
                '</div>';

            var pill = document.getElementById('auth-user-pill');
            var dropdown = document.getElementById('auth-user-dropdown');
            var logoutBtn = document.getElementById('auth-logout-btn');

            if (pill && dropdown) {
                pill.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var open = dropdown.getAttribute('hidden') === null;
                    dropdown.hidden = open;
                    pill.setAttribute('aria-expanded', !open);
                });
                document.addEventListener('click', function () {
                    dropdown.hidden = true;
                    if (pill) pill.setAttribute('aria-expanded', 'false');
                });
            }
            if (logoutBtn) {
                logoutBtn.addEventListener('click', function () {
                    handleLogout();
                });
            }
        } else {
            // Not logged in: show login/account button (or nothing on login page)
            if (isLoginPage) {
                slot.innerHTML = '<span class="auth-nav-placeholder"></span>';
            } else {
                slot.innerHTML =
                    '<a href="login.html" class="account-btn auth-login-link">' +
                    '<svg width="20" height="20"><circle cx="10" cy="7" r="3"/><path d="M3 18a7 7 0 0114 0"/></svg>' +
                    '<span>Sign in</span></a>';
            }
        }
    }

    function escapeHtml(s) {
        if (!s) return '';
        var div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    /**
     * Logout: call backend to clear server session, clear storage, refresh navbar. Optionally redirect to login.
     */
    function handleLogout(redirectToLogin) {
        var apiBase = window.CalvoroAPIBase || '';
        fetch(apiBase + '/api/users/logout', { method: 'POST', credentials: 'include' }).catch(function () {}).finally(function () {
            clearSession();
            renderNavbarAuth();
            if (redirectToLogin && !/login\.html/i.test(window.location.pathname)) {
                window.location.href = 'login.html';
            }
        });
    }

    // Expose for other scripts (e.g. cart, wishlist) and for logout from account page
    window.CalvoroAuth = {
        getCurrentUser: getCurrentUser,
        isLoggedIn: isLoggedIn,
        logout: function () {
            handleLogout(false);
        },
        logoutAndRedirect: function () {
            handleLogout(true);
        },
        renderNavbar: renderNavbarAuth,
        decodeJwtPayload: decodeJwtPayload
    };

    // -------------------------------------------------------------------------
    // Google Sign-In (GIS) – initialize and render button on login page
    // -------------------------------------------------------------------------
    function loadGoogleScript() {
        return new Promise(function (resolve, reject) {
            if (window.google && window.google.accounts) {
                resolve();
                return;
            }
            var script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.onload = function () {
                resolve();
            };
            script.onerror = function () {
                reject(new Error('Google Sign-In script failed to load'));
            };
            document.head.appendChild(script);
        });
    }

    function initLoginPage() {
        var container = document.getElementById('google-signin-container');
        var loadingEl = document.getElementById('auth-google-loading');
        var errorEl = document.getElementById('auth-google-error');
        var clientId = window.CalvoroGoogleClientId;

        if (!container) return;

        function showLoading(show) {
            if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
        }

        function showError(msg) {
            if (errorEl) {
                errorEl.textContent = msg || 'Something went wrong.';
                errorEl.style.display = msg ? 'block' : 'none';
            }
        }

        if (!clientId) {
            showError('Google Sign-In is not configured (missing Client ID).');
            return;
        }

        showLoading(true);
        showError('');

        loadGoogleScript()
            .then(function () {
                if (!window.google || !window.google.accounts || !window.google.accounts.id) {
                    showError('Google Sign-In is not available.');
                    showLoading(false);
                    return;
                }

                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: async function (response) {
                        showLoading(true);
                        showError('');
                        if (!response || !response.credential) {
                            showError('Sign-in was cancelled or failed.');
                            showLoading(false);
                            return;
                        }
                        var decoded = decodeJwtPayload(response.credential);
                        if (!decoded) {
                            showError('Invalid sign-in response.');
                            showLoading(false);
                            return;
                        }
                        var user = saveSession(response.credential, decoded);
                        if (!user) {
                            showError('Could not save session.');
                            showLoading(false);
                            return;
                        }
                        var apiBase = window.CalvoroAPIBase || '';
                        try {
                            var res = await fetch(apiBase + '/api/users/google-login', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id_token: response.credential })
                            });
                            var data = await res.json().catch(function () { return {}; });
                            if (res.ok) {
                                var redirect = getRedirectParam();
                                window.location.href = redirect || 'account.html';
                                return;
                            }
                            showError(data.error || 'Could not sign in with Google.');
                        } catch (e) {
                            showError('Connection error. Use the site via the server (e.g. http://localhost:3000) to enable full account features.');
                        }
                        showLoading(false);
                    },
                    auto_select: false,
                    cancel_on_tap_outside: true
                });

                // Render the Google button into the container
                try {
                    window.google.accounts.id.renderButton(container, {
                        type: 'standard',
                        theme: 'outline',
                        size: 'large',
                        text: 'continue_with',
                        shape: 'rectangular',
                        logo_alignment: 'left',
                        width: container.offsetWidth || 320
                    });
                } catch (e) {
                    showError('Could not render Google button.');
                }
                showLoading(false);
            })
            .catch(function (err) {
                showError(err && err.message ? err.message : 'Google Sign-In failed to load.');
                showLoading(false);
            });
    }

    function getRedirectParam() {
        try {
            var params = new URLSearchParams(window.location.search);
            var redirect = params.get('redirect');
            if (!redirect) return '';
            redirect = decodeURIComponent(redirect);
            if (/^https?:\/\//i.test(redirect)) return ''; // external not allowed
            if (redirect.indexOf('..') !== -1) return '';
            return redirect || '';
        } catch (e) {
            return '';
        }
    }

    // -------------------------------------------------------------------------
    // Run on DOM ready
    // -------------------------------------------------------------------------
    function init() {
        renderNavbarAuth();
        initLoginPage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
