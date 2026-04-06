/**
 * Simple sliding-window rate limiter for admin JSON APIs (no extra deps).
 */

function createRateLimiter({ windowMs = 60_000, max = 120, keyFn = (req) => req.ip || req.connection?.remoteAddress || 'local' }) {
    const buckets = new Map();

    return function rateLimitMiddleware(req, res, next) {
        const key = keyFn(req);
        const now = Date.now();
        let b = buckets.get(key);
        if (!b || now - b.start > windowMs) {
            b = { start: now, count: 0 };
            buckets.set(key, b);
        }
        b.count += 1;
        if (b.count > max) {
            res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
            return res.status(429).json({ error: 'Too many requests. Try again shortly.' });
        }
        next();
    };
}

module.exports = { createRateLimiter };
