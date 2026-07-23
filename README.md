# Postie

A webhook delivery service — the piece of infrastructure that sits between "something happened in your app" and "the other systems that need to know about it," so the caller doesn't have to trust that every receiving server is online, fast, and reliable.

> Full write-up of the design, and the trade-offs behind it, in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and [`docs/QUEUE_DECISION.md`](./docs/QUEUE_DECISION.md).

## What it does today

```txt
Client → POST /api/events → saved to PostgreSQL → published to RabbitMQ → worker delivers it via HTTP
```

- **Event ingestion API** — `POST /api/events` validates the request, persists it, and publishes a delivery job to RabbitMQ. If the queue publish fails, the event is marked `queue_failed` instead of silently disappearing (the DB write already succeeded by that point).
- **Cursor-based pagination** on `GET /api/events` — built on Prisma's cursor pagination rather than offset, so results stay correct even as new events are inserted concurrently.
- **A standalone delivery worker** (`src/workers/deliveryWorker.js`) that connects to RabbitMQ, consumes queued jobs, fetches the full event from Postgres, delivers it over HTTP with `axios`, and acks/nacks the message depending on outcome.
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
node prisma/seed.js         # seed a test org/application

npm run dev                 # API on :3000
node src/workers/deliveryWorker.js   # worker, in a separate terminal
```

## API

| Endpoint | Description |
|---|---|
| `POST /api/events` | Create an event, persist it, publish it for delivery |
| `GET /api/events` | List events, cursor-paginated (`?cursor=`, `?limit=`) |
| `GET /api/events/:id` | Fetch a single event, `404` if it doesn't exist |
| `GET /health` | Liveness check |

## Roadmap — designed, not yet (re)built

Documented deliberately rather than hidden, since knowing what's missing is part of the design:

- **Fan-out to multiple endpoints per event.** The schema already supports one event reaching many subscriber endpoints per application; the worker currently delivers to a single target and needs the fan-out step wired back in.
- **Retry with exponential backoff.** `docs/ARCHITECTURE.md` §5 designs this (30s → 2m → 10m → 1h → 6h → 24h); not yet implemented in the current worker.
- **Recovery scan for stuck events** (`docs/ARCHITECTURE.md` §16) — a scheduled job to catch events that reached the queue but were never confirmed delivered. Design only, on purpose, for now.
- **HMAC request signing** and a **dead-letter queue** for repeatedly-failing deliveries — both designed in the architecture doc, not yet implemented.
