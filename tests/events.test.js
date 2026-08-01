const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const eventRouter = require('../src/routes/events');
const { connect, close } = require('../src/config/rabbitmq');

const prisma = new PrismaClient();

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/events', eventRouter);
    return app;
}

describe('POST /api/events', () => {
    test('422s when a required field is missing', async () => {
        const app = buildApp();
        const res = await request(app).post('/api/events').send({ eventType: 'order.created' });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
});

// These need the real Postgres + RabbitMQ from docker-compose (same ones the
// app/worker use in dev) — there's no isolated test database yet.
describe('POST /api/events (integration, needs docker compose up)', () => {
    beforeAll(async () => {
        await connect();
    });

    afterAll(async () => {
        await close();
        await prisma.$disconnect();
    });

    test('creates the event and fans it out to matching endpoints as Deliveries', async () => {
        const app = buildApp();
        const res = await request(app).post('/api/events').send({
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
