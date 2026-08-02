// Retry ladder from docs/ARCHITECTURE.md §5: 30s, 2m, 10m, 1h, 6h, 24h.
// Once attemptCount reaches the ladder's length, the caller should stop retrying (DLQ).
const LADDER_MS = [
    30 * 1000,
    2 * 60 * 1000,
    10 * 60 * 1000,
    60 * 60 * 1000,
    6 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
];

function getDelayMs(attemptCount) {
    return LADDER_MS[attemptCount - 1] ?? null;
}

module.exports = { getDelayMs, MAX_ATTEMPTS: LADDER_MS.length };
