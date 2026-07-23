const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findAll({ cursor, limit }) {
    return await prisma.event.findMany({
        take: limit + 1,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
}

async function save(data) {
    const id = `evt_${crypto.randomUUID()}`;
    const { appId, eventType, payload, messageId } = data;

    return await prisma.event.create({
        data: { id, appId, eventType, payload, messageId }
    });
}

async function findById(id) {
    const event = await prisma.event.findUnique({ where: { id } });
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
