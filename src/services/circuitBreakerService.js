const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function canCallEndpoint(endpointId, now) {
    // The whole function runs inside one transaction, and `FOR UPDATE` grabs
    // the "key" to this one endpoint row for the duration — a second caller
    // checking the same endpoint at the same instant has to wait its turn
    // instead of reading the same stale "pause just expired" snapshot.
    return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`SELECT * FROM endpoints WHERE id = ${endpointId} FOR UPDATE`;
        const endpoint = rows[0];

        if (endpoint.status !== 'paused') {
            return { allowed: true, isProbe: false };
        }

        if (now.getTime() < endpoint.pausedUntil.getTime()) {
            return { allowed: false, isProbe: false };
        }

        // Claim the single probe slot right here, before returning — push
        // pausedUntil forward so a second caller (now waiting its turn on the
        // lock) sees "still paused" instead of also getting isProbe: true.
        await tx.endpoint.update({
            where: { id: endpointId },
            data: { pausedUntil: new Date(now.getTime() + 5 * 60 * 1000) },
        });
        return { allowed: true, isProbe: true };
    });
}

async function recordFailure(endpointId, now) {
    const endpoint = await prisma.endpoint.findUnique({ where: { id: endpointId } });

    if (endpoint.failureSince && now.getTime() - endpoint.failureSince.getTime() < 60 * 1000) {
        endpoint.failureCount = endpoint.failureCount + 1;
    } else {
        endpoint.failureCount = 1;
        endpoint.failureSince = now;
    }

    if (endpoint.failureCount >= 5) {
        endpoint.status = 'paused';
        endpoint.pausedUntil = new Date(now.getTime() + 5 * 60 * 1000);
    }

    await prisma.endpoint.update({
        where: { id: endpointId },
        data: {
            failureCount: endpoint.failureCount,
            failureSince: endpoint.failureSince,
            status: endpoint.status,
            pausedUntil: endpoint.pausedUntil,
        },
    });
}

async function recordSuccess(endpointId) {
    await prisma.endpoint.update({
        where: { id: endpointId },
        data: {
            status: 'active',
            failureCount: 0,
            failureSince: null,
            pausedUntil: null,
        },
    });
}

module.exports = { canCallEndpoint, recordFailure, recordSuccess };
