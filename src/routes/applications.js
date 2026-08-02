const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const applicationStore = require('../store/applicationStore.js');
const { apiKeyAuth } = require('../middleware/apiKeyAuth.js');

router.use(apiKeyAuth);

router.post(
    '/',
    [
        body('name').trim().notEmpty().withMessage('name is required'),
        body('uid').optional().trim().isString(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                error: { code: 'VALIDATION_FAILED', message: 'Invalid request data' },
                details: errors.array(),
            });
        }

        const { name, uid } = req.body;

        try {
            const app = await applicationStore.create({ orgId: req.orgId, name, uid });
            res.status(201).json({ data: app });
        } catch (err) {
            if (err.code === 'P2002') {
                return res.status(409).json({
                    error: { code: 'UID_TAKEN', message: 'An application with this uid already exists for this org' },
                });
            }
            throw err;
        }
    }
);

router.get('/', async (req, res) => {
    const apps = await applicationStore.findAllForOrg(req.orgId);
    res.status(200).json({ data: apps });
});

router.get('/:id', async (req, res) => {
    const app = await applicationStore.findByIdForOrg(req.params.id, req.orgId);
    if (!app) {
        return res.status(404).json({
            error: { code: 'APPLICATION_NOT_FOUND', message: 'Application does not exist for this API key' },
        });
    }
    res.status(200).json({ data: app });
});

module.exports = router;
