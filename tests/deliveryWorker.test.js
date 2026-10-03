const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { handleDelivery } = require('../src/workers/deliveryWorker');
const { MAX_ATTEMPTS } = require('../src/utils/backoff');

const prisma = new PrismaClient();

// Needs the real Postgres from docker-compose. Uses its own org/app (no User
// attached) instead of the shared seed data, so the failed_permanent path's
// email alert finds no owner and is safely skipped -- not a real Resend call.
describe('deliveryWorker retry / exhausted behavior (integration, needs docker compose up)', () => {
    let org;
    let app;
    const createdIds = [];

    beforeAll(async () => {
        org = await prisma.organization.create({
            data: { id: `org_dwtest_${crypto.randomUUID()}`, name: 'DW Test Org', slug: `dw-test-${crypto.randomUUID()}` },
        });
        app = await prisma.application.create({
            data: { id: `app_dwtest_${crypto.randomUUID()}`, orgId: org.id, name: 'DW Test App' },
        });
    });

    afterAll(async () => {
        await prisma.organization.delete({ where: { id: org.id } }); // cascades app/endpoint/event/delivery
    });

    async function makeEndpoint(url) {
        const endpoint = await prisma.endpoint.create({
            data: { id: `ep_dwtest_${crypto.randomUUID()}`, appId: app.id, url, secret: 'whsec_test', filterTypes: [] },
        });
        return endpoint;
    }

    async function makeDelivery(endpointId, attemptCount) {
        const event = await prisma.event.create({
            data: { id: `evt_dwtest_${crypto.randomUUID()}`, appId: app.id, eventType: 'order.shipped', payload: { ok: true } },
        });
        return prisma.delivery.create({
            data: { id: `del_dwtest_${crypto.randomUUID()}`, eventId: event.id, endpointId, attemptCount },
        });
    }

    test('a failing call on a fresh delivery records the attempt and schedules a retry', async () => {
        const endpoint = await makeEndpoint('https://httpbin.org/status/500');
        const delivery = await makeDelivery(endpoint.id, 0);

        await handleDelivery(delivery.id);

        const attempts = await prisma.deliveryAttempt.findMany({ where: { deliveryId: delivery.id } });
        expect(attempts).toHaveLength(1);
        expect(attempts[0].statusCode).toBe(500);

        const fresh = await prisma.delivery.findUnique({ where: { id: delivery.id } });
        expect(fresh.status).toBe('pending');
        expect(fresh.attemptCount).toBe(1);
        expect(fresh.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    }, 15000);

    test('a failing call that exhausts the ladder marks the delivery failed_permanent', async () => {
        const endpoint = await makeEndpoint('https://httpbin.org/status/500');
        const delivery = await makeDelivery(endpoint.id, MAX_ATTEMPTS); // next attempt is past the ladder's end

        await handleDelivery(delivery.id);

        const fresh = await prisma.delivery.findUnique({ where: { id: delivery.id } });
        expect(fresh.status).toBe('failed_permanent');
        expect(fresh.nextAttemptAt).toBeNull();
    }, 15000);
});
