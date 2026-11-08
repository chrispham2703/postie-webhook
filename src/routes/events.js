const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

// 100 requests/minute per IP -- generous enough for real webhook traffic,
// tight enough to stop a public, unauthenticated-at-the-network-level demo
// endpoint from being spammed or run up in cost.
const createEventLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
});

const { save, findAll, findById, findByMessageId, updateStatus } = require('../store/eventStore.js');
const { createDeliveries } = require('../services/deliveryService.js');
const { findOwnedApplication } = require('../services/applicationService.js');
const { publish } = require('../config/rabbitmq.js');
const { apiKeyAuth } = require('../middleware/apiKeyAuth.js');
const { parsePagination, buildPageResponse } = require('../utils/pagination.js');

router.use(apiKeyAuth);

// 1. POST /api/events
router.post(
    '/',
    createEventLimiter,
    [
        body('appId')
            .isString()
            .trim()
            .notEmpty().withMessage('appId is required'),

        body('eventType')
            .isString().withMessage('eventType must be a string')
            .trim()
            .notEmpty().withMessage('eventType is required'),

        body('payload')
            .isObject().withMessage('payload must be an object')
            .custom((value) => Object.keys(value || {}).length > 0)
            .withMessage('payload cannot be empty'),

        body('messageId').optional({ values: 'null' }).isString().isLength({ max: 255 }),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                error: {
                    code: 'VALIDATION_FAILED',
                    message: 'Invalid request data',
                },
                details: errors.array().map(({ path, msg }) => ({ path, msg })),
            });
        }

        const { appId, eventType, payload, messageId } = req.body;

        const app = await findOwnedApplication(appId, req.orgId);
        if (!app) {
            return res.status(404).json({
                error: { code: 'APPLICATION_NOT_FOUND', message: 'appId does not exist for this API key' },
            });
        }

        // Unique on [appId, messageId], so a retry (or two racing requests) hits
        // P2002 and gets the original event back instead of a second fan-out.
        let newEvent;
        try {
            newEvent = await save({ appId, eventType, payload, messageId: messageId || null });
        } catch (err) {
            if (err.code === 'P2002' && messageId) {
                const existing = await findByMessageId(appId, messageId);
                if (existing) {
                    return res.status(200).json({ data: existing });
                }
            }
            throw err;
        }
        console.log(`[Event] created ${newEvent.id}`);
        try {
            const deliveries = await createDeliveries(newEvent);
            for (const delivery of deliveries) {
                publish(delivery.id);
            }
            console.log(`[Event] fanned out ${newEvent.id} to ${deliveries.length} endpoint(s)`);
        } catch (err) {
            await updateStatus(newEvent.id, 'queue_failed');
            console.error(`[Event] failed to fan out ${newEvent.id}:`, err.message);
        }

        res.status(201).json({ data: newEvent });
    }
);

// 2. GET /api/events
router.get('/', async (req, res) => {
    const { limit, cursor } = parsePagination(req.query);

    const events = await findAll({ cursor, limit, orgId: req.orgId });

    res.status(200).json(buildPageResponse(events, limit));
});

// 3. GET /api/events/:id
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const event = await findById(id, req.orgId);

    if (!event) {
        return res.status(404).json({
            error: {
                code: 'EVENT_NOT_FOUND',
                message: 'Event with the specified ID does not exist',
            },
        });
    }

    return res.status(200).json({ data: event });
});

module.exports = router;
