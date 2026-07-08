const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

    console.log('Seeded:', { org: org.id, app: app.id });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
