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
});
