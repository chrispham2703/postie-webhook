const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();


async function findAll() {
    return await prisma.event.findMany();
}

async function save(data) {
    const id = `evt_${crypto.randomUUID()}`;
    const {eventType, payload, targetUrl} = data;

    const newEvent = await prisma.event.create ({
        data: {
            id,
            eventType,
            payload,
            targetUrl,
            status: 'pending',
            endpointId: 'ep_test_1'
        }
    });
    return newEvent;
}

async function findById(id) {
    const event = await prisma.event.findUnique({
        where: {id}
    });
    return event ?? null;
}

module.exports = {
    findAll,
    save,
    findById
};