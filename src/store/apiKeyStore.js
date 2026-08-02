const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { hashKey } = require('../middleware/apiKeyAuth.js');

function generateRawKey() {
    return `postie_${crypto.randomBytes(24).toString('hex')}`;
}

// Returns the raw key alongside the saved row — this is the only moment the
// raw key ever exists outside the caller's hands, since only the hash is kept.
async function create({ orgId, name, expiresAt }) {
    const rawKey = generateRawKey();
    const apiKey = await prisma.apiKey.create({
        data: {
            id: `key_${crypto.randomUUID()}`,
            keyHash: hashKey(rawKey),
            prefix: rawKey.slice(0, 14),
            name,
            orgId,
            expiresAt: expiresAt ?? null,
        },
    });
    return { rawKey, apiKey };
}

async function findAllForOrg(orgId) {
    return prisma.apiKey.findMany({
        where: { orgId },
        select: { id: true, prefix: true, name: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    });
}

async function deleteForOrg(id, orgId) {
    const result = await prisma.apiKey.deleteMany({ where: { id, orgId } });
    return result.count > 0;
}

module.exports = { create, findAllForOrg, deleteForOrg };
