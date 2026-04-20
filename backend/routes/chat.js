const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Admin: Get all chat sessions
router.get('/sessions', requireAdmin, async (req, res) => {
    try {
        const sessions = await db.getChatSessions();
        res.json(sessions);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// Admin: Get chat history for a session
router.get('/sessions/:sessionId/messages', requireAdmin, async (req, res) => {
    try {
        const messages = await db.getChatMessages(req.params.sessionId);
        res.json(messages);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

module.exports = router;
