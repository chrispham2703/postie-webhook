const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findMatchingEndpoints(event) {
    const endpoints = await prisma.endpoint.findMany({
        where: {
            appId: event.appId,
            disabled: false,
        },
    });
    return endpoints.filter((endpoint) => {
        return endpoint.filterTypes.length === 0 || endpoint.filterTypes.includes(event.eventType);
    });
}

async function createDeliveries(event) {
    const endpoints = await findMatchingEndpoints(event);

    const deliveries = [];
    for (const endpoint of endpoints) {
        // upsert, not create: this function must be safe to call more than once
        // for the same event (the recovery scan re-runs it), without creating duplicate deliveries
        const delivery = await prisma.delivery.upsert({
            where: { eventId_endpointId: { eventId: event.id, endpointId: endpoint.id } },
            update: {},
            create: {
                id: `del_${crypto.randomUUID()}`,
                eventId: event.id,
                endpointId: endpoint.id,
            },
        });
        deliveries.push(delivery);
    }

    return deliveries;
}

module.exports = { findMatchingEndpoints, createDeliveries };