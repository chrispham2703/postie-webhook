const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const endpointStore = require('../store/endpointStore.js');
const { findOwnedApplication } = require('../services/applicationService.js');
const { apiKeyAuth } = require('../middleware/apiKeyAuth.js');

router.use(apiKeyAuth);

// POST /api/endpoints
router.post(
    '/',
    [
        body('appId').trim().notEmpty().withMessage('appId is required'),
        body('url').trim().isURL().withMessage('url must be a valid URL'),
        body('description').optional().isString(),
        body('filterTypes').optional().isArray().withMessage('filterTypes must be an array of strings'),
        body('filterTypes.*').optional().isString(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                error: { code: 'VALIDATION_FAILED', message: 'Invalid request data' },
                details: errors.array(),
            });
        }

        const { appId, url, description, filterTypes } = req.body;

        const app = await findOwnedApplication(appId, req.orgId);
        if (!app) {
            return res.status(404).json({
                error: { code: 'APPLICATION_NOT_FOUND', message: 'appId does not exist for this API key' },
            });
        }

        const endpoint = await endpointStore.create({ appId, url, description, filterTypes });
        res.status(201).json({ data: endpoint });
    }
);

// GET /api/endpoints
router.get('/', async (req, res) => {
    const endpoints = await endpointStore.findAllForOrg(req.orgId);
    res.status(200).json({ data: endpoints });
});

// GET /api/endpoints/:id
router.get('/:id', async (req, res) => {
    const endpoint = await endpointStore.findByIdForOrg(req.params.id, req.orgId);
    if (!endpoint) {
        return res.status(404).json({
            error: { code: 'ENDPOINT_NOT_FOUND', message: 'Endpoint does not exist for this API key' },
        });
    }
    res.status(200).json({ data: endpoint });
});

// PATCH /api/endpoints/:id — url, description, filterTypes, disabled. No hard
// delete: Endpoint cascades to Delivery, so removing one would erase delivery
// history. Disabling keeps the record (and the audit trail) around.
router.patch(
    '/:id',
    [
        body('url').optional().trim().isURL().withMessage('url must be a valid URL'),
        body('description').optional().isString(),
        body('filterTypes').optional().isArray().withMessage('filterTypes must be an array of strings'),
        body('filterTypes.*').optional().isString(),
        body('disabled').optional().isBoolean().withMessage('disabled must be a boolean'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                error: { code: 'VALIDATION_FAILED', message: 'Invalid request data' },
                details: errors.array(),
            });
        }

        const existing = await endpointStore.findByIdForOrg(req.params.id, req.orgId);
        if (!existing) {
            return res.status(404).json({
                error: { code: 'ENDPOINT_NOT_FOUND', message: 'Endpoint does not exist for this API key' },
            });
        }

        const { url, description, filterTypes, disabled } = req.body;
        const updated = await endpointStore.update(existing.id, {
            ...(url !== undefined && { url }),
            ...(description !== undefined && { description }),
            ...(filterTypes !== undefined && { filterTypes }),
            ...(disabled !== undefined && { disabled }),
        });

        res.status(200).json({ data: updated });
    }
);

module.exports = router;
