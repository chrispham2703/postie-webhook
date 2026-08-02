const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

function hash(rawPassword) {
    return bcrypt.hash(rawPassword, SALT_ROUNDS);
}

function verify(rawPassword, passwordHash) {
    return bcrypt.compare(rawPassword, passwordHash);
}

module.exports = { hash, verify };
