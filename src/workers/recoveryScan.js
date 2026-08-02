require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { connect, publish } = require('../config/rabbitmq');
const { createDeliveries } = require('../services/deliveryService');

const prisma = new PrismaClient();
const SCAN_INTERVAL_MS = 60 * 1000;
const STUCK_AFTER_MS = 5 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 3;

// docs/ARCHITECTURE.md §16: a "received" event with no worker ack proof, or a
// "queue_failed" event, might just be silently lost. This job re-fans-out and
// re-publishes those events. createDeliveries() is upsert-based so calling it
// again for the same event never creates duplicate Delivery rows.
async function scanOnce() {
    const stuckEvents = await prisma.event.findMany({
        where: {
            recoveryAttempts: { lt: MAX_RECOVERY_ATTEMPTS },
            OR: [
                { status: 'queue_failed' },
                { status: 'received', createdAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
            ],
        },
    });

    for (const event of stuckEvents) {
        try {
            const deliveries = await createDeliveries(event);
            const pending = deliveries.filter((d) => d.status === 'pending');
            for (const delivery of pending) {
                publish(delivery.id);
            }

            await prisma.event.update({
                where: { id: event.id },
                data: { status: 'received', recoveryAttempts: { increment: 1 } },
            });
            console.log(`[recoveryScan] recovered event ${event.id}, requeued ${pending.length} delivery(ies)`);
        } catch (err) {
            console.error(`[recoveryScan] failed to recover event ${event.id}:`, err.message);
        }
    }

    const exhausted = await prisma.event.count({
        where: { recoveryAttempts: { gte: MAX_RECOVERY_ATTEMPTS } },
    });
    if (exhausted > 0) {
        console.warn(`[recoveryScan] ${exhausted} event(s) exhausted recovery attempts — needs human inspection`);
    }
}

async function start() {
    await connect();
    console.log(`[recoveryScan] scanning every ${SCAN_INTERVAL_MS}ms`);
    const tick = () => scanOnce().catch((err) => console.error('[recoveryScan] scan failed:', err.message));
    tick();
    setInterval(tick, SCAN_INTERVAL_MS);
}

start();
