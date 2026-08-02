const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function create({ orgId, name, uid }) {
    return prisma.application.create({
        data: {
            id: `app_${crypto.randomUUID()}`,
            orgId,
            name,
            uid: uid ?? null,
        },
    });
}

async function findAllForOrg(orgId) {
    return prisma.application.findMany({ where: { orgId } });
}

async function findByIdForOrg(id, orgId) {
    return prisma.application.findFirst({ where: { id, orgId } });
}

module.exports = { create, findAllForOrg, findByIdForOrg };
