const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function hashKey(rawKey) {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
}

// API keys are the auth for machine callers (ingestion, endpoint management) —
// there's no login/session here, this is meant to be called from a backend,
// not a browser. The raw key is never stored, only its hash (see prisma/seed.js
// for how one gets minted); this only ever compares hashes.
async function apiKeyAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, rawKey] = header.split(' ');

    if (scheme !== 'Bearer' || !rawKey) {
        return res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header' },
        });
    }

    const apiKey = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(rawKey) } });

    if (!apiKey || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
        return res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'Invalid or expired API key' },
        });
    }

    prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    req.orgId = apiKey.orgId;
    next();
}

module.exports = { apiKeyAuth, hashKey };
