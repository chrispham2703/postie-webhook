const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const apiKeyStore = require('../store/apiKeyStore.js');
const { userAuth } = require('../middleware/userAuth.js');
const { requireRole } = require('../middleware/requireRole.js');

router.use(userAuth);

// Only owner/admin can mint or revoke keys — a 'member' can still see the list
// (name/prefix/lastUsedAt, never the key itself) but not create new credentials.
router.post(
    '/',
    requireRole('owner', 'admin'),
    [body('name').trim().notEmpty().withMessage('name is required')],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                error: { code: 'VALIDATION_FAILED', message: 'Invalid request data' },
                details: errors.array(),
            });
        }

        const { name } = req.body;
        const { rawKey, apiKey } = await apiKeyStore.create({ orgId: req.orgId, name });

        res.status(201).json({
            data: {
                id: apiKey.id,
                name: apiKey.name,
                prefix: apiKey.prefix,
                createdAt: apiKey.createdAt,
                key: rawKey,
            },
            meta: { note: 'This is the only time the full key is shown — store it now.' },
        });
    }
);

router.get('/', async (req, res) => {
    const keys = await apiKeyStore.findAllForOrg(req.orgId);
    res.status(200).json({ data: keys });
});

router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
    const deleted = await apiKeyStore.deleteForOrg(req.params.id, req.orgId);
    if (!deleted) {
        return res.status(404).json({
            error: { code: 'API_KEY_NOT_FOUND', message: 'API key does not exist for this account' },
        });
    }
    res.status(204).send();
});

module.exports = router;
