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
