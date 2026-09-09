# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Webhook delivery service: event → API → fanned out to endpoints → queued worker delivers with retry.
Design docs: `docs/ARCHITECTURE.md`, `docs/QUEUE_DECISION.md`. Deploy: `DEPLOY.md`.

## Commands

```bash
docker compose up -d && node prisma/seed.js   # once, before dev or test
npx prisma migrate deploy

npm run dev                     # API :3000
npm run start:worker
npm run start:retry-poller
npm run start:recovery-scan

npm test
npx jest tests/events.test.js   # single file
npx jest -t "test name"         # single test
```

`DATABASE_URL` (not `DB_URL`), `RABBITMQ_URL`, `JWT_SECRET`, `RESEND_API_KEY` in `.env`. No lint script.
No isolated test DB — tests need the seed data above (`org_test_1`).

## Structure

`routes/` (HTTP + validation) → `services/` (cross-entity logic) → `store/` (single-model Prisma
queries). Simple CRUD: route → store. Logic spanning models: route → service — e.g. reuse
`applicationService.findOwnedApplication(appId, orgId)` for any route that checks app ownership before
touching a related model; don't re-derive that check with stores directly. 4 processes, deployed
separately: `app.js` (API), `deliveryWorker.js`, `retryPoller.js`, `recoveryScan.js`.

## Workflow

Start a new branch per logical unit of work. Don't stack unrelated features onto an
existing branch just because it's the one currently checked out — check `git branch
--show-current` before starting something new, and cut a fresh branch from `main` if
the current one already belongs to a different feature.

## Landmines

- Auth: `apiKeyAuth` (raw key) guards `/api/events`, `/api/endpoints`. `userAuth` (JWT) guards
  `/api/auth`, `/api/applications`, `/api/api-keys`. Never swap them.
- Scope every id lookup by `orgId`. Cross-org resource → 404, never 403 (403 leaks existence).
- `createDeliveries()` upserts on `[eventId, endpointId]`. Never change to `create` — recovery scan
  re-runs it for the same event.
- Queue carries `{ deliveryId }` only, never the full event. Worker reloads from Postgres by id.
- Retries are app-level (`nextAttemptAt` + `retryPoller`), not RabbitMQ. Ladder: 30s→2m→10m→1h→6h→24h,
  then `failed_permanent`.
- Don't assume a `schema.prisma` field is wired up — `Plan`/`Subscription`/`UsageRecord`/password login
  exist in schema only.
- Never hard-delete an `Endpoint` (cascades, kills `Delivery` history). Use `PATCH { disabled: true }`.
