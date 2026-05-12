// Admin utilities

// Check authentication
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/status', { credentials: 'include' });
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

        // ✅ FIXED: Permission checks removed - all logged-in admins get full access
        // (Menu items hide කරන logic එක remove කළා)

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
                    await fetch('/api/auth/logout', { 
                        method: 'POST',
                        credentials: 'include'
                    });
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

// Get image URL with proper normalization
function getImgUrl(url) {
    if (!url) return '';
    // Handle new variant object structure
    if (typeof url === 'object' && !Array.isArray(url)) {
        url = url.main || (url.subs && url.subs[0]) || '';
    }
    if (!url || typeof url !== 'string') return '';
    
    // Normalize path
    const normalized = url.trim().replace(/\\/g, '/');
    const cleanUrl = normalized.startsWith('/') ? normalized : '/' + normalized;
    const base = (window.CalvoroAPIBase !== undefined && window.CalvoroAPIBase) ? window.CalvoroAPIBase : '';
    return base.replace(/\/$/, '') + cleanUrl;
}

console.log('Admin panel loaded');
