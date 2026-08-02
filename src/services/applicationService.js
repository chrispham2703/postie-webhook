const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Returns null if the app doesn't exist OR belongs to a different org —
// deliberately the same response either way, so a caller can't use this to
// probe which application ids exist in other organizations.
async function findOwnedApplication(appId, orgId) {
    return prisma.application.findFirst({ where: { id: appId, orgId } });
}

module.exports = { findOwnedApplication };
