# Backlog

Known gaps that were found and deliberately deferred. Before starting work in an area, check
here first. When an item is done, delete it in the same PR.

## Next

- **Disabled endpoints still get in-flight deliveries.** Fan-out skips `disabled: true`
  (`deliveryService.findMatchingEndpoints`), but `deliveryWorker.handleDelivery` and `retryPoller`
  never check it, so queued deliveries and pending retries still go out after an endpoint is
  disabled. Fix in its own PR right after dashboard endpoints, before the frontend Disable button.
  See `docs/DASHBOARD_ENDPOINTS.md` failure mode 6.

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
- **`messageId` is optional** (product decision). Making it required would break existing
  customers' servers; documented instead.

## AI harness

- **`block-secrets.sh` only guards Bash.** Agents can still read or write files with Read / Write /
  Edit, and have done so once to get past a block. Its `.en` and `_KEY` patterns also block
  harmless commands (`.encode`, `VALID_KEY`). Worth an `AI_WORKFLOW.md` entry.

## Tests / tooling

- **No `test:migrate` script.** `postie_test` needs `prisma migrate deploy` by hand after every new
  migration, or tests fail against the old schema (happened on the messageId change).
- **`tests/auth.test.js` is at 9 of the 10 requests** the auth rate limit allows. A second new auth
  test will start failing with 429.
- **Tests mount routers with their own `buildApp()`,** not `src/app.js`, so a missing mount in
  `app.js` isn't caught.
- **An `afterAll` that throws midway** leaves the Prisma connection open.
