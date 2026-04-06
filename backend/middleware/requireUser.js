/**
 * Middleware: require authenticated user (storefront customer)
 * Redirects to login or returns 401 for API
 */
function requireUser(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Please log in to access this resource' });
    }
}

module.exports = { requireUser };
