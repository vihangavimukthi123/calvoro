/**
 * Middleware to check if the logged-in admin has required permission.
 * @param {string} permission - The permission key to check (e.g., 'orders', 'products', 'users').
 */
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.session || !req.session.admin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const permissions = req.session.admin.permissions || [];

        // 'all' is a special permission that grants access to everything
        if (permissions.includes('all')) {
            return next();
        }

        if (permissions.includes(permission)) {
            return next();
        }

        res.status(403).json({ error: 'Access denied: Insufficient permissions' });
    };
}

module.exports = requirePermission;
