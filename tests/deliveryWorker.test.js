const crypto = require('crypto');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

// Only retryPoller uses config/rabbitmq; handleDelivery doesn't, so the
// existing tests below are unaffected by this mock.
jest.mock('../src/config/rabbitmq', () => ({
    connect: jest.fn(),
    publish: jest.fn(),
}));

const { publish } = require('../src/config/rabbitmq');
const { handleDelivery } = require('../src/workers/deliveryWorker');
const { pollOnce } = require('../src/workers/retryPoller');
const { MAX_ATTEMPTS } = require('../src/utils/backoff');
const { cancelPendingDeliveries } = require('../src/services/deliveryService');

const prisma = new PrismaClient();

// Needs the real Postgres from docker-compose. Uses its own org/app (no User
// attached) instead of the shared seed data, so the failed_permanent path's
// email alert finds no owner and is safely skipped -- not a real Resend call.
describe('deliveryWorker retry / exhausted behavior (integration, needs docker compose up)', () => {
    let org;
    let app;

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

    async function makeEndpoint(url, extra = {}) {
        const endpoint = await prisma.endpoint.create({
            data: { id: `ep_dwtest_${crypto.randomUUID()}`, appId: app.id, url, secret: 'whsec_test', filterTypes: [], ...extra },
        });
        return endpoint;
    }

    async function makeDelivery(endpointId, attemptCount, extra = {}) {
        const event = await prisma.event.create({
            data: { id: `evt_dwtest_${crypto.randomUUID()}`, appId: app.id, eventType: 'order.shipped', payload: { ok: true } },
        });
        return prisma.delivery.create({
            data: { id: `del_dwtest_${crypto.randomUUID()}`, eventId: event.id, endpointId, attemptCount, ...extra },
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

    describe('disabled endpoint', () => {
        let postSpy;

        // Mocked 200 so nothing hits the network -- and so that, if the worker
        // does call a disabled endpoint, the delivery visibly ends up 'delivered'.
        beforeEach(() => {
            postSpy = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} });
        });

        afterEach(() => {
            postSpy.mockRestore();
            publish.mockClear();
        });

        async function expectCancelled(deliveryId, attemptCount) {
            const fresh = await prisma.delivery.findUnique({ where: { id: deliveryId } });
            expect(fresh.status).toBe('cancelled');
            expect(fresh.nextAttemptAt).toBeNull();
            expect(fresh.attemptCount).toBe(attemptCount);

            const attempts = await prisma.deliveryAttempt.findMany({ where: { deliveryId } });
            expect(attempts).toHaveLength(0);
        }

        test('a fresh delivery is cancelled without calling the endpoint', async () => {
            const endpoint = await makeEndpoint('https://httpbin.org/status/200', { disabled: true });
            const delivery = await makeDelivery(endpoint.id, 0);

            await handleDelivery(delivery.id);

            expect(postSpy).not.toHaveBeenCalled();
            await expectCancelled(delivery.id, 0);
        });

        test('a pending retry picked up by the poller is cancelled without calling the endpoint', async () => {
            const endpoint = await makeEndpoint('https://httpbin.org/status/200', { disabled: true });
            const delivery = await makeDelivery(endpoint.id, 2, {
                status: 'pending',
                nextAttemptAt: new Date(Date.now() - 1000),
            });

            // pollOnce publishes every due delivery in the DB; we only act on ours.
            await pollOnce();
            const publishedIds = publish.mock.calls.map(([id]) => id);
            expect(publishedIds).toContain(delivery.id);

            await handleDelivery(delivery.id);

            expect(postSpy).not.toHaveBeenCalled();
            await expectCancelled(delivery.id, 2);
        });

        test('re-enabling the endpoint does not resend a cancelled delivery', async () => {
            const endpoint = await makeEndpoint('https://httpbin.org/status/200', { disabled: true });
            const delivery = await makeDelivery(endpoint.id, 0);

            await handleDelivery(delivery.id);
            await expectCancelled(delivery.id, 0);

            await prisma.endpoint.update({ where: { id: endpoint.id }, data: { disabled: false } });

            // e.g. a stale duplicate message for the same deliveryId
            await handleDelivery(delivery.id);

            expect(postSpy).not.toHaveBeenCalled();
            await expectCancelled(delivery.id, 0);

            await pollOnce();
            const publishedIds = publish.mock.calls.map(([id]) => id);
            expect(publishedIds).not.toContain(delivery.id);
        });

        test('a disabled endpoint with an open circuit cancels instead of waiting for pausedUntil', async () => {
            const pausedUntil = new Date(Date.now() + 5 * 60 * 1000);
            const failureSince = new Date(Date.now() - 30 * 1000);
            const endpoint = await makeEndpoint('https://httpbin.org/status/200', {
                disabled: true,
                status: 'paused',
                pausedUntil,
                failureCount: 5,
                failureSince,
            });
            const delivery = await makeDelivery(endpoint.id, 1, {
                status: 'pending',
                nextAttemptAt: new Date(Date.now() - 1000),
            });

            await handleDelivery(delivery.id);

            expect(postSpy).not.toHaveBeenCalled();
            await expectCancelled(delivery.id, 1);

            const freshEndpoint = await prisma.endpoint.findUnique({ where: { id: endpoint.id } });
            expect(freshEndpoint.status).toBe('paused');
            expect(freshEndpoint.pausedUntil.getTime()).toBe(pausedUntil.getTime());
            expect(freshEndpoint.failureCount).toBe(5);
            expect(freshEndpoint.failureSince.getTime()).toBe(failureSince.getTime());
        });

        test('a cancelled delivery and its event are kept, not deleted', async () => {
            const endpoint = await makeEndpoint('https://httpbin.org/status/200', { disabled: true });
            const delivery = await makeDelivery(endpoint.id, 0);

            await handleDelivery(delivery.id);

            const freshDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
            expect(freshDelivery).not.toBeNull();
            expect(freshDelivery.status).toBe('cancelled');
            const freshEvent = await prisma.event.findUnique({ where: { id: delivery.eventId } });
            expect(freshEvent).not.toBeNull();
        });

        // a stale duplicate message for a finished delivery must not relabel it
        test.each([['delivered'], ['failed_permanent']])(
            'a %s delivery keeps its status when a duplicate message arrives after disabling',
            async (status) => {
                const endpoint = await makeEndpoint('https://httpbin.org/status/200', { disabled: true });
                const delivery = await makeDelivery(endpoint.id, 1, { status });

                await handleDelivery(delivery.id);

                const fresh = await prisma.delivery.findUnique({ where: { id: delivery.id } });
                expect(fresh.status).toBe(status);
                expect(postSpy).not.toHaveBeenCalled();
            }
        );

        describe('disabled while the send is in flight', () => {
            // The worker has already passed its disabled check; the endpoint is
            // disabled (and its pending deliveries cancelled) during the HTTP call.
            function disableDuringSend(endpointId, statusCode) {
                postSpy.mockImplementation(async () => {
                    await prisma.endpoint.update({ where: { id: endpointId }, data: { disabled: true } });
                    await cancelPendingDeliveries(endpointId);
                    return { status: statusCode, data: {} };
                });
            }

            test('a failed send stays cancelled instead of being scheduled for a retry', async () => {
                const endpoint = await makeEndpoint('https://httpbin.org/status/500');
                const delivery = await makeDelivery(endpoint.id, 0);
                disableDuringSend(endpoint.id, 500);

                await handleDelivery(delivery.id);

                const fresh = await prisma.delivery.findUnique({ where: { id: delivery.id } });
                expect(fresh.status).toBe('cancelled');
                expect(fresh.nextAttemptAt).toBeNull();
                // the attempt really happened, so it is still recorded
                const attempts = await prisma.deliveryAttempt.findMany({ where: { deliveryId: delivery.id } });
                expect(attempts).toHaveLength(1);
            });

            test('a failed last attempt stays cancelled instead of becoming failed_permanent', async () => {
                const endpoint = await makeEndpoint('https://httpbin.org/status/500');
                const delivery = await makeDelivery(endpoint.id, MAX_ATTEMPTS - 1);
                disableDuringSend(endpoint.id, 500);

                await handleDelivery(delivery.id);

                const fresh = await prisma.delivery.findUnique({ where: { id: delivery.id } });
                expect(fresh.status).toBe('cancelled');
                expect(fresh.nextAttemptAt).toBeNull();
            });

            test('re-enabling after a cancelled in-flight failure does not resend it', async () => {
                const endpoint = await makeEndpoint('https://httpbin.org/status/500');
                const delivery = await makeDelivery(endpoint.id, 0);
                disableDuringSend(endpoint.id, 500);
                await handleDelivery(delivery.id);

                await prisma.endpoint.update({ where: { id: endpoint.id }, data: { disabled: false } });
                await prisma.delivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
                publish.mockClear();
                await pollOnce();

                expect(publish.mock.calls.map(([id]) => id)).not.toContain(delivery.id);
            });

            test('a successful send is still recorded as delivered', async () => {
                const endpoint = await makeEndpoint('https://httpbin.org/status/200');
                const delivery = await makeDelivery(endpoint.id, 0);
                disableDuringSend(endpoint.id, 200);

                await handleDelivery(delivery.id);

                const fresh = await prisma.delivery.findUnique({ where: { id: delivery.id } });
                expect(fresh.status).toBe('delivered');
            });
        });
    });
});
