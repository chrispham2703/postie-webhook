const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function generateSecret() {
    return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

// secret is deliberately left out here — same policy as ApiKey: shown once,
// on create, never again through list/get/patch responses.
const PUBLIC_FIELDS = {
    id: true,
    appId: true,
    url: true,
    description: true,
    filterTypes: true,
    headers: true,
    status: true,
    failureCount: true,
    disabled: true,
    createdAt: true,
    updatedAt: true,
};

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
    return prisma.endpoint.findMany({ where: { app: { orgId } }, select: PUBLIC_FIELDS });
}

async function findByIdForOrg(id, orgId) {
    return prisma.endpoint.findFirst({ where: { id, app: { orgId } }, select: PUBLIC_FIELDS });
}

async function update(id, data) {
    return prisma.endpoint.update({ where: { id }, data, select: PUBLIC_FIELDS });
}

module.exports = { create, findAllForOrg, findByIdForOrg, update };
