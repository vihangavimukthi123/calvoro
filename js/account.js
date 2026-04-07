(function() {
    'use strict';

    // නිවැරදි කළ ප්‍රධාන API ලිපිනය
    var api = '/api/account';
    var apiBase = ''; // දැන් අන්තර්ජාලයේ නිසා කෙළින්ම slash එකෙන් පටන් ගනී
    var noImg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"%3E%3Crect fill="%23ddd" width="400" height="400"/%3E%3Ctext x="200" y="200" fill="%23999" font-size="14" text-anchor="middle" dy=".3em"%3ENo image%3C/text%3E%3C/svg%3E';

    function fetchJson(url, opts) {
        return fetch(url, Object.assign({ credentials: 'include' }, opts || {})).then(function(r) {
            if (r.status === 401) {
                if (window.CalvoroAuth) {
                    try { window.CalvoroAuth.logout(); } catch(e) {}
                }
                window.location.href = 'login.html';
                throw new Error('Unauthorized');
            }
            if (!r.ok) throw new Error(r.statusText || 'Request failed');
            return r.json();
        });
    }

    function showSection(name) {
        document.querySelectorAll('.account-section').forEach(function(el) { el.classList.remove('active'); });
        document.querySelectorAll('.account-sidebar a[data-section]').forEach(function(a) {
            a.classList.toggle('active', a.dataset.section === name);
        });
        var section = document.getElementById('section-' + name);
        if (section) section.classList.add('active');
    }

    function closeModal(id) { document.getElementById(id).classList.remove('show'); }
    function openModal(id) { document.getElementById(id).classList.add('show'); }

    // ---- Profile ----
    function loadProfile() {
        fetchJson(api + '/profile').then(function(p) {
            var name = [p.first_name, p.last_name].filter(Boolean).join(' ') || '—';
            document.getElementById('profileName').textContent = name;
            document.getElementById('profileEmail').textContent = p.email || '—';
            document.getElementById('profilePhone').textContent = p.phone || '—';
            var pic = p.profile_picture_url || '';
            var img = document.getElementById('profilePic');
            img.src = pic || noImg;
            img.alt = name;
        }).catch(function() {
            document.getElementById('profileName').textContent = '—';
            document.getElementById('profileEmail').textContent = '—';
            document.getElementById('profilePhone').textContent = '—';
        });
    }

    function saveProfile() {
        var data = {
            first_name: document.getElementById('editFirstName').value.trim(),
            last_name: document.getElementById('editLastName').value.trim(),
            phone: document.getElementById('editPhone').value.trim(),
            address: document.getElementById('editAddress').value.trim(),
            city: document.getElementById('editCity').value.trim(),
            profile_picture_url: document.getElementById('editProfilePic').value.trim() || undefined
        };
        fetchJson(api + '/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(function() {
            closeModal('modalProfile');
            loadProfile();
        }).catch(function(e) {
            alert('Failed to update: ' + (e.message || 'Unknown error'));
        });
    }

    function openEditProfile() {
        fetchJson(api + '/profile').then(function(p) {
            document.getElementById('editFirstName').value = p.first_name || '';
            document.getElementById('editLastName').value = p.last_name || '';
            document.getElementById('editEmail').value = p.email || '';
            document.getElementById('editPhone').value = p.phone || '';
            document.getElementById('editAddress').value = p.address || '';
            document.getElementById('editCity').value = p.city || '';
            document.getElementById('editProfilePic').value = p.profile_picture_url || '';
            openModal('modalProfile');
        });
    }

    // ---- Addresses ----
    function loadAddresses() {
        fetchJson(api + '/addresses').then(function(list) {
            var html = '';
            list.forEach(function(a) {
                var def = a.is_default ? '<span class="badge-default">DEFAULT</span>' : '';
                html += '<div class="address-card' + (a.is_default ? ' default' : '') + '">' + def +
                    '<p><strong>' + escapeHtml(a.full_name) + '</strong>' + (a.phone ? ' ' + escapeHtml(a.phone) : '') + '</p>' +
                    '<p>' + escapeHtml(a.address_line1) + (a.address_line2 ? ', ' + escapeHtml(a.address_line2) : '') + '</p>' +
                    '<p>' + escapeHtml(a.city) + (a.postal_code ? ' ' + escapeHtml(a.postal_code) : '') + '</p>' +
                    '<div class="actions">' +
                    '<button type="button" class="btn-account secondary" data-edit="' + a.id + '">Edit</button>' +
                    (!a.is_default ? '<button type="button" class="btn-account secondary" data-set-default="' + a.id + '">Set Default</button>' : '') +
                    '<button type="button" class="btn-account danger" data-delete="' + a.id + '">Delete</button>' +
                    '</div></div>';
            });
            document.getElementById('addressesList').innerHTML = html || '<p class="loading">No addresses yet.</p>';
            document.getElementById('addressesList').querySelectorAll('[data-edit]').forEach(function(btn) {
                btn.addEventListener('click', function() { openEditAddress(parseInt(btn.dataset.edit, 10)); });
            });
            document.getElementById('addressesList').querySelectorAll('[data-set-default]').forEach(function(btn) {
                btn.addEventListener('click', function() { setDefaultAddress(parseInt(btn.dataset.setDefault, 10)); });
            });
            document.getElementById('addressesList').querySelectorAll('[data-delete]').forEach(function(btn) {
                btn.addEventListener('click', function() { deleteAddress(parseInt(btn.dataset.delete, 10)); });
            });
        }).catch(function() {
            document.getElementById('addressesList').innerHTML = '<p class="loading">Could not load addresses.</p>';
        });
    }

    function openAddAddress() {
        document.getElementById('modalAddressTitle').textContent = 'Add Address';
        document.getElementById('editAddressId').value = '';
        document.getElementById('addrLabel').value = '';
        document.getElementById('addrFullName').value = '';
        document.getElementById('addrPhone').value = '';
        document.getElementById('addrLine1').value = '';
        document.getElementById('addrLine2').value = '';
        document.getElementById('addrCity').value = '';
        document.getElementById('addrPostal').value = '';
        document.getElementById('addrDefault').checked = false;
        openModal('modalAddress');
    }

    function openEditAddress(id) {
        fetchJson(api + '/addresses').then(function(list) {
            var a = list.find(function(x) { return x.id === id; });
            if (!a) return;
            document.getElementById('modalAddressTitle').textContent = 'Edit Address';
            document.getElementById('editAddressId').value = a.id;
            document.getElementById('addrLabel').value = a.label || '';
            document.getElementById('addrFullName').value = a.full_name || '';
            document.getElementById('addrPhone').value = a.phone || '';
            document.getElementById('addrLine1').value = a.address_line1 || '';
            document.getElementById('addrLine2').value = a.address_line2 || '';
            document.getElementById('addrCity').value = a.city || '';
            document.getElementById('addrPostal').value = a.postal_code || '';
            document.getElementById('addrDefault').checked = !!a.is_default;
            openModal('modalAddress');
        });
    }

    function saveAddress() {
        var id = document.getElementById('editAddressId').value;
        var data = {
            label: document.getElementById('addrLabel').value.trim(),
            full_name: document.getElementById('addrFullName').value.trim(),
            phone: document.getElementById('addrPhone').value.trim(),
            address_line1: document.getElementById('addrLine1').value.trim(),
            address_line2: document.getElementById('addrLine2').value.trim(),
            city: document.getElementById('addrCity').value.trim(),
            postal_code: document.getElementById('addrPostal').value.trim(),
            is_default: document.getElementById('addrDefault').checked
        };
        if (!data.full_name || !data.address_line1 || !data.city) {
            alert('Please fill in Full Name, Address Line 1, and City.');
            return;
        }
        var url = api + '/addresses' + (id ? '/' + id : '');
        var method = id ? 'PUT' : 'POST';
        fetchJson(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(function() {
            closeModal('modalAddress');
            loadAddresses();
        }).catch(function(e) {
            alert('Failed: ' + (e.message || 'Unknown error'));
        });
    }

    function setDefaultAddress(id) {
        fetchJson(api + '/addresses/' + id + '/default', { method: 'POST' }).then(function() {
            loadAddresses();
        });
    }

    function deleteAddress(id) {
        if (!confirm('Delete this address?')) return;
        fetchJson(api + '/addresses/' + id, { method: 'DELETE' }).then(function() {
            loadAddresses();
        });
    }

    // ---- Payment Methods ----
    function loadPayments() {
        fetchJson(api + '/payment-methods').then(function(list) {
            var html = '';
            list.forEach(function(pm) {
                var mask = '•••• •••• •••• ' + pm.last_four;
                html += '<div class="payment-card">' +
                    '<div><span class="mask">' + escapeHtml(pm.card_brand || 'Card') + ' ' + mask + '</span>' +
                    (pm.is_default ? ' <span class="badge-default">DEFAULT</span>' : '') + '</div>' +
                    '<button type="button" class="btn-account danger" data-delete="' + pm.id + '">Remove</button></div>';
            });
            document.getElementById('paymentsList').innerHTML = html || '<p class="loading">No payment methods.</p>';
            document.getElementById('paymentsList').querySelectorAll('[data-delete]').forEach(function(btn) {
                btn.addEventListener('click', function() { deletePayment(parseInt(btn.dataset.delete, 10)); });
            });
        }).catch(function() {
            document.getElementById('paymentsList').innerHTML = '<p class="loading">Could not load payment methods.</p>';
        });
    }

    function savePayment() {
        var last4 = document.getElementById('cardLast4').value.replace(/\D/g, '');
        if (last4.length !== 4) {
            alert('Please enter a valid 4-digit last card number.');
            return;
        }
        var data = {
            card_brand: document.getElementById('cardBrand').value || 'Card',
            last_four: last4,
            exp_month: parseInt(document.getElementById('cardExpMonth').value, 10) || null,
            exp_year: parseInt(document.getElementById('cardExpYear').value, 10) || null,
            is_default: document.getElementById('cardDefault').checked
        };
        fetchJson(api + '/payment-methods', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(function() {
            closeModal('modalPayment');
            document.getElementById('cardLast4').value = '';
            document.getElementById('cardExpMonth').value = '';
            document.getElementById('cardExpYear').value = '';
            loadPayments();
        }).catch(function(e) {
            alert('Failed: ' + (e.message || 'Unknown error'));
        });
    }

    function deletePayment(id) {
        if (!confirm('Remove this card?')) return;
        fetchJson(api + '/payment-methods/' + id, { method: 'DELETE' }).then(function() {
            loadPayments();
        });
    }

    // ---- Orders ----
    function loadOrders() {
        fetchJson('/api/orders').then(function(orders) {
            var html = '';
            orders.sort(function(a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
            if (orders.length === 0) {
                html = '<p class="order-empty" style="color:var(--color-text-muted);">You haven\'t placed any orders yet.</p>';
            } else {
                orders.forEach(function(o) {
                    var dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
                    html += '<div class="order-row">' +
                        '<div><span class="order-num">' + escapeHtml(o.order_number || 'Order #' + o.id) + '</span><br><span class="order-date">' + dateStr + '</span></div>' +
                        '<div><span class="order-total">LKR ' + Number(o.total || 0).toLocaleString() + '</span><br><span class="order-status ' + (o.status || 'pending') + '">' + escapeHtml(o.status || 'pending') + '</span></div></div>';
                });
            }
            document.getElementById('ordersList').innerHTML = html;
        }).catch(function() {
            document.getElementById('ordersList').innerHTML = '<p class="loading">Could not load orders.</p>';
        });
    }

    // ---- Wishlist ----
    function loadWishlist() {
        fetchJson('/api/wishlist').then(function(products) {
            var html = '';
            if (products.length === 0) {
                html = '<p style="color:var(--color-text-muted);">Your wishlist is empty. <a href="index.html">Continue shopping</a></p>';
            } else {
                products.forEach(function(p) {
                    var img = (p.images && p.images[0]) ? p.images[0] : noImg;
                    var price = p.sale_price != null ? p.sale_price : p.price;
                    html += '<a href="products/product.html?slug=' + encodeURIComponent(p.slug || '') + '" class="wishlist-item">' +
                        '<div class="img-wrap"><img src="' + escapeAttr(img) + '" alt=""></div>' +
                        '<div class="name">' + escapeHtml(p.name || '') + '</div>' +
                        '<div class="price">LKR ' + Number(price).toLocaleString() + '</div></a>';
                });
            }
            document.getElementById('wishlistList').innerHTML = html;
        }).catch(function() {
            document.getElementById('wishlistList').innerHTML = '<p class="loading">Could not load wishlist.</p>';
        });
    }

    // ---- Cart ----
    function loadCart() {
        fetchJson('/api/cart').then(function(data) {
            var html = '';
            if (!data.items || data.items.length === 0) {
                html = '<p class="empty">Your cart is empty. <a href="index.html">Continue shopping</a></p>';
            } else {
                data.items.forEach(function(item) {
                    var img = (item.image || item.images && item.images[0]) ? (item.image || item.images[0]) : noImg;
                    var price = item.is_on_sale && item.sale_price != null ? item.sale_price : (item.base_price || item.price || 0);
                    html += '<div class="item">' +
                        '<img src="' + escapeAttr(img) + '" alt="">' +
                        '<div class="info"><strong>' + escapeHtml(item.name || '') + '</strong><br>Qty: ' + (item.quantity || 1) + ' × LKR ' + Number(price).toLocaleString() + '</div></div>';
                });
            }
            document.getElementById('cartList').innerHTML = html;
        }).catch(function() {
            document.getElementById('cartList').innerHTML = '<p class="empty">Could not load cart.</p>';
        });
    }

    // ---- Settings ----
    function loadSettings() {
        fetchJson(api + '/settings').then(function(s) {
            setToggle('toggleEmail', !!s.notifications_email);
            setToggle('toggleSms', !!s.notifications_sms);
            setToggle('toggleMarketing', !!s.marketing_emails);
        });
    }

    function setToggle(id, on) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('on', on);
        el.dataset.value = on ? '1' : '0';
    }

    function toggleSetting(el) {
        var on = el.classList.toggle('on');
        var key = el.dataset.setting;
        fetchJson(api + '/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: on })
        }).catch(function() {
            el.classList.toggle('on', !on);
        });
    }

    function changePassword() {
        var current = document.getElementById('currentPassword').value;
        var newPass = document.getElementById('newPassword').value;
        if (!current || !newPass) {
            alert('Please enter both current and new password.');
            return;
        }
        if (newPass.length < 6) {
            alert('New password must be at least 6 characters.');
            return;
        }
        fetchJson(api + '/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_password: current, new_password: newPass })
        }).then(function() {
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            alert('Password updated.');
        }).catch(function(e) {
            fetch(api + '/password', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_password: current, new_password: newPass })
            }).then(function(r) { return r.json().catch(function() { return {}; }); }).then(function(j) {
                alert(j.error || e.message || 'Failed to update password.');
            }).catch(function() { alert('Failed to update password.'); });
        });
    }

    function escapeHtml(s) {
        if (s == null) return '';
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function escapeAttr(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function loadSection(section) {
        if (section === 'profile') loadProfile();
        else if (section === 'addresses') loadAddresses();
        else if (section === 'payments') loadPayments();
        else if (section === 'orders') loadOrders();
        else if (section === 'wishlist') loadWishlist();
        else if (section === 'cart') loadCart();
        else if (section === 'settings') { loadSettings(); loadProfile(); }
    }

    // ---- Init ----
    function showAccountWithGoogleUser(googleUser) {
        document.getElementById('accountLayout').style.display = 'flex';
        document.getElementById('profileName').textContent = googleUser.name || '—';
        document.getElementById('profileEmail').textContent = googleUser.email || '—';
        document.getElementById('profilePhone').textContent = '—';
        var img = document.getElementById('profilePic');
        img.src = googleUser.picture || noImg;
        img.alt = googleUser.name || 'Profile';
        loadAddresses();
        loadPayments();
        loadOrders();
        loadWishlist();
        loadCart();
        loadSettings();
    }

    (async function init() {
        var googleUser = window.CalvoroAuth && window.CalvoroAuth.getCurrentUser();
        if (googleUser) {
            document.getElementById('accountLayout').style.display = 'flex';
            showAccountWithGoogleUser(googleUser);
            document.getElementById('logoutBtn').addEventListener('click', function(e) {
                e.preventDefault();
                if (window.CalvoroAuth) window.CalvoroAuth.logoutAndRedirect();
            });
            bindAccountEvents();
            return;
        }

        var userRes = await fetch('/api/users/me', { credentials: 'include' });
        var data = await userRes.json().catch(function() { return {}; });
        if (!data.user) {
            document.getElementById('loginPrompt').style.display = 'block';
            return;
        }
        document.getElementById('accountLayout').style.display = 'flex';
        loadProfile();

        document.getElementById('logoutBtn').addEventListener('click', function(e) {
            e.preventDefault();
            fetch('/api/users/logout', { method: 'POST', credentials: 'include' }).then(function() {
                window.location.href = 'login.html';
            });
        });

        bindAccountEvents();
    })();

    function bindAccountEvents() {
        document.querySelectorAll('.account-sidebar a[data-section]').forEach(function(a) {
            a.addEventListener('click', function(e) {
                e.preventDefault();
                var section = a.dataset.section;
                showSection(section);
                loadSection(section);
            });
        });

        document.getElementById('editProfileBtn').addEventListener('click', openEditProfile);
        document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
        document.getElementById('addAddressBtn').addEventListener('click', openAddAddress);
        document.getElementById('saveAddressBtn').addEventListener('click', saveAddress);
        document.getElementById('addPaymentBtn').addEventListener('click', function() {
            document.getElementById('cardLast4').value = '';
            document.getElementById('cardExpMonth').value = '';
            document.getElementById('cardExpYear').value = '';
            openModal('modalPayment');
        });
        document.getElementById('savePaymentBtn').addEventListener('click', savePayment);
        document.getElementById('changePasswordBtn').addEventListener('click', changePassword);

        ['toggleEmail', 'toggleSms', 'toggleMarketing'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('click', function() { toggleSetting(el); });
        });

        document.getElementById('modalProfile').addEventListener('click', function(e) {
            if (e.target === this) closeModal('modalProfile');
        });
        document.getElementById('modalAddress').addEventListener('click', function(e) {
            if (e.target === this) closeModal('modalAddress');
        });
        document.getElementById('modalPayment').addEventListener('click', function(e) {
            if (e.target === this) closeModal('modalPayment');
        });

        window.closeModal = closeModal;
    }
})();
