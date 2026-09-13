const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const dashboardEventsRouter = require('../src/routes/dashboardEvents.js');
const { sign } = require('../src/utils/jwt.js');

const prisma = new PrismaClient();

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/dashboard/events', dashboardEventsRouter);
    return app;
}

// Uses the seed org ('org_test_1' / 'app_test_1' from prisma/seed.js) rather
// than an isolated test DB, per CLAUDE.md. Also spins up one throwaway org to
// prove events don't leak across orgs.
describe('/api/dashboard/events (integration, needs docker compose up + seed)', () => {
    const orgId = 'org_test_1';
    let token;
    let eventId1;
    let eventId2;

    const otherOrgId = `org_dashevttest_${crypto.randomUUID()}`;
    let otherToken;
    let otherEventId;

    beforeAll(async () => {
        token = sign({ id: 'u_dash_test', orgId, role: 'owner' });

        eventId1 = `evt_dashtest_${crypto.randomUUID()}`;
        eventId2 = `evt_dashtest_${crypto.randomUUID()}`;
        await prisma.event.create({
            data: { id: eventId1, appId: 'app_test_1', eventType: 'dashboard.test', payload: { seq: 1 } },
        });
        await prisma.event.create({
            data: { id: eventId2, appId: 'app_test_1', eventType: 'dashboard.test', payload: { seq: 2 } },
        });

        await prisma.organization.create({
            data: { id: otherOrgId, name: 'Dashboard Events Other Org', slug: `dash-evt-other-${Date.now()}` },
        });
        const otherApp = await prisma.application.create({
            data: {
                id: `app_${crypto.randomUUID()}`,
                orgId: otherOrgId,
                name: 'Other App',
                uid: `other-app-${Date.now()}`,
            },
        });
        otherEventId = `evt_${crypto.randomUUID()}`;
        await prisma.event.create({
            data: { id: otherEventId, appId: otherApp.id, eventType: 'other.event', payload: {} },
        });
        otherToken = sign({ id: 'u_other', orgId: otherOrgId, role: 'owner' });
    });

    afterAll(async () => {
        await prisma.event.deleteMany({ where: { id: { in: [eventId1, eventId2, otherEventId] } } });
        await prisma.application.deleteMany({ where: { orgId: otherOrgId } });
        await prisma.organization.delete({ where: { id: otherOrgId } });
        await prisma.$disconnect();
    });

    test('401s with no Authorization header', async () => {
        const res = await request(buildApp()).get('/api/dashboard/events');
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    test('401s with a malformed Authorization header (no Bearer scheme)', async () => {
        const res = await request(buildApp())
            .get('/api/dashboard/events')
            .set('Authorization', 'not-a-bearer-header');
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    test('401s with an invalid/bogus token', async () => {
        const res = await request(buildApp())
            .get('/api/dashboard/events')
            .set('Authorization', 'Bearer this.is.not.a.valid.jwt');
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    test('lists events for the caller org, including deliveries, in a paginated envelope', async () => {
        const res = await request(buildApp())
            .get('/api/dashboard/events')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.meta).toHaveProperty('hasMore');
        expect(res.body.meta).toHaveProperty('nextCursor');

        const found = res.body.data.find((e) => e.id === eventId1);
        expect(found).toBeDefined();
        expect(Array.isArray(found.deliveries)).toBe(true);

        expect(res.body.data.some((e) => e.id === otherEventId)).toBe(false);
    });

    test('paginates with limit and returns a nextCursor when more rows remain', async () => {
        const res = await request(buildApp())
            .get('/api/dashboard/events')
            .query({ limit: 1 })
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.meta.hasMore).toBe(true);
        expect(res.body.meta.nextCursor).toBe(res.body.data[0].id);
    });

    test('does not leak org_test_1 events to a different org', async () => {
        const res = await request(buildApp())
            .get('/api/dashboard/events')
            .set('Authorization', `Bearer ${otherToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.some((e) => e.id === eventId1)).toBe(false);
        expect(res.body.data.some((e) => e.id === otherEventId)).toBe(true);
    });
});
