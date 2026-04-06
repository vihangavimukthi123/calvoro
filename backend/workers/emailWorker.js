const { Worker } = require('bullmq');
const connection = require('../lib/redis');
const emailService = require('../services/emailService');

const worker = new Worker('email-queue', async (job) => {
    console.log(`Processing email job: ${job.id} (Type: ${job.data.type})`);
    
    try {
        const { to, subject, html, text, templateName, data } = job.data;
        
        let result;
        if (templateName) {
            result = await emailService.sendTemplateEmail({ to, subject, templateName, data });
        } else {
            result = await emailService.sendEmail({ to, subject, html, text });
        }
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        console.log(`Email job completed: ${job.id}`);
        return result.data;
    } catch (error) {
        console.error(`Email job failed: ${job.id}`, error);
        throw error; // Re-throwing will trigger retry
    }
}, {
    connection,
    concurrency: 5, // Process up to 5 emails in parallel
});

// SILENCE internal Worker client errors
worker.on('error', (err) => {
    // Handled by service layer fallback
});

worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed with error: ${err.message}`);
});

module.exports = worker;
