const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

// 1. POST /api/events - Create new event
router.post(
    '/',
    [
        body('eventType')
            .trim()
            .notEmpty().withMessage('eventType is required')
            .isString().withMessage('eventType must be a string'),

        body('payload')
            .isObject().withMessage('payload must be an object')
            .custom((value) => Object.keys(value || {}).length > 0)
            .withMessage('payload cannot be empty'),

        body('targetUrl')
            .trim()
            .isURL().withMessage('targetUrl must be a valid URL'),
    ],
    (req, res) => {
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

        const { eventType, payload, targetUrl } = req.body;

        const newEvent = {
            id: `evt_${Math.random().toString(36).substr(2, 9)}`,
            eventType,
            payload,
            targetUrl,
            status: 'pending',
            createdAt: new Date().toISOString(),
        };

        res.status(201).json({
            data: newEvent,
        });
    }
);

// 2. GET /api/events
router.get('/', (req, res) => {
    res.status(200).json({
        data: [],
        meta: {
            nextCursor: null,
            hasMore: false,
        },
    });
});

// 3. GET /api/events/:id
router.get('/:id', (req, res) => {
    const { id } = req.params;

    res.status(200).json({
        data: {
            id: id,
            status: 'pending',

        },
    });
});

module.exports = router;
