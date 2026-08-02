const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function generateSecret() {
    return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

async function create({ appId, url, description, filterTypes }) {
    const id = `ep_${crypto.randomUUID()}`;
    return prisma.endpoint.create({
        data: {
            id,
            appId,
            url,
            description: description ?? null,
            filterTypes: filterTypes ?? [],
            secret: generateSecret(),
        },
    });
}

// Scoped through the app relation so an org can only ever see its own endpoints.
async function findAllForOrg(orgId) {
    return prisma.endpoint.findMany({ where: { app: { orgId } } });
}

async function findByIdForOrg(id, orgId) {
    return prisma.endpoint.findFirst({ where: { id, app: { orgId } } });
}

async function update(id, data) {
    return prisma.endpoint.update({ where: { id }, data });
}

module.exports = { create, findAllForOrg, findByIdForOrg, update };
