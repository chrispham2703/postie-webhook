const crypto = require('crypto');

// HMAC signing per docs/ARCHITECTURE.md Problem 5: the receiver can verify
// this came from Postie (and wasn't tampered with) using the shared secret.
function sign(payload, secret) {
    const body = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

module.exports = { sign };
