const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

/**
 * Send a manual email (Admin only)
 */
router.post('/send', requireAdmin, async (req, res) => {
    const { to, subject, body, html } = req.body;
    if (!to || !subject || (!body && !html)) {
        return res.status(400).json({ error: 'To, subject, and body are required' });
    }
    try {
        await emailService.queueEmail({ to, subject, body, html });
        res.json({ success: true, message: 'Email queued successfully' });
    } catch (error) {
        console.error('Failed to queue email:', error);
        res.status(500).json({ error: 'Failed to queue email' });
    }
});

/**
 * Send a marketing campaign (Admin only)
 */
router.post('/campaign', requireAdmin, async (req, res) => {
    const { subject, title, body, heroImage, ctaText, ctaUrl, target } = req.body;

    try {
        let users = [];
        if (target === 'all') {
            users = await db.getAllUsers();
        } else if (target === 'newsletter') {
            const subscribers = await db.getNewsletterSubscribers();
            users = subscribers.map(s => ({ email: s.email, first_name: 'Subscriber' }));
        }
        if (!users.length) {
            return res.status(400).json({ error: 'No recipients found for the selected target' });
        }
        for (const user of users) {
            await emailService.queueEmail({
                type: 'marketing',
                to: user.email,
                subject,
                templateName: 'marketing',
                data: {
                    subject, title, body, heroImage, ctaText, ctaUrl,
                    username: user.first_name || 'there'
                }
            });
        }
        res.json({ success: true, message: `Campaign queued for ${users.length} recipients` });
    } catch (error) {
        console.error('Failed to queue campaign:', error);
        res.status(500).json({ error: 'Failed to queue campaign' });
    }
});

/**
 * Email Stats (Admin only)
 */
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        let counts = { completed: 0, failed: 0, delayed: 0, active: 0, waiting: 0 };

        try {
            const emailQueue = require('../lib/emailQueue');
            if (emailQueue && typeof emailQueue.getJobCounts === 'function') {
                counts = await emailQueue.getJobCounts('completed', 'failed', 'delayed', 'active', 'waiting');
            }
        } catch (queueErr) {
            // Queue not available (no Redis) — return zeros, don't crash
            console.warn('Email queue not available:', queueErr.message);
        }

        res.json({
            success: true,
            queueStats: counts,
            totalSent: counts.completed || 0,
            totalFailed: counts.failed || 0
        });
    } catch (error) {
        console.error('Failed to fetch email stats:', error);
        res.status(500).json({ error: 'Failed to fetch email stats' });
    }
});

/**
 * Quick Test Route for Resend Integration
 */
router.get('/test-resend', async (req, res) => {
    try {
        const result = await emailService.sendEmail({
            to: 'vihangavimukthi2001@gmail.com',
            subject: 'Hello World',
            html: '<p>Congrats on sending your <strong>first email</strong>!</p>'
        });

        if (result.success) {
            res.json({ success: true, message: 'Test email sent successfully!', data: result.data });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
