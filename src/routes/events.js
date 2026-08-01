const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const { save, findAll, findById, updateStatus } = require('../store/eventStore.js');
const { createDeliveries } = require('../services/deliveryService.js');
const { publish } = require('../config/rabbitmq.js');

// 1. POST /api/events
router.post(
    '/',
    [
        body('appId')
            .trim()
            .notEmpty().withMessage('appId is required'),

        body('eventType')
            .trim()
            .notEmpty().withMessage('eventType is required')
            .isString().withMessage('eventType must be a string'),

        body('payload')
            .isObject().withMessage('payload must be an object')
            .custom((value) => Object.keys(value || {}).length > 0)
            .withMessage('payload cannot be empty'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                error: {
                    code: 'VALIDATION_FAILED',
                    message: 'Invalid request data',
                },
                details: errors.array(),
            });
        }

        const { appId, eventType, payload, messageId } = req.body;
        const newEvent = await save({ appId, eventType, payload, messageId });
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
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const cursor = req.query.cursor;

    const events = await findAll({ cursor, limit });

    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;

    res.status(200).json({
        data: page,
        meta: {
            nextCursor: hasMore ? page[page.length - 1].id : null,
            hasMore,
        },
    });
});

// 3. GET /api/events/:id
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const event = await findById(id);

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
