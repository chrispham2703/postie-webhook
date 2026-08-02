const jwt = require('jsonwebtoken');

const EXPIRES_IN = '7d';

function sign(user) {
    return jwt.sign(
        { userId: user.id, orgId: user.orgId, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: EXPIRES_IN }
    );
}

function verify(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { sign, verify };
