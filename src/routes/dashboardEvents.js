const express = require('express');
const router = express.Router();

const { findAll, findById, save, updateStatus } = require('../store/eventStore.js');
const { findAllForOrg } = require('../store/applicationStore.js');
const { createDeliveries } = require('../services/deliveryService.js');
const { publish } = require('../config/rabbitmq.js');
const { userAuth } = require('../middleware/userAuth.js');
const { parsePagination, buildPageResponse } = require('../utils/pagination.js');

router.use(userAuth);

const VALID_STATUSES = ['pending', 'delivered', 'failed_permanent'];

router.get('/', async (req, res) => {
    const { limit, cursor } = parsePagination(req.query);
    const { status } = req.query;

    if (status && !VALID_STATUSES.includes(status)) {
        return res.status(422).json({
            error: { code: 'INVALID_STATUS', message: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        });
    }

    const events = await findAll({ cursor, limit, orgId: req.orgId, includeDeliveries: true, deliveryStatus: status });

    res.status(200).json(buildPageResponse(events, limit));
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const event = await findById(id, req.orgId, { includeDeliveries: true });

    if (!event) {
        return res.status(404).json({
            error: { code: 'EVENT_NOT_FOUND', message: 'Event with the specified ID does not exist' },
        });
    }

    res.status(200).json({ data: event });
});

// Lets a logged-in user trigger a real event from inside the dashboard itself
// -- no separate API client needed, so the whole create -> deliver -> retry
// journey is visible in one place, not split across a tool nobody else sees.
router.post('/test', async (req, res) => {
    const apps = await findAllForOrg(req.orgId);
    if (apps.length === 0) {
        return res.status(422).json({
            error: { code: 'NO_APPLICATION', message: 'Create an application first before sending a test event' },
        });
    }
    const app = apps[0];

    const event = await save({
        appId: app.id,
        eventType: 'test.webhook',
        payload: { message: 'Test event sent from the Postie dashboard', sentAt: new Date().toISOString() },
    });

    try {
        const deliveries = await createDeliveries(event);
        for (const delivery of deliveries) {
            publish(delivery.id);
        }
    } catch {
        await updateStatus(event.id, 'queue_failed');
    }

    res.status(201).json({ data: event });
});

module.exports = router;
