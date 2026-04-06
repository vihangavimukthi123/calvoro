const Redis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || null;

const redisConfig = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null, // Required by BullMQ
    lazyConnect: true,          // Don't connect until needed
    enableOfflineQueue: false,  // Don't buffer commands when offline
    retryStrategy: (times) => {
        // Slow retry: wait 30 seconds between attempts to minimize log noise
        return 30000;
    }
};

if (REDIS_PASSWORD) {
    redisConfig.password = REDIS_PASSWORD;
}

const connection = new Redis(redisConfig);

// Throttled warning to avoid log spam
let lastWarn = 0;
const WARN_INTERVAL = 60000; // 1 minute

connection.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
        const now = Date.now();
        if (now - lastWarn > WARN_INTERVAL) {
            console.warn(`[Redis] Connection offline on ${REDIS_HOST}:${REDIS_PORT}. System is automatically running in "Direct Mode" (Synchronous Emails).`);
            lastWarn = now;
        }
    } else {
        console.error('[Redis Error]', err.message);
    }
});

connection.on('connect', () => {
    console.log('✅ Connected to Redis');
});

function isRedisReady() {
    return connection.status === 'ready';
}

module.exports = connection;
module.exports.isRedisReady = isRedisReady;
