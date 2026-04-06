const { Resend } = require('resend');
const path = require('path');
const ejs = require('ejs');
const fs = require('fs').promises;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const DEFAULT_FROM = process.env.MAIL_FROM || 'Calvoro <onboarding@resend.dev>';

class EmailService {
    /**
     * Send a raw email.
     */
    async sendEmail({ to, subject, html, text }) {
        if (!resend) {
            console.warn('Resend API key missing. Email not sent:', { to, subject });
            return { success: false, error: 'Resend API key missing' };
        }

        try {
            const data = await resend.emails.send({
                from: DEFAULT_FROM,
                to: Array.isArray(to) ? to : [to],
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
