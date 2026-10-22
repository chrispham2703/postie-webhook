# Deploying Postie

Postie runs as 4 separate processes from the same Docker image, each with a different start command:

| Service | Command | Needs a public port? |
|---|---|---|
| API | `node src/app.js` (Dockerfile `CMD`, no override) | Yes |
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
6. **Migrations run automatically.** The API service has a **Pre-deploy command** set in Railway (Settings → Deploy): `npx prisma migrate deploy`. Railway runs it before every new deployment starts, so the live database always matches the code. If the migration fails, the new version doesn't start (per Railway's design; not yet tested here). Only the API service has this, so the 4 services don't all try to change the database at once. (Before this, migrations were run by hand, and forgetting once broke the live site; see `docs/AI_WORKFLOW.md` Entry 8.)
7. **Seed once** (optional, for a demo endpoint to exist): `DATABASE_URL=<railway-url> RABBITMQ_URL=<cloudamqp-url> node prisma/seed.js`.

## Current status

Deployed on Railway (API, 3 workers, frontend, Postgres) with CloudAMQP for the queue. Pushes to `main` deploy automatically.
