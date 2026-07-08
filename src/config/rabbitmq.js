const amqplib = require('amqplib');

const QUEUE_NAME = 'webhook.delivery';
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

module.exports = { connect, publish };
