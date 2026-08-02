const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const authService = require('../services/authService.js');
const { sign } = require('../utils/jwt.js');

router.post(
    '/signup',
    [
        body('orgName').trim().notEmpty().withMessage('orgName is required'),
        body('email').trim().isEmail().withMessage('email must be valid'),
        body('password').isLength({ min: 8 }).withMessage('password must be at least 8 characters'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                error: { code: 'VALIDATION_FAILED', message: 'Invalid request data' },
                details: errors.array(),
            });
        }

        const { orgName, email, password } = req.body;

        try {
            const { org, user } = await authService.signup({ orgName, email, password });
            const token = sign(user);
            res.status(201).json({
                data: { token, org: { id: org.id, name: org.name }, user: { id: user.id, email: user.email, role: user.role } },
            });
        } catch (err) {
            if (err.code === 'P2002') {
                return res.status(409).json({
                    error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
                });
            }
            throw err;
        }
    }
);

router.post(
    '/login',
    [
        body('email').trim().isEmail().withMessage('email must be valid'),
        body('password').notEmpty().withMessage('password is required'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({
                error: { code: 'VALIDATION_FAILED', message: 'Invalid request data' },
                details: errors.array(),
            });
        }

        const { email, password } = req.body;
        const user = await authService.login({ email, password });

        if (!user) {
            return res.status(401).json({
                error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' },
            });
        }

        const token = sign(user);
        res.status(200).json({ data: { token } });
    }
);

module.exports = router;
