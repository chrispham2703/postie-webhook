require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { connect, publish } = require('../config/rabbitmq');

const prisma = new PrismaClient();
const POLL_INTERVAL_MS = 30 * 1000;

// Deliveries that failed at least once get a nextAttemptAt (the backoff ladder
// in src/utils/backoff.js). This poller is the thing that actually wakes them
// back up — the worker only reacts to queue messages, it doesn't watch the clock.
async function pollOnce() {
    const dueDeliveries = await prisma.delivery.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
    });

    for (const delivery of dueDeliveries) {
        publish(delivery.id);
        console.log(`[retryPoller] requeued delivery ${delivery.id} (attempt ${delivery.attemptCount + 1})`);
    }
}

async function start() {
    await connect();
    console.log(`[retryPoller] polling every ${POLL_INTERVAL_MS}ms`);
    const tick = () => pollOnce().catch((err) => console.error('[retryPoller] poll failed:', err.message));
    tick();
    setInterval(tick, POLL_INTERVAL_MS);
}

start();
