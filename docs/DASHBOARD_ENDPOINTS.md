# Dashboard Endpoints — Design

> **Status:** Accepted (2026-11-09)
> **Related:** [ARCHITECTURE.md](./ARCHITECTURE.md), [BACKLOG.md](./BACKLOG.md), `src/routes/dashboardApplications.js`, `src/routes/endpoints.js`

---

## 1. Problem

People on the dashboard (JWT, `userAuth`) can see events and applications, but can't see or manage
the endpoints those events are delivered to. Today the only way to register, edit or disable an
endpoint is `/api/endpoints`, which takes an API key and is used by customers' servers.

We need dashboard users to:

- list their org's endpoints (optionally for one application)
- view one endpoint
- register a new endpoint for an application they own
- edit `url`, `description`, `filterTypes`
- disable / re-enable an endpoint

without changing `/api/endpoints` in any way, because customers' servers depend on it.

**Constraints**

- Follow the `dashboardApplications.js` twin pattern: a separate `userAuth` router file, never mixed
  with `apiKeyAuth` (CLAUDE.md).
- An endpoint's signing secret (`Endpoint.secret`, `whsec_...`) must never be shown to a `member`.
- Never hard-delete an `Endpoint` (it cascades to `Delivery` and erases history). Disable via
  `PATCH { disabled: true }` instead.
- App ownership checks go through `applicationService.findOwnedApplication(appId, orgId)`.
- Every id lookup is scoped by `orgId`; another org's resource → 404, never 403.

## 2. What exists today (verified in code)

- `endpointStore.PUBLIC_FIELDS` leaves out `secret`. `findAllForOrg`, `findByIdForOrg` and `update`
  all `select: PUBLIC_FIELDS`. Only `create` returns the full row, so the secret is shown exactly
  once, in the create response. `tests/endpoints.test.js:36-53` pins this down.
- There's no way to read or rotate a secret after creation.
- `PUBLIC_FIELDS` includes `headers` (`Json?`). Nothing sets it through the API and the delivery
  worker doesn't send it, so it's always null today.
- `deliveryService.findMatchingEndpoints` skips `disabled: true` endpoints at fan-out time. But
  `deliveryWorker.handleDelivery` and `retryPoller` never check `disabled`, so deliveries that were
  already queued or are waiting for a retry still go out after an endpoint is disabled.
- `requireRole(...roles)` returns 403 `FORBIDDEN` for the wrong role. It's per-route opt-in.

## 3. Options considered

### Option A — Copy-paste twin (exactly like `dashboardApplications.js`)

New `src/routes/dashboardEndpoints.js`, `router.use(userAuth)`, handlers and validators copied from
`endpoints.js`, `requireRole('owner', 'admin')` added to POST and PATCH.

- **+** Matches the existing pattern exactly; nothing new to learn.
- **+** Zero risk to `/api/endpoints`: its file isn't touched.
- **−** Validators are duplicated. A validation fix has to be made twice. This already happened
  with `uid` in PR #58, and the `disabled` bug in BACKLOG.md would be copied into the new file.
- **−** Role checks rely on remembering `requireRole` on every write route (BACKLOG.md).

### Option B — Twin router, shared validators, router-level role rule

Same new file and same `userAuth` guard as A, plus two changes:

1. Move the endpoint validation chains into one module (e.g. `src/validators/endpointValidators.js`)
   that both `endpoints.js` and `dashboardEndpoints.js` import. Handlers stay separate. They differ
   in auth, role and error-message wording ("for this API key" vs "for this organization").
2. In the new router, one rule after `userAuth`: every non-GET request requires `owner` or `admin`.
   It's applied once, so a PATCH or POST added later can't forget it.

- **+** One place to fix validation; the `disabled` fix lands in both routes at once.
- **+** Closes the BACKLOG "remembering `requireRole`" gap for this router.
- **−** Touches `endpoints.js` (it imports the shared validators). Its behaviour must stay
  byte-for-byte the same, so its existing tests have to pass unchanged.
- **−** A new pattern that `dashboardApplications.js` doesn't follow yet.

### Option C — Let `/api/endpoints` accept either an API key or a JWT

- **−** Rejected. CLAUDE.md forbids mixing `apiKeyAuth` and `userAuth` in one router. An API key
  has no role, so `requireRole` either blocks every customer server or gets skipped for keys. It
  also ties dashboard changes to the public API's stability.

## 4. Chosen approach: Option B

**Why:** the twin file keeps the auth boundary simple (one guard per file, `/api/endpoints`
untouched in behaviour). The shared validators remove the duplication that has already caused one
bug to be fixed twice, and the router-level role rule makes the members-can't-write guarantee hold
for future routes, not just today's. The cost is a small, test-covered refactor of `endpoints.js`.

### Decisions (review, 2026-11-09)

1. **Option B** accepted.
2. **Failure mode 6** (disabled endpoints still get in-flight deliveries) is fixed in its own PR,
   right after this one and before the frontend Disable button. Logged in BACKLOG.md as next.
3. **Secret rotation** stays out of scope. Logged in BACKLOG.md.
4. **SSRF** on endpoint URLs (failure mode 7) is logged in BACKLOG.md.

### Routes (`/api/dashboard/endpoints`, mounted in `app.js` after `/api/dashboard/applications`)

| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/` | any | List the org's endpoints, `PUBLIC_FIELDS` only. Optional `?appId=`: checked with `findOwnedApplication`; not owned → 404 `APPLICATION_NOT_FOUND`; empty or repeated → 422. |
| GET | `/:id` | any | One endpoint, `PUBLIC_FIELDS` only. Another org's or missing → 404 `ENDPOINT_NOT_FOUND`. |
| POST | `/` | owner, admin | Body `{ appId, url, description?, filterTypes? }`. `findOwnedApplication(appId, orgId)` → 404 if not owned. 201 with the endpoint **including `secret`, once**. |
| PATCH | `/:id` | owner, admin | `url`, `description`, `filterTypes`, `disabled`. `appId` can't be changed. 200, `PUBLIC_FIELDS` only. |

No DELETE route. The role rule runs before route matching, so:

- owner/admin `DELETE` → 404 (no route), same as `/api/endpoints`
- member `DELETE` (or any non-GET, to any path) → 403 `FORBIDDEN`, before any lookup, so it
  reveals nothing about the id
- no token → 401 (`userAuth` runs first)

The rule checks `req.method === 'GET'`, so `HEAD` and `OPTIONS` are treated as writes: a member's
`HEAD` gets 403 while their `GET` gets 200. That fails closed, so it's left as is. Browser CORS
preflights never reach the router; `cors()` in `app.js` answers them first.

### Secret handling

- Members can never reach a response with `secret`: the only such response is POST, and POST is
  owner/admin only.
- GET and PATCH always use `PUBLIC_FIELDS`, which already excludes `secret`.
- **Out of scope:** revealing or rotating a secret after creation. If an admin loses it, they
  register a new endpoint and disable the old one. A rotate route (owner/admin, returns the new
  secret once) goes into BACKLOG.md.

### `disabled` validation (BACKLOG item, fixed here)

Replace `isBoolean()` with a strict type check (`typeof v === 'boolean'`) in the shared validators,
so `"true"`, `1` and `[true]` get 422 on both routes. Remove the item from BACKLOG.md in the same PR.

## 5. Data model changes

**None.** No schema change and no migration. All fields needed already exist on `Endpoint`.

The store gets one additive change: `findAllForOrg(orgId, { appId } = {})`, which filters by
`appId` when it's given. Callers that pass nothing (`/api/endpoints`) behave exactly as before.

## 6. Failure modes

| # | Failure | Effect | Handling |
|---|---|---|---|
| 1 | A member calls POST or PATCH | Could create endpoints or redirect deliveries | Router-level rule → 403 `FORBIDDEN`. Tested for both. |
| 2 | Secret leaks to a member | Member can forge signed webhooks to the customer | Only POST returns it, and POST is owner/admin. Tests assert `secret` is undefined on GET list and by id (member, owner, admin), `?appId=` list, another org's list, and every PATCH response. |
| 3 | `appId` from another org on POST or `?appId=` | Endpoint attached to someone else's app, or existence leak | `findOwnedApplication` → 404, same message as a missing app. |
| 4 | Endpoint id from another org on GET/PATCH | Read or modify another org's endpoint | `findByIdForOrg` scoped through `app.orgId` → 404. |
| 5 | An API key sent to the dashboard route | Customer servers reach dashboard routes | `userAuth` rejects it → 401. Tested with a real stored key. |
| 6 | Disabling doesn't stop in-flight deliveries | Admin disables a broken or compromised URL, but queued deliveries and pending retries still go out (worker and `retryPoller` don't check `disabled`) | **Existing gap, not introduced here.** Becomes more visible once the dashboard has a "Disable" button. **Fixed in the follow-up PR:** the worker marks the delivery `cancelled` without sending it, and never sends a cancelled delivery again, even after re-enabling. |
| 7 | `url` points at an internal address (`http://localhost`, `169.254.169.254`) | SSRF from the delivery worker | Existing gap on `/api/endpoints` too. The dashboard widens who can set URLs to every admin. In BACKLOG.md; not fixed here. |
| 8 | Refactor of shared validators changes `/api/endpoints` behaviour | Breaks customers' servers | `tests/endpoints.test.js` must pass with no edits, except new tests for the `disabled` fix. |
| 9 | `headers` later starts holding auth tokens for customers' servers | Members would see them through `PUBLIC_FIELDS` | Not an issue today (always null). Note in `endpointStore.js` that `headers` must leave `PUBLIC_FIELDS` before it becomes settable. |
| 10 | Re-enabling an endpoint whose circuit breaker is `paused` | Deliveries stay paused until `pausedUntil` | Expected behaviour: `disabled` and the circuit breaker's `status` are independent. Document in the README row. |

## 7. Test plan

New `tests/dashboardEndpoints.test.js`, following `dashboardApplications.test.js`: its own throwaway
org plus an application created in `beforeAll`, JWTs from `sign()` for owner, admin and member,
cleanup in `afterAll` (org delete cascades). No seed `org_test_1`.

**Auth and roles**
- No token → 401. Bad JWT → 401. A real stored API key → 401.
- Member: GET list 200, GET by id 200, POST 403, PATCH 403.
- Owner POST 201; admin POST 201; admin PATCH 200.

**Secret**
- POST response has `secret` matching `/^whsec_/`.
- GET list and GET by id have `secret` undefined for member, owner and admin; so do the `?appId=`
  list, another org's list, and every PATCH response.

**Ownership and scoping**
- POST with another org's `appId` → 404 `APPLICATION_NOT_FOUND`; with a missing `appId` → same 404.
- GET `?appId=` another org's app → 404; own app → only that app's endpoints; empty `?appId=` → 422.
- GET/PATCH another org's endpoint id → 404 `ENDPOINT_NOT_FOUND`. The same org gets 200 for the
  same id first, so the 404 is shown to come from scoping.

**No hard delete**
- Owner DELETE `/:id` → 404, and the endpoint still exists afterwards. Member DELETE → 403.
- `disabled: false` → 200 on both routes.
- While enabled, a new event fans out to the endpoint. After PATCH `{ disabled: true }`, a new event
  fans out to no delivery for it (via `createDeliveries`).

**Validation (both routes, via the shared validators)**
- `url` invalid, array, or number → 422. `appId` array → 422. `filterTypes` not an array → 422.
- `disabled: "true"`, `1`, `[true]` → 422 on `/api/dashboard/endpoints` **and** `/api/endpoints`
  (written first, shown failing before the fix).
- `?appId=` with an empty value → 422 (written first, shown failing before the fix).
- `appId` in a PATCH body is ignored (endpoint keeps its app).

**Regression**
- `tests/endpoints.test.js` passes unchanged.
- `npm test` and `npm run lint` pass.

## 8. Out of scope

In BACKLOG.md:

- ~~Worker and retry poller skipping disabled endpoints (failure mode 6).~~ Done in the follow-up
  PR; "pause an endpoint" is in BACKLOG.md instead.
- Secret reveal / rotate.
- SSRF protection on endpoint URLs (failure mode 7).
- Applying the router-level role rule to `dashboardApplications.js`.

Not logged:

- The frontend Endpoints page (separate design, `docs/FRONTEND_DESIGN.md`).
