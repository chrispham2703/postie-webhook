# Postie

A webhook delivery service — the piece of infrastructure that sits between "something happened in your app" and "the other systems that need to know about it," so the caller doesn't have to trust that every receiving server is online, fast, and reliable.

> Full write-up of the design, and the trade-offs behind it, in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and [`docs/QUEUE_DECISION.md`](./docs/QUEUE_DECISION.md). Deploy steps in [`DEPLOY.md`](./DEPLOY.md).

## What it does today

```txt
Client → POST /api/events → saved to PostgreSQL → fanned out to matching Endpoints as Deliveries
       → published to RabbitMQ → worker delivers each over signed HTTP → retried on failure
```

- **Event ingestion API** — `POST /api/events` validates the request, persists it, and fans it out to every `Endpoint` registered for that `Application` (matching on `filterTypes`), creating one `Delivery` row per match. If fan-out/publish fails, the event is marked `queue_failed` instead of silently disappearing (the DB write already succeeded by that point).
- **Cursor-based pagination** on `GET /api/events` — built on Prisma's cursor pagination rather than offset, so results stay correct even as new events are inserted concurrently.
- **A delivery worker** (`src/workers/deliveryWorker.js`) that consumes one queued job per `Delivery`, POSTs the event to the endpoint's real URL with an HMAC-SHA256 signature (`X-Postie-Signature`), and records every attempt as a `DeliveryAttempt`.
- **Retry with exponential backoff** — on failure the worker schedules the next attempt using the ladder in `docs/ARCHITECTURE.md` §5 (30s → 2m → 10m → 1h → 6h → 24h); a separate **retry poller** (`src/workers/retryPoller.js`) wakes up deliveries once their `nextAttemptAt` has passed. After 6 attempts a delivery is marked `failed_permanent` instead of retrying forever (the DLQ concept from §7, at the application level rather than a RabbitMQ dead-letter exchange).
- **Recovery scan** (`src/workers/recoveryScan.js`) — implements the design in `docs/ARCHITECTURE.md` §16: periodically re-fans-out events stuck at `queue_failed` or `received` for too long, capped at 3 attempts per event.
- **A Postgres schema modeling the full multi-tenant shape** the system is designed to grow into — organizations, applications, endpoints, events, deliveries, delivery attempts, plans/subscriptions for billing — even where the application code doesn't fully exercise every table yet (see Roadmap below).

## Why these choices

- **RabbitMQ over Kafka** — Postie is a task queue problem (attempt a delivery, retry on failure, eventually give up), not a stream-processing problem. No replay requirement, no need for Kafka's operational overhead at this scale. Full reasoning in [`docs/QUEUE_DECISION.md`](./docs/QUEUE_DECISION.md).
- **PostgreSQL over a document store** — the data has real relational structure (one app has many endpoints, one event can fan out to many deliveries) that benefits from foreign keys and transactions rather than fighting against them.
- **At-least-once delivery** — Postie would rather deliver a webhook twice than lose it. Consumers are expected to dedupe on `messageId`.
- **A modular monolith, not microservices** — this is a project built and operated by one person; premature service boundaries would add coordination overhead with no corresponding benefit yet.

## Stack

Node.js · Express · PostgreSQL + Prisma · RabbitMQ (amqplib) · axios · express-validator

## Running locally

```bash
docker compose up -d        # Postgres + RabbitMQ
npx prisma migrate deploy   # apply schema
node prisma/seed.js         # seed a test org/application/endpoint

npm run dev                        # API on :3000
npm run start:worker               # delivery worker, separate terminal
npm run start:retry-poller         # retry poller, separate terminal
npm run start:recovery-scan        # recovery scan, separate terminal
```

Run the test suite with `npm test` (needs `docker compose up -d` running — no isolated test database yet, see Roadmap).

## API

| Endpoint | Description |
|---|---|
| `POST /api/events` | Create an event, persist it, publish it for delivery |
| `GET /api/events` | List events, cursor-paginated (`?cursor=`, `?limit=`) |
| `GET /api/events/:id` | Fetch a single event, `404` if it doesn't exist |
| `GET /health` | Liveness check |

## Roadmap — designed, not yet (re)built

Documented deliberately rather than hidden, since knowing what's missing is part of the design:

- **Endpoint management API.** Right now `Endpoint` rows only exist via `prisma/seed.js` — there's no way for a customer to register/update/disable an endpoint themselves. This is its own epic (Application & Endpoint Management), separate from the delivery pipeline above.
- **Auth.** `Organization`, `User`, `ApiKey` are modeled in the schema but nothing enforces them yet — `POST /api/events` doesn't check who's calling.
- **Isolated test database.** The current test suite (`npm test`) runs its integration test against the same dev Postgres/RabbitMQ from `docker-compose.yml`, not a dedicated test instance — fine for now, but test data and dev data currently share the same tables.
- **Billing (`Plan`/`Subscription`/`UsageRecord`).** Modeled in the schema, no application code uses them yet.
