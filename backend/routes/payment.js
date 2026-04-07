const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');

// PayHere Configuration from environment variables
const MERCHANT_ID = process.env.PAYHERE_MERCHANT_ID || '1234567';
const MERCHANT_SECRET = process.env.PAYHERE_MERCHANT_SECRET || 'XXXXXXXXXXXXXXXXXXXXXX';
const PAYHERE_MODE = process.env.PAYHERE_MODE || 'sandbox';

// PayHere URLs
const PAYHERE_SANDBOX_URL = 'https://sandbox.payhere.lk/pay/checkout';
const PAYHERE_LIVE_URL = 'https://www.payhere.lk/pay/checkout';
const PAYHERE_URL = PAYHERE_MODE === 'live' ? PAYHERE_LIVE_URL : PAYHERE_SANDBOX_URL;

// Base URL - adjust this based on your deployment
const BASE_URL = process.env.BASE_URL || '/api';

/**
 * Generate PayHere security hash
 * Formula: strtoupper(md5(merchant_id + order_id + amount + currency + strtoupper(md5(merchant_secret))))
 */
function generateHash(orderId, amount, currency = 'LKR') {
    const merchantSecretHash = crypto.createHash('md5').update(MERCHANT_SECRET).digest('hex').toUpperCase();
    const amountFormatted = parseFloat(amount).toFixed(2);
    const hashString = MERCHANT_ID + orderId + amountFormatted + currency + merchantSecretHash;
    return crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();
}

/**
 * Initiate Payment
 * GET /api/payment/initiate/:orderId
 */
router.get('/initiate/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await db.getOrderById(orderId);

        if (!order) {
            return res.status(404).send('Order not found');
        }

        // Check if order is already paid
        if (order.status === 'paid' || order.status === 'completed') {
            return res.status(400).send('Order has already been paid');
        }

        // Format amount to 2 decimal places
        const amount = parseFloat(order.total).toFixed(2);
        const currency = 'LKR';

        // Generate PayHere hash
        const hash = generateHash(order.id, amount, currency);

        // Parse customer name into first and last name
        const nameParts = order.customer_name.split(' ');
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || 'Name';

        // Prepare PayHere form data
        const paymentData = {
            merchant_id: MERCHANT_ID,
            return_url: `${BASE_URL}/api/payment/return`,
            cancel_url: `${BASE_URL}/api/payment/cancel`,
            notify_url: `${BASE_URL}/api/payment/notify`,
            order_id: order.id.toString(),
            items: order.order_number || `Order #${order.id}`,
            currency: currency,
            amount: amount,
            first_name: firstName,
            last_name: lastName,
            email: order.customer_email,
            phone: order.customer_phone || '',
            address: order.customer_address || '',
            city: 'Colombo', // Default city, update based on your needs
            country: 'Sri Lanka',
            hash: hash,
            payhere_url: PAYHERE_URL
        };

        // Render payment form
        res.render('payment-form', paymentData);
    } catch (error) {
        console.error('Payment initiation error:', error);
        res.status(500).send('Error initiating payment');
    }
});

/**
 * Payment Notification Webhook
 * POST /api/payment/notify
 * This endpoint receives payment notifications from PayHere
 */
router.post('/notify', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        const {
            merchant_id,
            order_id,
            payhere_amount,
            payhere_currency,
            status_code,
            md5sig,
            method,
            status_message,
            card_holder_name,
            card_no
        } = req.body;

        console.log('PayHere Notification Received:', {
            order_id,
            status_code,
            amount: payhere_amount,
            method,
            status_message
        });

        // Verify merchant ID
        if (merchant_id !== MERCHANT_ID) {
            console.error('Invalid merchant ID in notification');
            return res.status(400).send('Invalid merchant');
        }

        // Verify the hash signature
        const merchantSecretHash = crypto.createHash('md5').update(MERCHANT_SECRET).digest('hex').toUpperCase();
        const amountFormatted = parseFloat(payhere_amount).toFixed(2);
        const localHashString = merchant_id + order_id + amountFormatted + payhere_currency + status_code + merchantSecretHash;
        const localHash = crypto.createHash('md5').update(localHashString).digest('hex').toUpperCase();

        if (localHash !== md5sig) {
            console.error('Hash verification failed');
            console.error('Expected:', localHash);
            console.error('Received:', md5sig);
            return res.status(400).send('Hash verification failed');
        }

        // Check payment status
        // status_code: 2 = success, 0 = pending, -1 = canceled, -2 = failed, -3 = charged back
        if (status_code === '2') {
            // Payment successful - update order status
            const result = await db.updateOrderStatus(order_id, 'paid');

            if (result.changes > 0) {
                console.log(`✓ Order ${order_id} marked as paid`);

                // You can add additional logic here:
                // - Send confirmation email
                // - Trigger fulfillment process
                // - Update inventory

                return res.status(200).send('OK');
            } else {
                console.error(`Failed to update order ${order_id}`);
                return res.status(500).send('Error updating order');
            }
        } else if (status_code === '0') {
            console.log(`Order ${order_id} payment is pending`);
            await db.updateOrderStatus(order_id, 'pending');
            return res.status(200).send('OK');
        } else {
            console.log(`Order ${order_id} payment failed/cancelled. Status: ${status_code}, Message: ${status_message}`);
            await db.updateOrderStatus(order_id, 'payment_failed');
            return res.status(200).send('OK');
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).send('Error processing notification');
    }
});

/**
 * Payment Return URL
 * GET /api/payment/return
 * User is redirected here after payment
 */
router.get('/return', (req, res) => {
    const { order_id } = req.query;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Processing</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 600px;
                    margin: 50px auto;
                    padding: 20px;
                    text-align: center;
                }
                .success-box {
                    background: #d4edda;
                    border: 1px solid #c3e6cb;
                    color: #155724;
                    padding: 30px;
                    border-radius: 8px;
                }
                h1 { margin-top: 0; }
                .order-id { 
                    font-size: 24px; 
                    font-weight: bold; 
                    margin: 20px 0;
                }
                .info {
                    margin-top: 20px;
                    color: #666;
                }
                a {
                    display: inline-block;
                    margin-top: 20px;
                    padding: 10px 20px;
                    background: #28a745;
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                }
            </style>
        </head>
        <body>
            <div class="success-box">
                <h1>✓ Payment Submitted</h1>
                <p>Thank you for your payment!</p>
                ${order_id ? `<div class="order-id">Order #${order_id}</div>` : ''}
                <div class="info">
                    <p>Your payment is being processed. You will receive a confirmation email shortly.</p>
                    <p>You can close this window or return to the homepage.</p>
                </div>
                <a href="/">Return to Homepage</a>
            </div>
        </body>
        </html>
    `);
});

/**
 * Payment Cancel URL
 * GET /api/payment/cancel
 * User is redirected here if they cancel the payment
 */
router.get('/cancel', (req, res) => {
    const { order_id } = req.query;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Cancelled</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 600px;
                    margin: 50px auto;
                    padding: 20px;
                    text-align: center;
                }
                .cancel-box {
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    color: #856404;
                    padding: 30px;
                    border-radius: 8px;
                }
                h1 { margin-top: 0; }
                .info {
                    margin-top: 20px;
                }
                a {
                    display: inline-block;
                    margin: 10px;
                    padding: 10px 20px;
                    text-decoration: none;
                    border-radius: 5px;
                }
                .retry {
                    background: #ffc107;
                    color: #333;
                }
                .home {
                    background: #6c757d;
                    color: white;
                }
            </style>
        </head>
        <body>
            <div class="cancel-box">
                <h1>Payment Cancelled</h1>
                <p>Your payment was not completed.</p>
                <div class="info">
                    <p>No charges have been made to your account.</p>
                    ${order_id ? `<p>Order #${order_id} is still pending.</p>` : ''}
                </div>
                ${order_id ? `<a href="/api/payment/initiate/${order_id}" class="retry">Try Again</a>` : ''}
                <a href="/" class="home">Return to Homepage</a>
            </div>
        </body>
        </html>
    `);
});

module.exports = router;
