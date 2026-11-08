const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const eventRouter = require('../src/routes/events');
const { connect, close } = require('../src/config/rabbitmq');

const prisma = new PrismaClient();

// Must match the key prisma/seed.js creates for 'org_test_1' — these tests
// need the real Postgres + RabbitMQ from docker-compose (no isolated test
// DB yet), seeded via `node prisma/seed.js` before running `npm test`.
const VALID_KEY = 'postie_test_key_do_not_use_in_prod';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/events', eventRouter);
    return app;
}

describe('POST /api/events auth', () => {
    test('401s with no Authorization header', async () => {
        const res = await request(buildApp()).post('/api/events').send({ eventType: 'order.created' });
        expect(res.status).toBe(401);
    });

    test('401s with a bogus API key', async () => {
        const res = await request(buildApp())
            .post('/api/events')
            .set('Authorization', 'Bearer not-a-real-key')
            .send({ eventType: 'order.created' });
        expect(res.status).toBe(401);
    });
});

describe('POST /api/events (integration, needs docker compose up + seed)', () => {
    beforeAll(async () => {
        await connect();
    });

    afterAll(async () => {
        await close();
        await prisma.$disconnect();
    });

    test('422s when a required field is missing', async () => {
        const res = await request(buildApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${VALID_KEY}`)
            .send({ eventType: 'order.created' });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    test('422s when appId is an array', async () => {
        const res = await request(buildApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${VALID_KEY}`)
            .send({ appId: ['app_test_1', 'app_test_1'], eventType: 'order.created', payload: { a: 1 } });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    test('422s when eventType is a number', async () => {
        const res = await request(buildApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${VALID_KEY}`)
            .send({ appId: 'app_test_1', eventType: 123, payload: { a: 1 } });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    test('422s when messageId is a number', async () => {
        const res = await request(buildApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${VALID_KEY}`)
            .send({ appId: 'app_test_1', eventType: 'order.created', payload: { a: 1 }, messageId: 123 });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    test('422s when messageId is longer than 255 characters', async () => {
        const res = await request(buildApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${VALID_KEY}`)
            .send({ appId: 'app_test_1', eventType: 'order.created', payload: { a: 1 }, messageId: 'x'.repeat(256) });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    test('404s when appId belongs to a different org (or does not exist)', async () => {
        const res = await request(buildApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${VALID_KEY}`)
            .send({ appId: 'app_does_not_exist', eventType: 'order.created', payload: { a: 1 } });

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('APPLICATION_NOT_FOUND');
    });

    test('creates the event and fans it out to matching endpoints as Deliveries', async () => {
        const res = await request(buildApp())
            .post('/api/events')
            .set('Authorization', `Bearer ${VALID_KEY}`)
            .send({
                appId: 'app_test_1',
                eventType: 'order.created',
                payload: { orderId: 'test-order' },
            });

        expect(res.status).toBe(201);
        const eventId = res.body.data.id;

        const deliveries = await prisma.delivery.findMany({ where: { eventId } });
        const endpoints = await prisma.endpoint.findMany({
            where: { appId: 'app_test_1', disabled: false },
        });
        const expectedCount = endpoints.filter(
            (e) => e.filterTypes.length === 0 || e.filterTypes.includes('order.created')
        ).length;

        expect(deliveries.length).toBe(expectedCount);
    });

    describe('messageId idempotency', () => {
        let otherApp;

        beforeAll(async () => {
            otherApp = await prisma.application.create({
                data: { id: `app_${crypto.randomUUID()}`, orgId: 'org_test_1', name: 'Idempotency Test App' },
            });
        });

        afterAll(async () => {
            await prisma.application.delete({ where: { id: otherApp.id } }); // cascades events/deliveries
        });

        function postEvent(body) {
            return request(buildApp())
                .post('/api/events')
                .set('Authorization', `Bearer ${VALID_KEY}`)
                .send({ eventType: 'order.created', payload: { orderId: 'idem' }, ...body });
        }

        test('returns the original event with 200 when the same messageId is sent twice to the same app', async () => {
            const messageId = `order-${crypto.randomUUID()}`;

            const first = await postEvent({ appId: 'app_test_1', messageId });
            expect(first.status).toBe(201);
            const deliveriesAfterFirst = await prisma.delivery.count({ where: { eventId: first.body.data.id } });

            const second = await postEvent({ appId: 'app_test_1', messageId });
            expect(second.status).toBe(200);
            expect(second.body.data.id).toBe(first.body.data.id);

            const eventCount = await prisma.event.count({ where: { appId: 'app_test_1', messageId } });
            expect(eventCount).toBe(1);
            const deliveriesAfterSecond = await prisma.delivery.count({ where: { eventId: first.body.data.id } });
            expect(deliveriesAfterSecond).toBe(deliveriesAfterFirst);
        });

        test('treats the same messageId on two different apps as separate events', async () => {
            const messageId = `order-${crypto.randomUUID()}`;

            const a = await postEvent({ appId: 'app_test_1', messageId });
            const b = await postEvent({ appId: otherApp.id, messageId });

            expect(a.status).toBe(201);
            expect(b.status).toBe(201);
            expect(b.body.data.id).not.toBe(a.body.data.id);
        });

        test('creates a new event every time when no messageId is sent', async () => {
            const first = await postEvent({ appId: 'app_test_1' });
            const second = await postEvent({ appId: 'app_test_1' });

            expect(first.status).toBe(201);
            expect(second.status).toBe(201);
            expect(second.body.data.id).not.toBe(first.body.data.id);
        });

        test('treats messageId: "" as no messageId', async () => {
            const first = await postEvent({ appId: otherApp.id, messageId: '' });
            const second = await postEvent({ appId: otherApp.id, messageId: '' });

            expect(first.status).toBe(201);
            expect(second.status).toBe(201);
            expect(second.body.data.id).not.toBe(first.body.data.id);
            expect(first.body.data.messageId).toBeNull();
        });

        test('treats messageId: null as no messageId', async () => {
            const first = await postEvent({ appId: otherApp.id, messageId: null });
            const second = await postEvent({ appId: otherApp.id, messageId: null });

            expect(first.status).toBe(201);
            expect(second.status).toBe(201);
            expect(second.body.data.id).not.toBe(first.body.data.id);
            expect(first.body.data.messageId).toBeNull();
        });

        test('concurrent requests with the same messageId create one event and never 500', async () => {
            const messageId = `order-${crypto.randomUUID()}`;

            const results = await Promise.all([
                postEvent({ appId: 'app_test_1', messageId }),
                postEvent({ appId: 'app_test_1', messageId }),
            ]);

            const statuses = results.map((r) => r.status).sort();
            expect(statuses).toEqual([200, 201]);
            expect(results[0].body.data.id).toBe(results[1].body.data.id);
        });
    });
});
