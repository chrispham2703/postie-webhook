const express = require('express');
const router = express.Router();

const { findAll, findById } = require('../store/eventStore.js');
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

module.exports = router;
