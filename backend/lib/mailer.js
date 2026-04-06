const nodemailer = require('nodemailer');
const path = require('path');


function getTransporter() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;
    return nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1',
        auth: { user, pass }
    });
}

async function sendVerificationEmail(toEmail, code) {
    const transporter = getTransporter();
    const from = process.env.MAIL_FROM || 'CALVORO <noreply@calvoro.com>';
    const subject = 'Your CALVORO verification code';
    const text = `Your verification code is: ${code}\n\nEnter this code on the website to verify your account. The code expires in 15 minutes.`;
    const html = `<p>Your verification code is: <strong>${code}</strong></p><p>Enter this code on the website to verify your account. The code expires in 15 minutes.</p>`;

    if (transporter) {
        try {
            await transporter.sendMail({ from, to: toEmail, subject, text, html });
            return { sent: true };
        } catch (err) {
            console.error('Mail send error:', err.message);
            return { sent: false, error: err.message };
        }
    }
    // SMTP not configured: log to console and return devCode for development
    console.log('[Mail not configured] Verification code for', toEmail, ':', code);
    return { sent: false, devCode: code };
}

async function sendGiftVoucherEmail(toEmail, voucherCode, amount, message, senderName) {
    const transporter = getTransporter();
    const from = process.env.MAIL_FROM || 'CALVORO <noreply@calvoro.com>';
    const subject = `You received a LKR ${amount.toLocaleString()} gift voucher from CALVORO!`;
    const amountFormatted = 'LKR ' + amount.toLocaleString();
    const text = `${senderName || 'Someone'} sent you a gift voucher!\n\nGift Code: ${voucherCode}\nAmount: ${amountFormatted}\n\n${message ? 'Message: ' + message + '\n\n' : ''}Use this code at checkout on calvoro.com to redeem your gift.`;
    
    // Path to the gift card image
    const imagePath = path.join(__dirname, '../../images/gift-card-template.png');

    const html = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; border: 1px solid #eeeeee;">
            <div style="padding: 40px 20px; text-align: center; background-color: #000000; color: #ffffff;">
                <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px;">CALVORO</h1>
                <p style="margin: 10px 0 0; font-size: 14px; opacity: 0.8;">PREMIUM ATHLEISURE</p>
            </div>
            
            <div style="padding: 30px; text-align: center;">
                <h2 style="color: #1a1a1a; margin-bottom: 10px;">A Special Gift for You</h2>
                <p style="color: #666666; font-size: 16px;">${senderName || 'A friend'} has sent you a CALVORO gift voucher.</p>
                
                <div style="margin: 30px 0; position: relative; text-align: center; background-color: #f9f9f9; padding: 20px; border-radius: 12px;">
                    <img src="cid:giftcard" alt="CALVORO Gift Card" style="width: 100%; max-width: 400px; border-radius: 8px;">
                    <div style="margin-top: 15px; font-size: 28px; font-weight: bold; color: #1a1a1a;">${amountFormatted}</div>
                    <div style="font-size: 12px; color: #999999; letter-spacing: 2px; margin-top: 5px;">GIFT VOUCHER</div>
                </div>

                <div style="background: #ffffff; border: 2px dashed #1a1a1a; padding: 20px; margin: 20px 0; border-radius: 4px;">
                    <p style="font-size: 12px; color: #999999; margin: 0 0 5px; text-transform: uppercase; letter-spacing: 1px;">Your Redeem Code</p>
                    <p style="font-size: 24px; font-weight: bold; color: #1a1a1a; margin: 0; letter-spacing: 4px;">${voucherCode}</p>
                </div>

                ${message ? `
                <div style="margin: 30px 0; padding: 25px; background-color: #f9f9f9; border-left: 4px solid #1a1a1a; text-align: left; border-radius: 0 4px 4px 0;">
                    <p style="margin: 0; color: #333333; font-style: italic; line-height: 1.6; font-size: 16px;">"${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}"</p>
                    <p style="margin: 15px 0 0; color: #1a1a1a; font-size: 14px; font-weight: bold;">— ${senderName || 'Sender'}</p>
                </div>` : ''}

                <a href="https://calvoro.com" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 18px 40px; text-decoration: none; font-weight: bold; border-radius: 4px; margin: 20px 0; letter-spacing: 1px;">SHOP AT CALVORO</a>
                
                <p style="color: #666666; font-size: 14px; margin-top: 30px;">
                    Apply this code in the discount field at checkout.
                </p>
            </div>

            <div style="padding: 30px; background-color: #000000; text-align: center; color: #ffffff; font-size: 11px; letter-spacing: 1px;">
                <p style="margin: 0 0 10px;">MADE IN SRI LANKA | DESTINED FOR THE WORLD</p>
                <p style="margin: 0; opacity: 0.5;">© 2026 CALVORO. ALL RIGHTS RESERVED.</p>
            </div>
        </div>
    `;

    if (transporter) {
        try {
            await transporter.sendMail({ 
                from, 
                to: toEmail, 
                subject, 
                text, 
                html,
                attachments: [
                    {
                        filename: 'gift-card-template.png',
                        path: imagePath,
                        cid: 'giftcard'
                    }
                ]
            });
            return { sent: true };
        } catch (err) {
            console.error('Gift voucher email error:', err.message);
            return { sent: false, error: err.message };
        }
    }
    console.log('[Mail not configured] Gift voucher email would be sent to', toEmail, ':', voucherCode, amountFormatted);
    return { sent: false, devCode: voucherCode };
}

module.exports = { sendVerificationEmail, sendGiftVoucherEmail };
