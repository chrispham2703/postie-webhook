const { getDelayMs, MAX_ATTEMPTS } = require('../src/utils/backoff');

describe('getDelayMs', () => {
    test('follows the documented ladder: 30s, 2m, 10m, 1h, 6h, 24h', () => {
        expect(getDelayMs(1)).toBe(30 * 1000);
        expect(getDelayMs(2)).toBe(2 * 60 * 1000);
        expect(getDelayMs(3)).toBe(10 * 60 * 1000);
        expect(getDelayMs(4)).toBe(60 * 60 * 1000);
        expect(getDelayMs(5)).toBe(6 * 60 * 60 * 1000);
        expect(getDelayMs(6)).toBe(24 * 60 * 60 * 1000);
    });

    test('returns null once attempts are exhausted, signaling the caller to give up', () => {
        expect(getDelayMs(MAX_ATTEMPTS + 1)).toBeNull();
    });
});
