const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findAll() {
    return await prisma.event.findMany();
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

module.exports = { findAll, save, findById };
