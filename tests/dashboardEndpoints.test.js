const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const dashboardEndpointsRouter = require('../src/routes/dashboardEndpoints.js');
const axios = require('axios');
const { createDeliveries } = require('../src/services/deliveryService.js');
const { handleDelivery } = require('../src/workers/deliveryWorker.js');
const { sign } = require('../src/utils/jwt.js');
const { hashKey } = require('../src/middleware/apiKeyAuth.js');

const prisma = new PrismaClient();

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/dashboard/endpoints', dashboardEndpointsRouter);
    return app;
}

describe('/api/dashboard/endpoints (integration, needs docker compose up)', () => {
    const orgId = `org_dashep_${crypto.randomUUID()}`;
    const otherOrgId = `org_dashep_other_${crypto.randomUUID()}`;
    const appId = `app_${crypto.randomUUID()}`;
    const secondAppId = `app_${crypto.randomUUID()}`;
    const otherAppId = `app_${crypto.randomUUID()}`;
    const rawKey = `test_${crypto.randomUUID()}`;
    let ownerToken;
    let adminToken;
    let memberToken;
    let otherOrgToken;
    let createdId;

    beforeAll(async () => {
        await prisma.organization.create({
            data: { id: orgId, name: 'Dashboard Endpoint Test Org', slug: `dash-ep-test-${Date.now()}` },
        });
        await prisma.organization.create({
            data: { id: otherOrgId, name: 'Dashboard Endpoint Other Org', slug: `dash-ep-other-${Date.now()}` },
        });
        await prisma.application.createMany({
            data: [
                { id: appId, orgId, name: 'Endpoint Test App' },
                { id: secondAppId, orgId, name: 'Second Endpoint Test App' },
                { id: otherAppId, orgId: otherOrgId, name: 'Other Org App' },
            ],
        });
        await prisma.apiKey.create({
            data: {
                id: `key_${crypto.randomUUID()}`,
                keyHash: hashKey(rawKey),
                prefix: rawKey.slice(0, 12),
                name: 'dashboard endpoint test key',
                orgId,
            },
        });
        ownerToken = sign({ id: 'u1', orgId, role: 'owner' });
        adminToken = sign({ id: 'u2', orgId, role: 'admin' });
        memberToken = sign({ id: 'u3', orgId, role: 'member' });
        otherOrgToken = sign({ id: 'u4', orgId: otherOrgId, role: 'owner' });
    });

    afterAll(async () => {
        // org delete cascades to apps, endpoints, events and deliveries
        await prisma.apiKey.deleteMany({ where: { orgId } });
        await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
        await prisma.$disconnect();
    });

    function as(token) {
        return {
            get: (path) => request(buildApp()).get(`/api/dashboard/endpoints${path}`).set('Authorization', `Bearer ${token}`),
            post: (body) => request(buildApp()).post('/api/dashboard/endpoints').set('Authorization', `Bearer ${token}`).send(body),
            patch: (id, body) => request(buildApp()).patch(`/api/dashboard/endpoints/${id}`).set('Authorization', `Bearer ${token}`).send(body),
        };
    }

    describe('auth', () => {
        test('401s with no login', async () => {
            const res = await request(buildApp()).get('/api/dashboard/endpoints');
            expect(res.status).toBe(401);
        });

        test('401s with a bad JWT', async () => {
            const res = await as('not.a.jwt').get('');
            expect(res.status).toBe(401);
        });

        test('401s with an API key instead of a login', async () => {
            const res = await as(rawKey).get('');
            expect(res.status).toBe(401);
        });
    });

    describe('create', () => {
        test('member cannot create an endpoint', async () => {
            const res = await as(memberToken).post({ appId, url: 'https://httpbin.org/post' });
            expect(res.status).toBe(403);
        });

        test('owner creates one and sees the secret once', async () => {
            const res = await as(ownerToken).post({ appId, url: 'https://httpbin.org/post', filterTypes: ['order.created'] });

            expect(res.status).toBe(201);
            expect(res.body.data.appId).toBe(appId);
            expect(res.body.data.secret).toMatch(/^whsec_/);
            createdId = res.body.data.id;
        });

        test('admin can create one too', async () => {
            const res = await as(adminToken).post({ appId: secondAppId, url: 'https://example.com/hook' });
            expect(res.status).toBe(201);
        });

        test('404s for another org\'s app', async () => {
            const res = await as(ownerToken).post({ appId: otherAppId, url: 'https://httpbin.org/post' });
            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('APPLICATION_NOT_FOUND');
        });

        test('404s for an app that does not exist', async () => {
            const res = await as(ownerToken).post({ appId: `app_${crypto.randomUUID()}`, url: 'https://httpbin.org/post' });
            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('APPLICATION_NOT_FOUND');
        });

        test.each([
            ['url is invalid', { url: 'not a url' }],
            ['url is an array', { url: ['https://httpbin.org/post', 'https://example.com'] }],
            ['url is a number', { url: 123 }],
            ['appId is an array', { appId: [appId, appId] }],
            ['filterTypes is not an array', { filterTypes: 'order.created' }],
        ])('422s when %s', async (_label, override) => {
            const res = await as(ownerToken).post({ appId, url: 'https://httpbin.org/post', ...override });
            expect(res.status).toBe(422);
        });
    });

    describe('read', () => {
        test('member lists it, without the secret', async () => {
            const res = await as(memberToken).get('');
            expect(res.status).toBe(200);
            const found = res.body.data.find((e) => e.id === createdId);
            expect(found).toBeDefined();
            expect(found.secret).toBeUndefined();
        });

        test('member gets it by id, without the secret', async () => {
            const res = await as(memberToken).get(`/${createdId}`);
            expect(res.status).toBe(200);
            expect(res.body.data.secret).toBeUndefined();
        });

        test.each([['owner'], ['admin']])('%s never sees the secret on GET either', async (role) => {
            const token = role === 'owner' ? ownerToken : adminToken;

            const list = await as(token).get('');
            expect(list.status).toBe(200);
            expect(list.body.data.length).toBeGreaterThan(0);
            expect(list.body.data.every((e) => e.secret === undefined)).toBe(true);

            const one = await as(token).get(`/${createdId}`);
            expect(one.status).toBe(200);
            expect(one.body.data.secret).toBeUndefined();
        });

        test('?appId= returns only that app\'s endpoints', async () => {
            const res = await as(memberToken).get(`?appId=${appId}`);
            expect(res.status).toBe(200);
            expect(res.body.data.length).toBeGreaterThan(0);
            expect(res.body.data.every((e) => e.appId === appId)).toBe(true);
            expect(res.body.data.every((e) => e.secret === undefined)).toBe(true);
        });

        test('?appId= with an empty value 422s instead of listing everything', async () => {
            const res = await as(memberToken).get('?appId=');
            expect(res.status).toBe(422);
        });

        test('?appId= of another org\'s app 404s', async () => {
            const res = await as(memberToken).get(`?appId=${otherAppId}`);
            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('APPLICATION_NOT_FOUND');
        });

        test('a different org cannot see it', async () => {
            expect(createdId).toBeDefined();

            const list = await as(otherOrgToken).get('');
            expect(list.body.data.some((e) => e.id === createdId)).toBe(false);
            expect(list.body.data.every((e) => e.secret === undefined)).toBe(true);

            const get = await as(otherOrgToken).get(`/${createdId}`);
            expect(get.status).toBe(404);
            expect(get.body.error.code).toBe('ENDPOINT_NOT_FOUND');
        });
    });

    describe('update', () => {
        test('member cannot update it', async () => {
            const res = await as(memberToken).patch(createdId, { description: 'member edit' });
            expect(res.status).toBe(403);
        });

        test('admin updates it, without the secret in the response', async () => {
            const res = await as(adminToken).patch(createdId, { description: 'admin edit', filterTypes: [] });
            expect(res.status).toBe(200);
            expect(res.body.data.description).toBe('admin edit');
            expect(res.body.data.secret).toBeUndefined();
        });

        test('appId in the body is ignored', async () => {
            const res = await as(ownerToken).patch(createdId, { appId: secondAppId, description: 'moved?' });
            expect(res.status).toBe(200);
            expect(res.body.data.appId).toBe(appId);
            expect(res.body.data.secret).toBeUndefined();
        });

        test('a different org cannot update it', async () => {
            // A: the endpoint really exists, so the 404 below comes from scoping
            expect(createdId).toBeDefined();
            const own = await as(ownerToken).get(`/${createdId}`);
            expect(own.status).toBe(200);

            const res = await as(otherOrgToken).patch(createdId, { description: 'hijack' });
            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('ENDPOINT_NOT_FOUND');
        });

        test('disabled: false is accepted', async () => {
            const res = await as(ownerToken).patch(createdId, { disabled: false });
            expect(res.status).toBe(200);
            expect(res.body.data.disabled).toBe(false);
            expect(res.body.data.secret).toBeUndefined();
        });

        test.each([['"true"', 'true'], ['1', 1], ['[true]', [true]]])(
            '422s when disabled is %s instead of a boolean',
            async (_label, disabled) => {
                const res = await as(ownerToken).patch(createdId, { disabled });
                expect(res.status).toBe(422);
            }
        );
    });

    describe('no hard delete', () => {
        test('DELETE is not a route, and the endpoint survives', async () => {
            const res = await request(buildApp())
                .delete(`/api/dashboard/endpoints/${createdId}`)
                .set('Authorization', `Bearer ${ownerToken}`);
            expect(res.status).toBe(404);

            const still = await prisma.endpoint.findUnique({ where: { id: createdId } });
            expect(still).not.toBeNull();
        });

        test('a member\'s DELETE gets 403 from the role rule, before any lookup', async () => {
            const res = await request(buildApp())
                .delete(`/api/dashboard/endpoints/${createdId}`)
                .set('Authorization', `Bearer ${memberToken}`);
            expect(res.status).toBe(403);
        });

        test('disabling it stops new events fanning out to it', async () => {
            function newEvent() {
                return prisma.event.create({
                    data: { id: `evt_${crypto.randomUUID()}`, appId, eventType: 'order.created', payload: { a: 1 } },
                });
            }

            // while enabled, it does get a delivery
            const before = await createDeliveries(await newEvent());
            expect(before.some((d) => d.endpointId === createdId)).toBe(true);

            const res = await as(ownerToken).patch(createdId, { disabled: true });
            expect(res.status).toBe(200);
            expect(res.body.data.disabled).toBe(true);
            expect(res.body.data.secret).toBeUndefined();

            const after = await createDeliveries(await newEvent());
            expect(after.some((d) => d.endpointId === createdId)).toBe(false);
        });
    });

    describe('disabling cancels deliveries still waiting', () => {
        let postSpy;

        beforeEach(() => {
            postSpy = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} });
        });

        afterEach(() => {
            postSpy.mockRestore();
        });

        async function endpointWithDeliveries() {
            const created = await as(ownerToken).post({ appId, url: 'https://httpbin.org/status/200' });
            const endpointId = created.body.data.id;
            const event = await prisma.event.create({
                data: { id: `evt_${crypto.randomUUID()}`, appId, eventType: 'order.created', payload: { a: 1 } },
            });
            const later = new Date(Date.now() + 6 * 60 * 60 * 1000);
            const [pending, delivered] = await Promise.all([
                prisma.delivery.create({
                    data: { id: `del_${crypto.randomUUID()}`, eventId: event.id, endpointId, attemptCount: 4, nextAttemptAt: later },
                }),
                prisma.delivery.create({
                    data: { id: `del_${crypto.randomUUID()}`, eventId: (await prisma.event.create({
                        data: { id: `evt_${crypto.randomUUID()}`, appId, eventType: 'order.created', payload: { a: 2 } },
                    })).id, endpointId, attemptCount: 1, status: 'delivered' },
                }),
            ]);
            return { endpointId, pending, delivered };
        }

        function statusOf(id) {
            return prisma.delivery.findUnique({ where: { id } });
        }

        test('PATCH disabled: true cancels pending deliveries right away, and leaves finished ones alone', async () => {
            const { endpointId, pending, delivered } = await endpointWithDeliveries();

            const res = await as(ownerToken).patch(endpointId, { disabled: true });
            expect(res.status).toBe(200);

            const freshPending = await statusOf(pending.id);
            expect(freshPending.status).toBe('cancelled');
            expect(freshPending.nextAttemptAt).toBeNull();
            expect((await statusOf(delivered.id)).status).toBe('delivered');
        });

        test('disable then re-enable before the worker runs: the delivery is still never sent', async () => {
            const { endpointId, pending } = await endpointWithDeliveries();

            await as(ownerToken).patch(endpointId, { disabled: true });
            await as(ownerToken).patch(endpointId, { disabled: false });
            await handleDelivery(pending.id);

            expect(postSpy).not.toHaveBeenCalled();
            expect((await statusOf(pending.id)).status).toBe('cancelled');
        });

        test('a PATCH that does not disable leaves pending deliveries alone', async () => {
            const { endpointId, pending } = await endpointWithDeliveries();

            await as(ownerToken).patch(endpointId, { description: 'just a rename' });
            await as(ownerToken).patch(endpointId, { disabled: false });

            expect((await statusOf(pending.id)).status).toBe('pending');
        });

        test('a rejected PATCH (422, or 404 from another org) leaves pending deliveries alone', async () => {
            const { endpointId, pending } = await endpointWithDeliveries();

            const invalid = await as(ownerToken).patch(endpointId, { disabled: 'true' });
            expect(invalid.status).toBe(422);
            const crossOrg = await as(otherOrgToken).patch(endpointId, { disabled: true });
            expect(crossOrg.status).toBe(404);

            expect((await statusOf(pending.id)).status).toBe('pending');
        });

        test('disabling one endpoint does not cancel another endpoint\'s deliveries', async () => {
            const first = await endpointWithDeliveries();
            const second = await endpointWithDeliveries();

            await as(ownerToken).patch(first.endpointId, { disabled: true });

            expect((await statusOf(second.pending.id)).status).toBe('pending');
        });
    });
});
