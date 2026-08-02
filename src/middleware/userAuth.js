const { verify } = require('../utils/jwt');

// Unlike apiKeyAuth, this never touches the database — the JWT's signature
// already proves it was issued by this server and hasn't been tampered with.
function userAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header' },
        });
    }

    try {
        const payload = verify(token);
        req.userId = payload.userId;
        req.orgId = payload.orgId;
        req.role = payload.role;
        next();
    } catch (err) {
        return res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session token' },
        });
    }
}

module.exports = { userAuth };
