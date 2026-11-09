require('dotenv').config();
const crypto = require('crypto');
const amqplib = require('amqplib');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { sign } = require('../utils/signature');
const { getDelayMs, MAX_ATTEMPTS } = require('../utils/backoff');
const { sendEndpointFailureAlert } = require('../utils/email');
const { findOrgOwnerEmail } = require('../services/applicationService');
const { canCallEndpoint, recordFailure, recordSuccess } = require('../services/circuitBreakerService');

const prisma = new PrismaClient();
const QUEUE_NAME = 'event.deliver';
const TIMEOUT_MS = 5000;
// The endpoint can be disabled (and the delivery cancelled) while a send is in
// flight. Failure-path writes must not undo that; the delivered write still
// records what actually happened.
const NOT_CANCELLED = { status: { not: 'cancelled' } };

async function start() {
    const connection = await amqplib.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    connection.on('close', () => { console.log('[deliveryWorker] connection lost, will reconnect'); });
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    console.log('[deliveryWorker] connected, waiting for messages...');

    channel.consume(QUEUE_NAME, async (msg) => {
        if (!msg) return;
        const { deliveryId } = JSON.parse(msg.content.toString());

        try {
            await handleDelivery(deliveryId);
            channel.ack(msg);
        } catch (err) {
            console.error(`[deliveryWorker] error handling ${deliveryId}:`, err.message);
            channel.nack(msg, false, false);
        }
    });
}

async function handleDelivery(deliveryId) {
    const delivery = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        include: { event: true, endpoint: { include: { app: true } } },
    });
    if (!delivery) {
        console.warn(`[deliveryWorker] delivery ${deliveryId} not found`);
        return;
    }

    const { event, endpoint } = delivery;

    // Cancelled is final: a stale duplicate message after the endpoint is
    // re-enabled must not send it.
    if (delivery.status === 'cancelled') {
        console.log(`[deliveryWorker] delivery ${delivery.id} already cancelled, skipping`);
        return;
    }

    // Disabled means stopped for good, not paused. Disabling already cancels
    // pending deliveries; this catches messages that were in the queue.
    // Checked before the circuit breaker so a paused circuit can't reschedule
    // it or claim the probe slot. Only pending rows: a stale duplicate of a
    // delivered / failed_permanent one keeps its status.
    if (endpoint.disabled) {
        await prisma.delivery.updateMany({
            where: { id: delivery.id, status: 'pending' },
            data: { status: 'cancelled', nextAttemptAt: null },
        });
        console.log(`[deliveryWorker] delivery ${delivery.id} not sent (endpoint ${endpoint.id} is disabled)`);
        return;
    }

    const decision = await canCallEndpoint(endpoint.id, new Date());
    if (!decision.allowed) {
        // Circuit open — don't call a broken endpoint, don't burn an attempt.
        // Re-fetch the endpoint since canCallEndpoint may have just claimed
        // the probe slot (pushing pausedUntil forward) in a concurrent call.
        const fresh = await prisma.endpoint.findUnique({ where: { id: endpoint.id } });
        await prisma.delivery.updateMany({
            where: { id: delivery.id, ...NOT_CANCELLED },
            data: { nextAttemptAt: fresh.pausedUntil },
        });
        console.log(`[deliveryWorker] delivery ${delivery.id} -> circuit open for endpoint ${endpoint.id}, skipping until ${fresh.pausedUntil.toISOString()}`);
        return;
    }

    const signature = sign(event.payload, endpoint.secret);

    let statusCode;
    let responseBody;
    const startedAt = Date.now();

    try {
        const res = await axios.post(endpoint.url, event.payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Postie-Event-Id': event.id,
                'X-Postie-Event-Type': event.eventType,
                'X-Postie-Signature': `sha256=${signature}`,
            },
            timeout: TIMEOUT_MS,
            validateStatus: () => true,
        });
        statusCode = res.status;
        responseBody = JSON.stringify(res.data).slice(0, 1000);
    } catch (err) {
                statusCode = err.code === 'ECONNABORTED' ? 408 : 0;
        responseBody = err.message || err.code || 'request failed';
    }

    const durationMs = Date.now() - startedAt;
    const ok = statusCode >= 200 && statusCode < 300;
    const attemptNum = delivery.attemptCount + 1;

    await prisma.deliveryAttempt.create({
        data: {
            id: `att_${crypto.randomUUID()}`,
            deliveryId: delivery.id,
            attemptNum,
            statusCode,
            responseBody,
            durationMs,
        },
    });

    if (ok) {
        await recordSuccess(endpoint.id);
        await prisma.delivery.update({
            where: { id: delivery.id },
            data: { status: 'delivered', attemptCount: attemptNum, nextAttemptAt: null },
        });
        console.log(`[deliveryWorker] delivery ${delivery.id} -> delivered (status ${statusCode})`);
        return;
    }

    await recordFailure(endpoint.id, new Date());

    const delayMs = getDelayMs(attemptNum);
    if (attemptNum >= MAX_ATTEMPTS || delayMs === null) {
        const { count } = await prisma.delivery.updateMany({
            where: { id: delivery.id, ...NOT_CANCELLED },
            data: { status: 'failed_permanent', attemptCount: attemptNum, nextAttemptAt: null },
        });
        if (count === 0) {
            console.log(`[deliveryWorker] delivery ${delivery.id} was cancelled mid-send, no alert`);
            return;
        }
        console.log(`[deliveryWorker] delivery ${delivery.id} -> failed_permanent after ${attemptNum} attempts`);
        const ownerEmail = await findOrgOwnerEmail(endpoint.appId);
        if (ownerEmail) {
            const { error } = await sendEndpointFailureAlert({ to: ownerEmail, appName: endpoint.app.name, endpointUrl: endpoint.url });
            if (error) {
                console.error(`[deliveryWorker] failed to send alert email to ${ownerEmail}:`, error.message);
            } else {
                console.log(`[deliveryWorker] alert email sent to ${ownerEmail}`);
            }
        }
        return;
    }

    const { count } = await prisma.delivery.updateMany({
        where: { id: delivery.id, ...NOT_CANCELLED },
        data: {
            status: 'pending',
            attemptCount: attemptNum,
            nextAttemptAt: new Date(Date.now() + delayMs),
        },
    });
    if (count === 0) {
        console.log(`[deliveryWorker] delivery ${delivery.id} was cancelled mid-send, no retry`);
        return;
    }
    console.log(`[deliveryWorker] delivery ${delivery.id} -> retry in ${delayMs}ms (attempt ${attemptNum})`);
}

module.exports = { handleDelivery };

if (require.main === module) {
    start();
}
