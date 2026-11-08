const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const applicationStore = require('../store/applicationStore.js');
const { userAuth } = require('../middleware/userAuth.js');
const { requireRole } = require('../middleware/requireRole.js');

// Dashboard twin of /api/applications: same Applications, but for a logged-in
// person (JWT) instead of a customer's server (API key). Kept as a separate file
// because one router never mixes apiKeyAuth and userAuth.
router.use(userAuth);

// Only owner/admin can create applications — a 'member' can still list and view them.
router.post(
    '/',
    requireRole('owner', 'admin'),
    [
        body('name').isString().trim().notEmpty().withMessage('name is required'),
        body('uid').optional({ values: 'null' }).isString().trim(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                error: { code: 'VALIDATION_FAILED', message: 'Invalid request data' },
                details: errors.array().map(({ path, msg }) => ({ path, msg })),
            });
        }

        const { name, uid } = req.body;

        try {
            const app = await applicationStore.create({ orgId: req.orgId, name, uid: uid || null });
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
            error: { code: 'APPLICATION_NOT_FOUND', message: 'Application does not exist for this organization' },
        });
    }
    res.status(200).json({ data: app });
});

module.exports = router;
