---
name: postie-endpoint
description: Use when adding or changing a Postie REST endpoint. Enforces the route/service/store split, validation, error shape, and test requirements.
---
# Adding a Postie endpoint

1. Route in `src/routes/<resource>.js` — validate input with `express-validator`
   (`body(...).withMessage(...)` chains, checked via `validationResult(req)`), call the
   service or store, map the result to HTTP. No business logic here.
2. On validation failure, return 422: `{ error: { code: 'VALIDATION_FAILED', message: 'Invalid request data' }, details: errors.array() }`.
3. Cross-entity logic goes in `src/services/<resource>Service.js` — never touches `req`/`res`.
   Simple CRUD with no cross-entity logic can go straight from route to store.
4. DB access in `src/store/<resource>Store.js` — Prisma queries only, one model per store file.
5. Integration test in `tests/<resource>.test.js`: happy path, invalid body (422), unknown id (404).
6. Update `docs/API_DESIGN.md` with the endpoint, request, response, status codes, and WHY
   it looks like this. Create the file if it doesn't exist yet.
