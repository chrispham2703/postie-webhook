const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function generateSecret() {
    return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

// secret is deliberately left out here — same policy as ApiKey: shown once,
// on create, never again through list/get/patch responses.
// headers is always null today; take it out of here before it becomes
// settable, since dashboard members can read everything in this list.
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
async function findAllForOrg(orgId, { appId } = {}) {
    return prisma.endpoint.findMany({
        where: { app: { orgId }, ...(appId && { appId }) },
        select: PUBLIC_FIELDS,
    });
}

async function findByIdForOrg(id, orgId) {
    return prisma.endpoint.findFirst({ where: { id, app: { orgId } }, select: PUBLIC_FIELDS });
}

async function update(id, data) {
    return prisma.endpoint.update({ where: { id }, data, select: PUBLIC_FIELDS });
}

module.exports = { create, findAllForOrg, findByIdForOrg, update, PUBLIC_FIELDS };
