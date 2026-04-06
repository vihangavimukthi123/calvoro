const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const FILE = path.join(__dirname, '..', 'data', 'newsletter_subscribers.json');

function ensureFile() {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]', 'utf8');
}

function getEmails() {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveEmails(emails) {
    ensureFile();
    fs.writeFileSync(FILE, JSON.stringify(emails, null, 2), 'utf8');
}

router.post('/subscribe', (req, res) => {
    const email = (req.body && req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Valid email required' });
    }
    const list = getEmails();
    if (list.includes(email)) {
        return res.status(200).json({ subscribed: true, message: 'Already subscribed' });
    }
    list.push(email);
    saveEmails(list);
    res.status(201).json({ subscribed: true, message: 'Subscribed successfully' });
});

module.exports = router;
