const express = require('express');
const router = express.Router();

const { findAll } = require('../store/eventStore.js');
const { userAuth } = require('../middleware/userAuth.js');
const { parsePagination, buildPageResponse } = require('../utils/pagination.js');

router.use(userAuth);

router.get('/', async (req, res) => {
    const { limit, cursor } = parsePagination(req.query);

    const events = await findAll({ cursor, limit, orgId: req.orgId, includeDeliveries: true });

    res.status(200).json(buildPageResponse(events, limit));
});

module.exports = router;
