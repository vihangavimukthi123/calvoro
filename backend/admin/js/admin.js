// Admin utilities

// Check authentication
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();

        if (!data.authenticated) {
            window.location.href = '/admin/index.html';
            return false;
        }

        // Update admin username display
        const adminUser = document.getElementById('adminUser');
        if (adminUser && data.admin) {
            adminUser.textContent = data.admin.username;
        }

        // Handle UI Permissions
        if (data.admin && data.admin.permissions) {
            const perms = data.admin.permissions;
            const isSuperAdmin = perms.includes('all');

            // 1. Hide unauthorized navigation links
            const nav = document.querySelector('.nav');
            if (nav && !isSuperAdmin) {
                const links = nav.querySelectorAll('a');
                links.forEach(link => {
                    const href = link.getAttribute('href');
                    if (!href || href === '#' || href.includes('logout')) return;
                    
                    let required = '';
                    if (href.includes('dashboard')) required = 'dashboard';
                    else if (href.includes('analytics')) required = 'reports';
                    else if (href.includes('products') || href.includes('trending') || href.includes('categories') || href.includes('vouchers') || href.includes('promotions') || href.includes('offers')) required = 'products';
                    else if (href.includes('orders')) required = 'orders';
                    else if (href.includes('users')) required = 'users';
                    else if (href.includes('emails')) required = 'reports';
                    else if (href.includes('settings')) required = 'settings';
                    else if (href.includes('chat')) required = 'chat';
                    
                    if (required && !perms.includes(required)) {
                        link.style.display = 'none';
                    }
                });
            }

            // 2. Check current page authorization
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage && !['', 'index.html', 'login.html', 'dashboard.html'].includes(currentPage)) {
                let required = '';
                if (currentPage.includes('analytics')) required = 'reports';
                else if (currentPage.includes('products') || currentPage.includes('trending') || currentPage.includes('categories') || currentPage.includes('vouchers') || currentPage.includes('promotions') || currentPage.includes('offers')) required = 'products';
                else if (currentPage.includes('orders')) required = 'orders';
                else if (currentPage.includes('users')) required = 'users';
                else if (currentPage.includes('emails')) required = 'reports';
                else if (currentPage.includes('settings')) required = 'settings';
                else if (currentPage.includes('chat')) required = 'chat';
                
                if (required && !isSuperAdmin && !perms.includes(required)) {
                    window.location.href = 'dashboard.html';
                }
            }
        }

        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        return false;
    }
}

// Logout
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            if (confirm('Are you sure you want to logout?')) {
                try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    window.location.href = '/admin/index.html';
                } catch (error) {
                    console.error('Logout failed:', error);
                }
            }
        });
    }
});

// Format currency
function formatCurrency(amount) {
    return 'LKR ' + amount.toLocaleString('en-LK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

console.log('Admin panel loaded');
