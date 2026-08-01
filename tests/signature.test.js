const crypto = require('crypto');
const { sign } = require('../src/utils/signature');

describe('sign', () => {
    test('produces a hex-encoded HMAC-SHA256 of the JSON payload', () => {
        const payload = { orderId: 123 };
        const secret = 'whsec_test';

        const expected = crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');

        expect(sign(payload, secret)).toBe(expected);
    });

    test('a different secret produces a different signature', () => {
        const payload = { orderId: 123 };
        expect(sign(payload, 'secret-a')).not.toBe(sign(payload, 'secret-b'));
    });
});
