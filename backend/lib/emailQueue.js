const { Queue } = require('bullmq');
const connection = require('./redis');

const emailQueue = new Queue('email-queue', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

// SILENCE internal Queue client errors
emailQueue.on('error', (err) => {
    // These are handled by our fallback logic in the service layer
});

module.exports = emailQueue;
