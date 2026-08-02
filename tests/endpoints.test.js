const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const endpointRouter = require('../src/routes/endpoints.js');
const { hashKey } = require('../src/middleware/apiKeyAuth.js');

const prisma = new PrismaClient();
const VALID_KEY = 'postie_test_key_do_not_use_in_prod';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/endpoints', endpointRouter);
    return app;
}

describe('POST /api/endpoints', () => {
    test('401s with no Authorization header', async () => {
        const res = await request(buildApp()).post('/api/endpoints').send({});
        expect(res.status).toBe(401);
    });
});

// Needs the real Postgres from docker-compose, seeded via `node prisma/seed.js`.
describe('/api/endpoints (integration, needs docker compose up + seed)', () => {
    let createdId;

    test('creates an endpoint for an owned app', async () => {
        const res = await request(buildApp())
            .post('/api/endpoints')
            .set('Authorization', `Bearer ${VALID_KEY}`)
            .send({ appId: 'app_test_1', url: 'https://httpbin.org/post', filterTypes: ['order.shipped'] });

        expect(res.status).toBe(201);
        expect(res.body.data.secret).toMatch(/^whsec_/);
        createdId = res.body.data.id;
    });

    test('lists it back for the owning org', async () => {
        const res = await request(buildApp()).get('/api/endpoints').set('Authorization', `Bearer ${VALID_KEY}`);
        expect(res.status).toBe(200);
        expect(res.body.data.some((e) => e.id === createdId)).toBe(true);
    });

    test('PATCH can disable it without deleting it', async () => {
        const res = await request(buildApp())
            .patch(`/api/endpoints/${createdId}`)
            .set('Authorization', `Bearer ${VALID_KEY}`)
            .send({ disabled: true });

        expect(res.status).toBe(200);
        expect(res.body.data.disabled).toBe(true);
    });

    describe('cross-org isolation', () => {
        const otherOrgId = 'org_test_isolation_temp';
        const otherRawKey = `temp_${crypto.randomUUID()}`;

        beforeAll(async () => {
            const org = await prisma.organization.create({
                data: { id: otherOrgId, name: 'Isolation Test Org', slug: `isolation-test-${Date.now()}` },
            });
            await prisma.apiKey.create({
                data: {
                    id: `key_${crypto.randomUUID()}`,
                    keyHash: hashKey(otherRawKey),
                    prefix: otherRawKey.slice(0, 12),
                    name: 'isolation test key',
                    orgId: org.id,
                },
            });
        });

        afterAll(async () => {
            await prisma.apiKey.deleteMany({ where: { orgId: otherOrgId } });
            await prisma.organization.delete({ where: { id: otherOrgId } });
            await prisma.$disconnect();
        });

        test('a different org cannot see this endpoint', async () => {
            const list = await request(buildApp()).get('/api/endpoints').set('Authorization', `Bearer ${otherRawKey}`);
            expect(list.body.data.some((e) => e.id === createdId)).toBe(false);

            const get = await request(buildApp())
                .get(`/api/endpoints/${createdId}`)
                .set('Authorization', `Bearer ${otherRawKey}`);
            expect(get.status).toBe(404);
        });
    });
});
