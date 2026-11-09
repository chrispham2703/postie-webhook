const { body } = require('express-validator');

// Shared by /api/endpoints and /api/dashboard/endpoints so a validation fix
// only has to be made once.
const createEndpointRules = [
    body('appId').isString().trim().notEmpty().withMessage('appId is required'),
    body('url').isString().trim().isURL().withMessage('url must be a valid URL'),
    body('description').optional().isString(),
    body('filterTypes').optional().isArray().withMessage('filterTypes must be an array of strings'),
    body('filterTypes.*').optional().isString(),
];

const updateEndpointRules = [
    body('url').optional().isString().trim().isURL().withMessage('url must be a valid URL'),
    body('description').optional().isString(),
    body('filterTypes').optional().isArray().withMessage('filterTypes must be an array of strings'),
    body('filterTypes.*').optional().isString(),
    // isBoolean() accepts "true", "1" and arrays, which then reach Prisma unconverted.
    body('disabled').optional().custom((v) => typeof v === 'boolean').withMessage('disabled must be a boolean'),
];

module.exports = { createEndpointRules, updateEndpointRules };
