const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');

const endpointStore = require('../store/endpointStore.js');
const { findOwnedApplication } = require('../services/applicationService.js');
const { cancelPendingDeliveries } = require('../services/deliveryService.js');
const { createEndpointRules, updateEndpointRules } = require('../validators/endpointValidators.js');
const { userAuth } = require('../middleware/userAuth.js');
const { requireRole } = require('../middleware/requireRole.js');

// Dashboard twin of /api/endpoints: same Endpoints, but for a logged-in person
// (JWT) instead of a customer's server (API key). See docs/DASHBOARD_ENDPOINTS.md.
router.use(userAuth);

// Every write needs owner/admin, set once here so a new route can't forget it.
// Members can read, and nothing they can read includes the signing secret.
const requireWriter = requireRole('owner', 'admin');
router.use((req, res, next) => (req.method === 'GET' ? next() : requireWriter(req, res, next)));

function validationFailed(req, res) {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return false;
    }
    res.status(422).json({
        error: { code: 'VALIDATION_FAILED', message: 'Invalid request data' },
        details: errors.array().map(({ path, msg }) => ({ path, msg })),
    });
    return true;
}

function appNotFound(res) {
    return res.status(404).json({
        error: { code: 'APPLICATION_NOT_FOUND', message: 'Application does not exist for this organization' },
    });
}

function endpointNotFound(res) {
    return res.status(404).json({
        error: { code: 'ENDPOINT_NOT_FOUND', message: 'Endpoint does not exist for this organization' },
    });
}

// Only response that includes the secret, shown once — and only owner/admin get here.
router.post('/', createEndpointRules, async (req, res) => {
    if (validationFailed(req, res)) return;

    const { appId, url, description, filterTypes } = req.body;

    const app = await findOwnedApplication(appId, req.orgId);
    if (!app) {
        return appNotFound(res);
    }

    const endpoint = await endpointStore.create({ appId, url, description, filterTypes });
    res.status(201).json({ data: endpoint });
});

router.get('/', [query('appId').optional().isString().notEmpty()], async (req, res) => {
    if (validationFailed(req, res)) return;

    const { appId } = req.query;
    if (appId && !(await findOwnedApplication(appId, req.orgId))) {
        return appNotFound(res);
    }

    const endpoints = await endpointStore.findAllForOrg(req.orgId, { appId });
    res.status(200).json({ data: endpoints });
});

router.get('/:id', async (req, res) => {
    const endpoint = await endpointStore.findByIdForOrg(req.params.id, req.orgId);
    if (!endpoint) {
        return endpointNotFound(res);
    }
    res.status(200).json({ data: endpoint });
});

// No DELETE: Endpoint cascades to Delivery. Disable with { disabled: true } instead.
router.patch('/:id', updateEndpointRules, async (req, res) => {
    if (validationFailed(req, res)) return;

    const existing = await endpointStore.findByIdForOrg(req.params.id, req.orgId);
    if (!existing) {
        return endpointNotFound(res);
    }

    const { url, description, filterTypes, disabled } = req.body;
    const updated = await endpointStore.update(existing.id, {
        ...(url !== undefined && { url }),
        ...(description !== undefined && { description }),
        ...(filterTypes !== undefined && { filterTypes }),
        ...(disabled !== undefined && { disabled }),
    });
    if (disabled === true) {
        await cancelPendingDeliveries(existing.id);
    }

    res.status(200).json({ data: updated });
});

module.exports = router;
