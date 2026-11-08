# Backlog

Known gaps that were found and deliberately deferred. Before starting work in an area, check
here first. When an item is done, delete it in the same PR.

## Security / auth

- **Stale JWT role, removed user keeps access (up to 7 days).** `userAuth` trusts `orgId` and
  `role` from the token and never checks the DB. A demoted admin or a removed user keeps their old
  rights until the token expires (7d, `src/utils/jwt.js`). Fix idea: short access tokens (~15 min)
  plus a refresh token that re-checks the DB on refresh.
- **Auth rate limit counts successful logins.** `authLimiter` (`src/routes/auth.js`) is 10 requests
  per 15 min per IP, shared by signup and login. An office behind one IP can lock itself out.
  Options: `skipSuccessfulRequests: true`, or key by email + IP.
- **Check the live DB isn't seeded with the public test API key** from `prisma/seed.js`.

## Validation / API

- **`disabled` on PATCH /api/endpoints/:id** (`endpoints.js`): `isBoolean()` accepts `"true"`,
  `"1"` and arrays, and the value reaches Prisma unconverted → likely 500. Check
  `typeof v === 'boolean'`.
- **`?cursor=a&cursor=b`** arrives as an array (`src/utils/pagination.js`) → likely 500.
- **Dashboard write routes rely on remembering `requireRole`.** A new PATCH/DELETE that forgets it
  lets members write. Idea: one router-level rule that every non-GET needs owner/admin.
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
