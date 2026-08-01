const { matchesEvent } = require('../src/services/deliveryService');

describe('matchesEvent', () => {
    test('an endpoint with empty filterTypes receives every event type', () => {
        const endpoint = { filterTypes: [] };
        expect(matchesEvent(endpoint, { eventType: 'order.created' })).toBe(true);
        expect(matchesEvent(endpoint, { eventType: 'anything.else' })).toBe(true);
    });

    test('an endpoint with filterTypes only receives listed event types', () => {
        const endpoint = { filterTypes: ['order.created', 'order.paid'] };
        expect(matchesEvent(endpoint, { eventType: 'order.created' })).toBe(true);
        expect(matchesEvent(endpoint, { eventType: 'order.cancelled' })).toBe(false);
    });
});
