const { PrismaClient } = require('@prisma/client');
const { hashKey } = require('../src/middleware/apiKeyAuth');
const prisma = new PrismaClient();

// Fixed for local dev only, so re-running seed always gives you the same
// key to test with (real keys would be randomly generated at issue time).
const TEST_RAW_API_KEY = 'postie_test_key_do_not_use_in_prod';

async function main() {
    const org = await prisma.organization.upsert({
        where: { slug: 'test-org' },
        update: {},
        create: {
            id: 'org_test_1',
            name: 'Test Organization',
            slug: 'test-org',
        },
    });

    const app = await prisma.application.upsert({
        where: { orgId_uid: { orgId: org.id, uid: 'test-app' } },
        update: {},
        create: {
            id: 'app_test_1',
            orgId: org.id,
            name: 'Test Application',
            uid: 'test-app',
        },
    });

    const endpoint = await prisma.endpoint.upsert({
        where: { id: 'ep_test_1' },
        update: {},
        create: {
            id: 'ep_test_1',
            appId: app.id,
            url: 'https://httpbin.org/post',
            secret: 'whsec_test_1',
            filterTypes: [],
        },
    });

    const keyHash = hashKey(TEST_RAW_API_KEY);
    await prisma.apiKey.upsert({
        where: { keyHash },
        update: {},
        create: {
            id: 'key_test_1',
            keyHash,
            prefix: TEST_RAW_API_KEY.slice(0, 12),
            name: 'Local dev test key',
            orgId: org.id,
        },
    });

    console.log('Seeded:', { org: org.id, app: app.id, endpoint: endpoint.id });
    console.log(`Test API key (send as "Authorization: Bearer ${TEST_RAW_API_KEY}"):`, TEST_RAW_API_KEY);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
