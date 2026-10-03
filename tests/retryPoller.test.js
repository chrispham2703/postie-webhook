const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

// Mocked: this test is about retryPoller's DB query (picking the right
// deliveries), not a real RabbitMQ round-trip -- that's already covered by
// deliveryWorker actually processing a queued message in its own test.
jest.mock('../src/config/rabbitmq', () => ({
    connect: jest.fn(),
    publish: jest.fn(),
}));

const { publish } = require('../src/config/rabbitmq');
const { pollOnce } = require('../src/workers/retryPoller');

const prisma = new PrismaClient();

// Needs the real Postgres from docker-compose and the seeded app_test_1/ep_test_1.
describe('retryPoller.pollOnce (integration, needs docker compose up + seed)', () => {
    const createdDeliveryIds = [];

    afterEach(async () => {
        await prisma.delivery.deleteMany({ where: { id: { in: createdDeliveryIds } } });
        await prisma.event.deleteMany({ where: { id: { startsWith: 'evt_rptest_' } } });
        createdDeliveryIds.length = 0;
        publish.mockClear();
    });

    async function makeDelivery({ status, nextAttemptAt }) {
        const event = await prisma.event.create({
            data: { id: `evt_rptest_${crypto.randomUUID()}`, appId: 'app_test_1', eventType: 'order.shipped', payload: {} },
        });
        const delivery = await prisma.delivery.create({
            data: { id: `del_rptest_${crypto.randomUUID()}`, eventId: event.id, endpointId: 'ep_test_1', status, nextAttemptAt },
        });
        createdDeliveryIds.push(delivery.id);
        return delivery;
    }

    test('publishes a pending delivery whose nextAttemptAt has already passed', async () => {
        const due = await makeDelivery({ status: 'pending', nextAttemptAt: new Date(Date.now() - 1000) });

        await pollOnce();

        expect(publish).toHaveBeenCalledWith(due.id);
    });

    test('does not publish a pending delivery whose nextAttemptAt is still in the future', async () => {
        await makeDelivery({ status: 'pending', nextAttemptAt: new Date(Date.now() + 60_000) });

        await pollOnce();

        expect(publish).not.toHaveBeenCalled();
    });

    test('does not publish a delivered delivery even if nextAttemptAt is in the past', async () => {
        await makeDelivery({ status: 'delivered', nextAttemptAt: new Date(Date.now() - 1000) });

        await pollOnce();

        expect(publish).not.toHaveBeenCalled();
    });
});
