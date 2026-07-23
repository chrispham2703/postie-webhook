

require('dotenv').config();
const amqplib = require('amqplib');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const QUEUE_NAME = 'event.deliver';
const TIMEOUT_MS = 5000;

// 1. Connect to RabbitMQ
async function start() {
    const connection = await amqplib.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    console.log('[deliveryWorker] connected, waiting for messages...');

    // 2. Consume message from the queue
    channel.consume(QUEUE_NAME, async (msg) => {
        if (!msg) return;
        const { eventId } = JSON.parse(msg.content.toString());

        try {
            await handleDelivery(eventId);
            // 7. Acknowledge message
            channel.ack(msg);
        } catch (err) {
            console.error(`[deliveryWorker] error handling ${eventId}:`, err.message);
            channel.nack(msg, false, false);
        }
    });
}

async function handleDelivery(eventId) {
    // 3. Fetch full event from PostgreSQL by eventId
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
        console.warn(`[deliveryWorker] event ${eventId} not found`);
        return;
    }

    const targetUrl = event.payload.targetUrl || 'https://httpbin.org/post';

    let statusCode = 0;
    let ok = false;
    const startedAt = Date.now();

    // 4. Make HTTP POST to targetUrl with event.payload
    try {
        const res = await axios.post(targetUrl, event.payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Postie-Event-Id': event.id,
                'X-Postie-Event-Type': event.eventType,
            },
            timeout: TIMEOUT_MS,
            validateStatus: () => true,
        });
        statusCode = res.status;
        ok = statusCode >= 200 && statusCode < 300;
    } catch (err) {
        statusCode = err.code === 'ECONNABORTED' ? 408 : 0;
    }

    const durationMs = Date.now() - startedAt;

    // 5. Record delivery attempt
    console.log(`[deliveryWorker] attempt eventId=${event.id} status=${statusCode} durationMs=${durationMs}ms`);

    // 6. Update event status: delivered or failed
    console.log(`[deliveryWorker] event ${event.id} -> ${ok ? 'delivered' : 'failed'}`);
}

start();
