const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const { save, findAll, findById } = require('../store/eventStore.js');
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

        publish(newEvent.id);

        res.status(201).json({ data: newEvent });
    }
);

// 2. GET /api/events
router.get('/', async (req, res) => {
    const allEvents = await findAll();
    res.status(200).json({
        data: allEvents,
        meta: { nextCursor: null, hasMore: false },
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
