/**
 * Middleware to check if the logged-in admin has required permission.
 * UPDATED: All logged-in admins get full access (bypass permission check)
 * 
 * @param {string} permission - The permission key (not used now, but kept for compatibility)
 */
function requirePermission(permission) {
    return (req, res, next) => {
        // Admin logged in නැත්නම් 401 Unauthorized
        if (!req.session || !req.session.admin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // ✅ BYPASS: Admin logged in නම් full access දෙනවා
        // 403 errors නැති වෙනවා
        return next();
    };
}

module.exports = requirePermission;
