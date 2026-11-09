# Backlog

Known gaps that were found and deliberately deferred. Before starting work in an area, check
here first. When an item is done, delete it in the same PR.

## Product

- **Pause an endpoint.** Disabling is final: queued and retrying deliveries become `cancelled` and
  are never sent, even after re-enabling. A separate "pause" would hold deliveries and send them on
  resume (e.g. during a customer's maintenance window). Would need its own status or flag, and the
  worker to reschedule instead of cancel.

- **Events that arrive while an endpoint is disabled can still reach it after re-enabling.** Fan-out
  skips disabled endpoints, so those events get no delivery for it. But `recoveryScan` re-runs
  `createDeliveries` for events still `received` and 5-8 minutes old. If the endpoint is re-enabled
  inside that window, the scan creates a `pending` delivery and sends it. At odds with "disabling is
  final". Existed before the cancel change.

## Security / auth

- **No way to rotate an endpoint's signing secret.** The `whsec_` secret is shown once on create
  and never again. If it's lost or leaked, the only fix is registering a new endpoint and disabling
  the old one. Idea: an owner/admin rotate route that returns the new secret once.
- **SSRF via endpoint URLs.** `url` only has to pass `isURL()`, so it can point at internal
  addresses (`http://localhost`, `169.254.169.254`), and the delivery worker will POST to them.
  Dashboard endpoints widen who can set URLs to every admin. Fix: resolve the host and reject
  private/loopback/link-local ranges, at create/update and again at delivery time.

- **Stale JWT role, removed user keeps access (up to 7 days).** `userAuth` trusts `orgId` and
  `role` from the token and never checks the DB. A demoted admin or a removed user keeps their old
  rights until the token expires (7d, `src/utils/jwt.js`). Fix idea: short access tokens (~15 min)
  plus a refresh token that re-checks the DB on refresh.
- **Auth rate limit counts successful logins.** `authLimiter` (`src/routes/auth.js`) is 10 requests
  per 15 min per IP, shared by signup and login. An office behind one IP can lock itself out.
  Options: `skipSuccessfulRequests: true`, or key by email + IP.
- **Check the live DB isn't seeded with the public test API key** from `prisma/seed.js`.

## Validation / API

- **`?cursor=a&cursor=b`** arrives as an array (`src/utils/pagination.js`) → likely 500.
- **`dashboardApplications.js` relies on remembering `requireRole`.** A new PATCH/DELETE that
  forgets it lets members write. `dashboardEndpoints.js` already has the router-level rule (every
  non-GET needs owner/admin); copy it over.
- **Disabling an endpoint isn't atomic.** PATCH `{ disabled: true }` (`endpoints.js`,
  `dashboardEndpoints.js`) saves the flag, then calls `cancelPendingDeliveries` as a second write.
  If the second write fails, the request 500s with the endpoint already disabled and its deliveries
  still `pending` until the worker reaches them (the worker's own disabled check still stops them
  being sent). Fix: do both writes in one `prisma.$transaction`.
- **`messageId` is optional** (product decision). Making it required would break existing
  customers' servers; documented instead.

## AI harness

- **`block-secrets.sh` only guards Bash.** Agents can still read or write files with Read / Write /
  Edit, and have done so once to get past a block. Its `.en` and `_KEY` patterns also block
  harmless commands (`.encode`, `VALID_KEY`). Worth an `AI_WORKFLOW.md` entry.

## Tests / tooling

- **Intermittent 404 on dashboard tests, first run only.** Seen twice, neither reproduced: the empty
  `?appId=` test in `dashboardEndpoints.test.js` and "lists events for the caller org" in
  `dashboardEvents.test.js` each got 404 on the first run after the test file was edited, then
  passed on every rerun. Cause unknown.

- **No `test:migrate` script.** `postie_test` needs `prisma migrate deploy` by hand after every new
  migration, or tests fail against the old schema (happened on the messageId change).
- **`tests/auth.test.js` is at 9 of the 10 requests** the auth rate limit allows. A second new auth
  test will start failing with 429.
- **Tests mount routers with their own `buildApp()`,** not `src/app.js`, so a missing mount in
  `app.js` isn't caught.
- **An `afterAll` that throws midway** leaves the Prisma connection open.
