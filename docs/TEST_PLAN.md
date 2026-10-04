# Postie — Test Plan

What each test actually proves, and how I know — mutation-checked by hand: break the
real code on purpose, confirm the test fails because of that specific break, then
revert. A test that still passes after the code it's supposed to protect is broken
is a useless test — it looks like coverage, but it isn't actually checking anything.

## `tests/backoff.test.js`

| Test | What it proves | Mutation-checked |
|---|---|---|
| `follows the documented ladder: 30s, 2m, 10m, 1h, 6h, 24h` | The delay for each attempt number matches the exact ladder from `ARCHITECTURE.md` §5, not just "some number" | Changed `30 * 1000` to `31 * 1000` → test failed with the exact wrong value shown. Reverted. |
| `returns null once attempts are exhausted...` | Once the ladder runs out, the function signals "give up" with `null`, not some other value the caller might mishandle | Changed the `?? null` fallback to `?? 999` → test failed. Reverted. |

A useless version of these tests would just check `getDelayMs(1)` is "a number" or "truthy" — that would pass even if the ladder's actual values were wrong, which is the one thing that matters here.

## `tests/signature.test.js`

| Test | What it proves | Mutation-checked |
|---|---|---|
| `produces a hex-encoded HMAC-SHA256 of the JSON payload` | The signature uses the exact algorithm (SHA-256) the receiver expects — a different algorithm produces a different hash that verification would reject | Changed `'sha256'` to `'sha1'` → test failed with a different hex string. Reverted. |
| `a different secret produces a different signature` | The secret actually participates in the signature — if it didn't, anyone could forge a valid signature without knowing the secret | Hardcoded a fixed string in place of the `secret` parameter → both tests failed, including this one, since two different input secrets now produced the same (wrong) signature. Reverted. |

A useless version would only check the output is a non-empty string — that would still pass even if the secret were silently ignored, which is exactly the security hole this test exists to catch.

## `tests/deliveryService.test.js`

| Test | What it proves | Mutation-checked |
|---|---|---|
| `an endpoint with empty filterTypes receives every event type` | An endpoint with no filter configured gets fanned out every event, not silently skipped | Changed `length === 0` to `length === 1` → test failed (empty-filter endpoint stopped matching anything). Reverted. |
| `an endpoint with filterTypes only receives listed event types` | An endpoint with a filter list only receives the event types it actually asked for, and correctly rejects the rest | Changed `.includes(...)` to `!.includes(...)` → test failed (matching logic inverted). Reverted. |

A useless version would only test the "matches" case and never check that a non-matching event type is correctly rejected — a filter that let everything through anyway would still pass that kind of test.
