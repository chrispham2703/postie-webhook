const crypto = require('crypto');
const events = [];

function findAll() {
    return [...events];
}

function save(data) {
    const id = `evt_${crypto.randomUUID()}`;
    const {eventType, payload, targetUrl} = data;

    const newEvent = {
        id,
        eventType,
        payload,
        targetUrl,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    events.push(newEvent);
    return newEvent;
}

function findById(id) {
    const event = events.find(e => e.id === id);
    return event ?? null;
}

module.exports = {
    findAll,
    save,
    findById
};