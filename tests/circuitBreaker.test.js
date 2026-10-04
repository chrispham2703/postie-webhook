const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { canCallEndpoint, recordFailure, recordSuccess } = require('../src/services/circuitBreakerService');

const prisma = new PrismaClient();

// Needs the real Postgres from docker-compose, seeded via `node prisma/seed.js`.
describe('circuit breaker (integration, needs docker compose up + seed)', () => {
    async function makeEndpoint(overrides = {}) {
        return prisma.endpoint.create({
            data: {
                id: `ep_cbtest_${crypto.randomUUID()}`,
                appId: 'app_test_1',
                url: 'https://httpbin.org/post',
                secret: 'whsec_test',
                filterTypes: [],
                ...overrides,
            },
        });
    }

    afterEach(async () => {
        await prisma.endpoint.deleteMany({ where: { id: { startsWith: 'ep_cbtest_' } } });
    });

    describe('recordFailure — closed -> open', () => {
        test('a single failure on a fresh endpoint does not trip it', async () => {
            const endpoint = await makeEndpoint();
            await recordFailure(endpoint.id, new Date());
            const fresh = await prisma.endpoint.findUnique({ where: { id: endpoint.id } });
            expect(fresh.failureCount).toBe(1);
            expect(fresh.status).toBe('active');
        });

        test('5 failures within 60s trips the breaker', async () => {
            const endpoint = await makeEndpoint();
            const t0 = Date.now();
            for (let i = 0; i < 5; i++) {
                await recordFailure(endpoint.id, new Date(t0 + i * 1000));
            }
            const fresh = await prisma.endpoint.findUnique({ where: { id: endpoint.id } });
            expect(fresh.failureCount).toBe(5);
            expect(fresh.status).toBe('paused');
            expect(fresh.pausedUntil.getTime()).toBeGreaterThan(Date.now());
        });

        test('failures more than 60s apart reset the count instead of accumulating', async () => {
            const endpoint = await makeEndpoint();
            const t0 = Date.now();
            await recordFailure(endpoint.id, new Date(t0));
            await recordFailure(endpoint.id, new Date(t0 + 61_000)); // >60s later
            const fresh = await prisma.endpoint.findUnique({ where: { id: endpoint.id } });
            expect(fresh.failureCount).toBe(1);
            expect(fresh.status).toBe('active');
        });
    });

    describe('recordSuccess — any success -> closed', () => {
        test('resets a paused endpoint back to healthy', async () => {
            const endpoint = await makeEndpoint({
                status: 'paused',
                failureCount: 5,
                failureSince: new Date(),
                pausedUntil: new Date(Date.now() + 60_000),
            });
            await recordSuccess(endpoint.id);
            const fresh = await prisma.endpoint.findUnique({ where: { id: endpoint.id } });
            expect(fresh).toMatchObject({ status: 'active', failureCount: 0, failureSince: null, pausedUntil: null });
        });
    });

    describe('canCallEndpoint', () => {
        test('active endpoint: allowed, not a probe', async () => {
            const endpoint = await makeEndpoint();
            const decision = await canCallEndpoint(endpoint.id, new Date());
            expect(decision).toEqual({ allowed: true, isProbe: false });
        });

        test('paused endpoint, still within the pause window: blocked', async () => {
            const endpoint = await makeEndpoint({ status: 'paused', pausedUntil: new Date(Date.now() + 60_000) });
            const decision = await canCallEndpoint(endpoint.id, new Date());
            expect(decision.allowed).toBe(false);
        });

        test('paused endpoint, pause window elapsed: allowed as a probe, and claims the slot', async () => {
            const endpoint = await makeEndpoint({ status: 'paused', pausedUntil: new Date(Date.now() - 1) });
            const first = await canCallEndpoint(endpoint.id, new Date());
            expect(first).toEqual({ allowed: true, isProbe: true });

            // The slot being "claimed" means a second caller right after sees
            // it as not-yet-due instead of also getting isProbe: true.
            const second = await canCallEndpoint(endpoint.id, new Date());
            expect(second.allowed).toBe(false);
        });
    });
});
