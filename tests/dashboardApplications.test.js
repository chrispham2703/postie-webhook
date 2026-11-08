const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const dashboardApplicationsRouter = require('../src/routes/dashboardApplications.js');
const { sign } = require('../src/utils/jwt.js');
const { hashKey } = require('../src/middleware/apiKeyAuth.js');

const prisma = new PrismaClient();

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/dashboard/applications', dashboardApplicationsRouter);
    return app;
}

describe('/api/dashboard/applications (integration, needs docker compose up)', () => {
    const orgId = `org_dashapp_${crypto.randomUUID()}`;
    const rawKey = `test_${crypto.randomUUID()}`;
    let ownerToken;
    let memberToken;
    let adminToken;
    let createdId;

    beforeAll(async () => {
        await prisma.organization.create({
            data: { id: orgId, name: 'Dashboard Application Test Org', slug: `dash-app-test-${Date.now()}` },
        });
        await prisma.apiKey.create({
            data: {
                id: `key_${crypto.randomUUID()}`,
                keyHash: hashKey(rawKey),
                prefix: rawKey.slice(0, 12),
                name: 'dashboard app test key',
                orgId,
            },
        });
        ownerToken = sign({ id: 'u1', orgId, role: 'owner' });
        memberToken = sign({ id: 'u2', orgId, role: 'member' });
        adminToken = sign({ id: 'u4', orgId, role: 'admin' });
    });

    afterAll(async () => {
        await prisma.application.deleteMany({ where: { orgId } });
        await prisma.apiKey.deleteMany({ where: { orgId } });
        await prisma.organization.delete({ where: { id: orgId } });
        await prisma.$disconnect();
    });

    test('401s with no login', async () => {
        const res = await request(buildApp()).get('/api/dashboard/applications');
        expect(res.status).toBe(401);
    });

    test('401s with an API key instead of a login', async () => {
        // a key that works on /api/applications still can't open the dashboard
        const res = await request(buildApp())
            .get('/api/dashboard/applications')
            .set('Authorization', `Bearer ${rawKey}`);
        expect(res.status).toBe(401);
    });

    test('member cannot create an application', async () => {
        const res = await request(buildApp())
            .post('/api/dashboard/applications')
            .set('Authorization', `Bearer ${memberToken}`)
            .send({ name: 'Member App' });

        expect(res.status).toBe(403);
    });

    test('owner creates an application for the org', async () => {
        const res = await request(buildApp())
            .post('/api/dashboard/applications')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'My App' });

        expect(res.status).toBe(201);
        expect(res.body.data.orgId).toBe(orgId);
        createdId = res.body.data.id;
    });

    test('admin can create an application too', async () => {
        const res = await request(buildApp())
            .post('/api/dashboard/applications')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Admin App' });

        expect(res.status).toBe(201);
        expect(res.body.data.orgId).toBe(orgId);
    });

    test('member can list it back', async () => {
        const res = await request(buildApp())
            .get('/api/dashboard/applications')
            .set('Authorization', `Bearer ${memberToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data.some((a) => a.id === createdId)).toBe(true);
    });

    test('a different org cannot see it', async () => {
        // A: the app really exists
        expect(createdId).toBeDefined();

        // B: same org can see it
        const ownRes = await request(buildApp())
            .get(`/api/dashboard/applications/${createdId}`)
            .set('Authorization', `Bearer ${memberToken}`);
        expect(ownRes.status).toBe(200);

        // userAuth trusts the JWT's signature and never touches the database,
        // so the other org only needs to exist inside the token.
        const otherToken = sign({ id: 'u3', orgId: `org_dashapp_other_${crypto.randomUUID()}`, role: 'owner' });

        const res = await request(buildApp())
            .get(`/api/dashboard/applications/${createdId}`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(res.status).toBe(404);
    });

    test('two apps with uid: null both get created', async () => {
        const first = await request(buildApp())
            .post('/api/dashboard/applications')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'Null Uid A', uid: null });
        const second = await request(buildApp())
            .post('/api/dashboard/applications')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'Null Uid B', uid: null });

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(first.body.data.uid).toBeNull();
        expect(second.body.data.uid).toBeNull();
    });

    test('two apps with uid: "" both get created', async () => {
        const first = await request(buildApp())
            .post('/api/dashboard/applications')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'Empty Uid A', uid: '' });
        const second = await request(buildApp())
            .post('/api/dashboard/applications')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'Empty Uid B', uid: '' });

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(first.body.data.uid).toBeNull();
        expect(second.body.data.uid).toBeNull();
    });

    test('two apps with uid: "   " both get created', async () => {
        const first = await request(buildApp())
            .post('/api/dashboard/applications')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'Blank Uid A', uid: '   ' });
        const second = await request(buildApp())
            .post('/api/dashboard/applications')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'Blank Uid B', uid: '   ' });

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(first.body.data.uid).toBeNull();
        expect(second.body.data.uid).toBeNull();
    });

    test('422s when name is an array', async () => {
        const res = await request(buildApp())
            .post('/api/dashboard/applications')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: ['a', 'b'] });

        expect(res.status).toBe(422);
    });
});
