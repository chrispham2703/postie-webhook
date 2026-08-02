const amqplib = require('amqplib');

const QUEUE_NAME = 'event.deliver';
let channel = null;
let connection = null;

async function connect() {
    connection = await amqplib.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    console.log('[RabbitMQ] Connected and channel ready');
}

async function close() {
    if (channel) await channel.close();
    if (connection) await connection.close();
    channel = null;
    connection = null;
}

function publish(deliveryId) {
    if (!channel) throw new Error('[RabbitMQ] Channel not initialized');
    channel.sendToQueue(
        QUEUE_NAME,
        Buffer.from(JSON.stringify({ deliveryId })),
        { persistent: true }
    );
}

function consume(handler) {
    if (!channel) throw new Error('[RabbitMQ] Channel not initialized');
    channel.prefetch(10);
    channel.consume(QUEUE_NAME, async (msg) => {
        if (!msg) return;
        try {
            const { deliveryId } = JSON.parse(msg.content.toString());
            await handler(deliveryId);
            channel.ack(msg);
        } catch (err) {
            // Drop poison messages instead of requeueing forever. TODO: route to a DLQ.
            console.error('[RabbitMQ] Consumer error:', err.message);
            channel.nack(msg, false, false);
        }
    });
    console.log(`[RabbitMQ] Consuming from ${QUEUE_NAME}`);
}

module.exports = { connect, close, publish, consume };
