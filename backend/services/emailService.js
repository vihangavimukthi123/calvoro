const nodemailer = require('nodemailer');
const path = require('path');
const ejs = require('ejs');
const fs = require('fs').promises;
const dns = require('dns');

const DEFAULT_FROM = process.env.MAIL_FROM || 'Calvoro <noreply@calvoro.com>';

class EmailService {
    getTransporter() {
        const host = process.env.SMTP_HOST;
        const port = parseInt(process.env.SMTP_PORT || '587', 10);
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;
        const secure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1';

        if (!host || !user || !pass) {
            console.warn('[EmailService] SMTP configuration missing (host/user/pass).');
            return null;
        }

        console.log(`[EmailService] Attempting connection to ${host}:${port} (secure: ${secure}, family: 4)`);

        return nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
            family: 4, 
            lookup: (hostname, options, callback) => {
                dns.lookup(hostname, { family: 4 }, callback);
            },
            requireTLS: port === 587, // Force STARTTLS on 587
            connectionTimeout: 20000, 
            greetingTimeout: 10000,
            socketTimeout: 30000,
            logger: true,
            debug: true,
            tls: {
                rejectUnauthorized: false,
                minVersion: 'TLSv1.2'
            }
        });
    }

    /**
     * Send a raw email.
     */
    async sendEmail({ to, subject, html, text }) {
        // PRIORITY 1: Resend API (Bypasses blocked SMTP ports)
        if (process.env.RESEND_API_KEY) {
            console.log(`[EmailService] Using Resend API for ${to}`);
            try {
                const response = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
                    },
                    body: JSON.stringify({
                        from: process.env.MAIL_FROM || 'onboarding@resend.dev',
                        to: Array.isArray(to) ? to : [to],
                        subject: subject,
                        html: html
                    })
                });
                const data = await response.json();
                if (response.ok) {
                    console.log(`[EmailService] Resend Success: ${data.id}`);
                    return { success: true, data };
                } else {
                    console.error('[EmailService] Resend Error:', data);
                }
            } catch (err) {
                console.error('[EmailService] Resend Fetch Failed:', err.message);
            }
        }

        // PRIORITY 2: SMTP (Legacy fallback)
        const transporter = this.getTransporter();
        if (!transporter) {
            console.warn('SMTP variables missing. Email not sent:', { to, subject });
            return { success: false, error: 'SMTP variables missing' };
        }

        try {
            const data = await transporter.sendMail({
                from: DEFAULT_FROM,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject,
                html,
                text,
            });
            return { success: true, data };
        } catch (error) {
            console.error('Email sending failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Render and send a template email.
     */
    async sendTemplateEmail({ to, subject, templateName, data }) {
        const templatePath = path.join(__dirname, '..', 'views', 'emails', `${templateName}.ejs`);
        
        try {
            const html = await ejs.renderFile(templatePath, data);
            return await this.sendEmail({ to, subject, html });
        } catch (error) {
            console.error(`Failed to render template ${templateName}:`, error);
            return { success: false, error: `Template render failed: ${error.message}` };
        }
    }

    /**
     * Queue an email for background processing.
     * Fallback to direct sending if Redis is unavailable.
     */
    async queueEmail(jobData) {
        const { isRedisReady } = require('../lib/redis');
        
        if (isRedisReady()) {
            try {
                const emailQueue = require('../lib/emailQueue');
                return await emailQueue.add('send-email', jobData);
            } catch (queueErr) {
                console.warn('[EmailService] Failed to add to queue, falling back to direct send:', queueErr.message);
            }
        } else {
            console.warn('[EmailService] Redis unavailable, sending email directly (Direct Mode)...');
        }

        // Direct Fallback
        const { to, subject, html, text, templateName, data } = jobData;
        if (templateName) {
            return await this.sendTemplateEmail({ to, subject, templateName, data });
        } else {
            return await this.sendEmail({ to, subject, html, text });
        }
    }

    /**
     * Specific email helpers.
     */
    async sendWelcomeEmail(user) {
        return this.queueEmail({
            type: 'welcome',
            to: user.email,
            subject: 'Welcome to Calvoro – Your journey starts here',
            templateName: 'welcome',
            data: {
                username: user.first_name || 'there',
                loginUrl: 'https://calvoro.com/login.html'
            }
        });
    }

    async sendOrderConfirmationEmail(order, items) {
        return this.queueEmail({
            type: 'order-confirmation',
            to: order.customer_email,
            subject: `Order Confirmation #${order.order_number}`,
            templateName: 'order-confirmation',
            data: {
                order,
                items,
                trackUrl: `https://calvoro.com/track.html?id=${order.id}`
            }
        });
    }

    async sendPasswordResetEmail(user, resetUrl) {
        return this.queueEmail({
            type: 'password-reset',
            to: user.email,
            subject: 'Reset your password',
            templateName: 'password-reset',
            data: {
                username: user.first_name || 'there',
                resetUrl
            }
        });
    }

    async sendTrackingEmail(order, trackingNumber) {
        return this.queueEmail({
            type: 'tracking-update',
            to: order.customer_email,
            subject: `Tracking information for Order #${order.order_number}`,
            templateName: 'shipping-update',
            data: {
                username: order.customer_name || 'there',
                orderNumber: order.order_number,
                trackingNumber,
                trackUrl: `https://calvoro.com/track.html?id=${order.id}`
            }
        });
    }
}

module.exports = new EmailService();
