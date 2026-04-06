# Email Setup (Optional)

Email verification has been removed. Registration is immediate; users can sign in right after sign up.

This file is kept for reference if you add email features later (e.g. password reset).

## Gmail Setup

1. **Enable 2-Factor Authentication** on your Google account:
   - Go to https://myaccount.google.com/security
   - Turn on 2-Step Verification

2. **Create an App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the 16-character password (e.g. `abcd efgh ijkl mnop`)

3. **Update `backend/.env`** – uncomment and fill in:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-16-char-app-password
MAIL_FROM=CALVORO <your-gmail@gmail.com>
```

4. **Restart the backend server** after saving `.env`.

## Other Providers

| Provider  | SMTP_HOST           | SMTP_PORT |
|-----------|---------------------|-----------|
| Outlook   | smtp.office365.com  | 587       |
| Yahoo     | smtp.mail.yahoo.com | 587       |
| SendGrid  | smtp.sendgrid.net   | 587       |
| Mailgun   | smtp.mailgun.org    | 587       |

Use your provider's SMTP credentials for `SMTP_USER` and `SMTP_PASS`.

