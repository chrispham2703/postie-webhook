const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { PUBLIC_FIELDS: ENDPOINT_PUBLIC_FIELDS } = require('./endpointStore.js');

async function findAll({ cursor, limit, orgId, includeDeliveries = false }) {
    return await prisma.event.findMany({
        where: { app: { orgId } },
        take: limit + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        ...(includeDeliveries && {
            include: {
                deliveries: {
                    orderBy: { createdAt: 'asc' },
                    include: { endpoint: { select: ENDPOINT_PUBLIC_FIELDS } },
                },
            },
        }),
    });
}

async function save(data) {
    const id = `evt_${crypto.randomUUID()}`;
    const { appId, eventType, payload, messageId } = data;

    return await prisma.event.create({
        data: { id, appId, eventType, payload, messageId }
    });
}

async function findById(id, orgId) {
    const event = await prisma.event.findFirst({ where: { id, app: { orgId } } });
    return event ?? null;
}
async function updateStatus(id, status) {
    const event = await prisma.event.update({
        where: {id},
        data: {status},
    });
    return event;
}
module.exports = { findAll, save, findById, updateStatus };
