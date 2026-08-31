const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const applicationRouter = require('../src/routes/applications.js');
const { hashKey } = require('../src/middleware/apiKeyAuth.js');

const prisma = new PrismaClient();

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/applications', applicationRouter);
    return app;
}

describe('/api/applications (integration, needs docker compose up)', () => {
    const orgId = `org_apptest_${crypto.randomUUID()}`;
    const rawKey = `test_${crypto.randomUUID()}`;
    let createdId;

    beforeAll(async () => {
        await prisma.organization.create({
            data: { id: orgId, name: 'Application Test Org', slug: `app-test-${Date.now()}` },
        });
        await prisma.apiKey.create({
            data: {
                id: `key_${crypto.randomUUID()}`,
                keyHash: hashKey(rawKey),
                prefix: rawKey.slice(0, 12),
                name: 'app test key',
                orgId,
            },
        });
    });

    afterAll(async () => {
        await prisma.application.deleteMany({ where: { orgId } });
        await prisma.apiKey.deleteMany({ where: { orgId } });
        await prisma.organization.delete({ where: { id: orgId } });
        await prisma.$disconnect();
    });

    test('401s with no auth', async () => {
        const res = await request(buildApp()).get('/api/applications');
        expect(res.status).toBe(401);
    });

    test('creates an application for the org', async () => {
        const res = await request(buildApp())
            .post('/api/applications')
            .set('Authorization', `Bearer ${rawKey}`)
            .send({ name: 'My App' });

        expect(res.status).toBe(201);
        expect(res.body.data.orgId).toBe(orgId);
        createdId = res.body.data.id;
    });

    test('lists it back', async () => {
        const res = await request(buildApp()).get('/api/applications').set('Authorization', `Bearer ${rawKey}`);
        expect(res.status).toBe(200);
        expect(res.body.data.some((a) => a.id === createdId)).toBe(true);
    });

    test('lists endpoints for the application', async () => {
        const endpoint = await prisma.endpoint.create({
            data: {
                id: `ep_${crypto.randomUUID()}`,
                appId: createdId,
                url: 'https://httpbin.org/post',
                secret: `whsec_${crypto.randomUUID()}`,
            },
        });

        const res = await request(buildApp())
            .get(`/api/applications/${createdId}/endpoints`)
            .set('Authorization', `Bearer ${rawKey}`);

        expect(res.status).toBe(200);
        expect(res.body.data.some((e) => e.id === endpoint.id)).toBe(true);
    });

    test('404s for an application id that does not exist', async () => {
        const res = await request(buildApp())
            .get('/api/applications/app_does_not_exist/endpoints')
            .set('Authorization', `Bearer ${rawKey}`);
        expect(res.status).toBe(404);
    });

    test('a different org cannot see it', async () => {
        const otherKey = `other_${crypto.randomUUID()}`;
        const otherOrgId = `org_apptest_other_${crypto.randomUUID()}`;
        await prisma.organization.create({
            data: { id: otherOrgId, name: 'Other Org', slug: `app-test-other-${Date.now()}` },
        });
        await prisma.apiKey.create({
            data: {
                id: `key_${crypto.randomUUID()}`,
                keyHash: hashKey(otherKey),
                prefix: otherKey.slice(0, 12),
                name: 'other org key',
                orgId: otherOrgId,
            },
        });

        const res = await request(buildApp())
            .get(`/api/applications/${createdId}`)
            .set('Authorization', `Bearer ${otherKey}`);
        expect(res.status).toBe(404);

        await prisma.apiKey.deleteMany({ where: { orgId: otherOrgId } });
        await prisma.organization.delete({ where: { id: otherOrgId } });
    });
});
