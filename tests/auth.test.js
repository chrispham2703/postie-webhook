const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const authRouter = require('../src/routes/auth.js');

const prisma = new PrismaClient();

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    return app;
}

// Needs the real Postgres from docker-compose (no isolated test DB yet).
describe('POST /api/auth/signup and /login', () => {
    const email = `test-${crypto.randomUUID()}@example.com`;
    const password = 'password123';
    let createdOrgId;

    afterAll(async () => {
        if (createdOrgId) {
            await prisma.user.deleteMany({ where: { orgId: createdOrgId } });
            await prisma.organization.delete({ where: { id: createdOrgId } });
        }
        await prisma.$disconnect();
    });

    test('signup creates an org + owner user and returns a token', async () => {
        const res = await request(buildApp())
            .post('/api/auth/signup')
            .send({ orgName: 'Auth Test Co', email, password });

        expect(res.status).toBe(201);
        expect(res.body.data.token).toBeDefined();
        expect(res.body.data.user.role).toBe('owner');
        createdOrgId = res.body.data.org.id;
    });

    test('signup with an already-used email 409s', async () => {
        const res = await request(buildApp())
            .post('/api/auth/signup')
            .send({ orgName: 'Another Co', email, password });

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    test('login with correct credentials returns a token', async () => {
        const res = await request(buildApp()).post('/api/auth/login').send({ email, password });
        expect(res.status).toBe(200);
        expect(res.body.data.token).toBeDefined();
    });

    test('login with wrong password 401s', async () => {
        const res = await request(buildApp()).post('/api/auth/login').send({ email, password: 'wrong-password' });
        expect(res.status).toBe(401);
    });
});
