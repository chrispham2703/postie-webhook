const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const apiKeyRouter = require('../src/routes/apiKeys.js');
const { sign } = require('../src/utils/jwt.js');

const prisma = new PrismaClient();

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/api-keys', apiKeyRouter);
    return app;
}

describe('/api/api-keys (integration, needs docker compose up)', () => {
    const orgId = `org_apikeytest_${crypto.randomUUID()}`;
    let ownerToken;
    let memberToken;
    let createdKeyId;

    beforeAll(async () => {
        await prisma.organization.create({
            data: { id: orgId, name: 'API Key Test Org', slug: `apikey-test-${Date.now()}` },
        });
        ownerToken = sign({ id: 'u1', orgId, role: 'owner' });
        memberToken = sign({ id: 'u2', orgId, role: 'member' });
    });

    afterAll(async () => {
        await prisma.apiKey.deleteMany({ where: { orgId } });
        await prisma.organization.delete({ where: { id: orgId } });
        await prisma.$disconnect();
    });

    test('401s with no token', async () => {
        const res = await request(buildApp()).get('/api/api-keys');
        expect(res.status).toBe(401);
    });

    test('member cannot create a key', async () => {
        const res = await request(buildApp())
            .post('/api/api-keys')
            .set('Authorization', `Bearer ${memberToken}`)
            .send({ name: 'should fail' });
        expect(res.status).toBe(403);
    });

    test('owner can create a key, raw key shown once', async () => {
        const res = await request(buildApp())
            .post('/api/api-keys')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'ci key' });

        expect(res.status).toBe(201);
        expect(res.body.data.key).toMatch(/^postie_/);
        createdKeyId = res.body.data.id;
    });

    test('list never includes the raw key or its hash', async () => {
        const res = await request(buildApp()).get('/api/api-keys').set('Authorization', `Bearer ${memberToken}`);
        expect(res.status).toBe(200);
        const found = res.body.data.find((k) => k.id === createdKeyId);
        expect(found).toBeDefined();
        expect(found.key).toBeUndefined();
        expect(found.keyHash).toBeUndefined();
    });

    test('member cannot delete a key, owner can', async () => {
        const forbidden = await request(buildApp())
            .delete(`/api/api-keys/${createdKeyId}`)
            .set('Authorization', `Bearer ${memberToken}`);
        expect(forbidden.status).toBe(403);

        const ok = await request(buildApp())
            .delete(`/api/api-keys/${createdKeyId}`)
            .set('Authorization', `Bearer ${ownerToken}`);
        expect(ok.status).toBe(204);
    });
});
