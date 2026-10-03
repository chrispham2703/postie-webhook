const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

// Mocked for the same reason as retryPoller's test -- this is about which
// events scanOnce picks up and how it updates them, not a real queue round-trip.
jest.mock('../src/config/rabbitmq', () => ({
    connect: jest.fn(),
    publish: jest.fn(),
}));

const { scanOnce } = require('../src/workers/recoveryScan');

const prisma = new PrismaClient();
const STUCK_AFTER_MS = 5 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 3;

// Needs the real Postgres from docker-compose and the seeded app_test_1/ep_test_1.
describe('recoveryScan.scanOnce (integration, needs docker compose up + seed)', () => {
    const createdEventIds = [];

    afterEach(async () => {
        await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
        createdEventIds.length = 0;
    });

    async function makeEvent(overrides) {
        const event = await prisma.event.create({
            data: { id: `evt_rstest_${crypto.randomUUID()}`, appId: 'app_test_1', eventType: 'order.shipped', payload: {}, ...overrides },
        });
        createdEventIds.push(event.id);
        return event;
    }

    test('recovers a queue_failed event: fans out, sets status back to received, increments recoveryAttempts', async () => {
        const event = await makeEvent({ status: 'queue_failed' });

        await scanOnce();

        const fresh = await prisma.event.findUnique({ where: { id: event.id } });
        expect(fresh.status).toBe('received');
        expect(fresh.recoveryAttempts).toBe(1);

        const deliveries = await prisma.delivery.findMany({ where: { eventId: event.id } });
        expect(deliveries.length).toBeGreaterThan(0);
    }, 15000);

    test('recovers a received event stuck past the stuck-after window', async () => {
        const event = await makeEvent({ status: 'received', createdAt: new Date(Date.now() - STUCK_AFTER_MS - 1000) });

        await scanOnce();

        const fresh = await prisma.event.findUnique({ where: { id: event.id } });
        expect(fresh.recoveryAttempts).toBe(1);
    }, 15000);

    test('does not touch a received event that is not stuck yet', async () => {
        const event = await makeEvent({ status: 'received' }); // createdAt defaults to now

        await scanOnce();

        const fresh = await prisma.event.findUnique({ where: { id: event.id } });
        expect(fresh.recoveryAttempts).toBe(0);
    }, 15000);

    test('does not touch an event that already exhausted its recovery attempts', async () => {
        const event = await makeEvent({ status: 'queue_failed', recoveryAttempts: MAX_RECOVERY_ATTEMPTS });

        await scanOnce();

        const fresh = await prisma.event.findUnique({ where: { id: event.id } });
        expect(fresh.status).toBe('queue_failed'); // untouched
        expect(fresh.recoveryAttempts).toBe(MAX_RECOVERY_ATTEMPTS);
    }, 15000);
});
