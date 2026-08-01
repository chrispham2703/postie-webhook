# Deploying Postie

Postie runs as 4 separate processes from the same Docker image, each with a different start command:

| Service | Command | Needs a public port? |
|---|---|---|
| API | `npm start` | Yes |
| Delivery worker | `npm run start:worker` | No |
| Retry poller | `npm run start:retry-poller` | No |
| Recovery scan | `npm run start:recovery-scan` | No |

All 4 need the same env vars: `DATABASE_URL`, `RABBITMQ_URL`, and (API only) `PORT`.

## Recommended platform: Railway + CloudAMQP

Why: Railway gives managed Postgres and lets each of the 4 processes above run as its own service from one repo/image, with no port exposed for the 3 background ones. Railway (and Render) don't offer managed RabbitMQ, so pair it with CloudAMQP's free tier ("Little Lemur") for the queue — takes 2 minutes to provision, gives you an `amqp://` URL to drop straight into `RABBITMQ_URL`.

## Steps

1. **CloudAMQP** — create a free "Little Lemur" instance, copy its AMQP URL → this is `RABBITMQ_URL`.
2. **Railway project** — create a project from this GitHub repo.
3. **Add a Postgres plugin** in Railway — it gives you `DATABASE_URL` automatically.
4. **Create 4 services** from the same repo, one per row in the table above, each with its own start command override (Railway lets you override the Dockerfile `CMD` per service). Only the API service gets a public domain/port.
5. **Set env vars** on all 4 services: `DATABASE_URL` (from step 3), `RABBITMQ_URL` (from step 1), `PORT` (API only, Railway sets this automatically).
6. **Run migrations once** against the Railway Postgres: `DATABASE_URL=<railway-url> npx prisma migrate deploy`.
7. **Seed once** (optional, for a demo endpoint to exist): `DATABASE_URL=<railway-url> RABBITMQ_URL=<cloudamqp-url> node prisma/seed.js`.

## Before doing this for real

This step touches real external accounts (Railway, CloudAMQP) and will expose a public URL — nothing here has been provisioned yet. Confirm which accounts to use (existing or new) before creating anything.
