const amqplib = require('amqplib');

const QUEUE_NAME = 'event.deliver';
let channel = null;

async function connect() {
    const connection = await amqplib.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    console.log('[RabbitMQ] Connected and channel ready');
}

function publish(eventId) {
    if (!channel) throw new Error('[RabbitMQ] Channel not initialized');
    channel.sendToQueue(
        QUEUE_NAME,
        Buffer.from(JSON.stringify({ eventId })),
        { persistent: true }
    );
}

function consume(handler) {
    if (!channel) throw new Error('[RabbitMQ] Channel not initialized');
    channel.prefetch(10);
    channel.consume(QUEUE_NAME, async (msg) => {
        if (!msg) return;
        try {
            const { eventId } = JSON.parse(msg.content.toString());
            await handler(eventId);
            channel.ack(msg);
        } catch (err) {
            // Drop poison messages instead of requeueing forever. TODO: route to a DLQ.
            console.error('[RabbitMQ] Consumer error:', err.message);
            channel.nack(msg, false, false);
        }
    });
    console.log(`[RabbitMQ] Consuming from ${QUEUE_NAME}`);
}

module.exports = { connect, publish, consume };
