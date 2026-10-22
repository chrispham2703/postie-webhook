# Scaling Postie to 10,000 events/second

> Study notes for the Week 10 system design question. Written in plain words on purpose.
> Numbers are rough, to show the idea, not measured.

**The question:** *"A startup uses Postie. Now 1,000 customers send 10,000 events every second
(about 10 each). What breaks, and how would you fix it?"*

**What one event looks like** (`POST /api/events`):
```json
{ "appId": "app_test_1", "eventType": "order.shipped", "payload": { "orderId": "A1234" } }
```
Setup (signup, API key, application, endpoint) happens **once** per customer. Sending events
happens **all the time**, so the event path is what has to scale.

---

## The path of one event

```
10,000/sec → 🚪 API → 📒 Database → 📬 Queue → 🚚 Worker → customer's server
```

---

## The 6 parts

### 1. 🚪 API: the front door
- **What breaks:** one server can't take 10,000/sec. Also, today's rate limit is
  100/min per IP (`src/routes/events.js`), so a busy customer gets blocked first.
- **Fix:** **scale out**, i.e. run several copies of `app.js` behind a **load balancer**
  (Railway: Settings → Replicas). It works because the API is **stateless**: it saves
  everything to the database, so any copy can handle any request.
- **Hidden problems when you copy a server:**
  - The rate-limit **counter** lives in each copy's memory, so 3 copies = 3× the limit.
    Fix: one shared counter (e.g. Redis).
  - Each copy opens its own **database connections**, so 3 copies = 3× the connections.
    Fix: connection pooling (see Database).

### 2. 📒 Database: the notebook
- **What breaks:** every event = several writes (event + deliveries + attempts), so that's
  20,000–30,000 writes/sec and around 860 million new rows a day. **Usually breaks first**,
  because every other part depends on it.
- **Fix, simple first:**
  - Archive old delivered events, so the main tables stay small
  - Connection pooling: share a few connections instead of opening thousands
  - Indexes, so searches jump to the right rows (e.g. `@@index([nextAttemptAt])`)
- **Fix, when that's not enough:**
  - **Read replicas:** copies that handle *reads* (dashboard). Doesn't help writes.
  - **Sharding:** split the data (customers A–M on DB 1, N–Z on DB 2). Helps *writes*,
    but makes queries across everyone hard.

**Why copying a database is hard, but copying the API is easy:**
- The API **remembers nothing**, so copies never need to agree on anything.
- A database **is** the memory. Two copies must always agree. If Sarah's order is written
  to copy 1, copy 2 must get it too, and until it does, they disagree. If both copies
  change the same row at the same moment, which one wins? Keeping copies in sync is the
  hard part.
- That's why replicas take **writes on one main database only**, and why splitting needs
  a clear rule for "which data lives where".

### 3. 📬 Queue: the waiting line
- **What breaks:** CloudAMQP free plan (tiny), and only **one** RabbitMQ. If it dies,
  nothing is delivered.
- **Fix:**
  - **Scale up:** a bigger, paid plan
  - **Scale out:** a RabbitMQ **cluster**, several servers working as one. If one dies, the
    others continue.
  - **Kafka:** built for huge streams, but more complex, and loses things Postie relies on
    (simple per-message "failed, retry later"). Postie is a task queue problem, not a
    stream problem (`docs/QUEUE_DECISION.md`), so a RabbitMQ cluster is usually enough.

### 4. 🚚 Worker: the delivery driver
- **What breaks:** the worker waits for each customer's server to answer (up to the 5s
  timeout). One worker handles only a few per second.
- **Fix:** **more workers.** RabbitMQ gives each message to only one worker automatically.
- **Hidden problem: duplicates.** A worker sends a message, then crashes before telling
  RabbitMQ "done" (`channel.ack`). RabbitMQ gives it to another worker, so it's sent twice.
  - Postie's choice: **at-least-once**. Better twice than lost: a duplicate can be caught,
    a lost message is invisible.
  - **Idempotency:** every message has a unique ID. The *receiver* keeps a list of IDs it
    has seen and skips repeats, like a lift button: pressing twice still goes to the floor once.

### 5. 👀 Monitoring: the dashboard
At 10,000/sec things go wrong constantly, often at 3am. Watch 4 gauges, each with an alert:

| Gauge | Tells you |
|---|---|
| Queue length | Workers can't keep up |
| Messages that gave up (dead-letter) | Something keeps failing, so customers are losing messages |
| How late messages arrive (p95) | Working, but slow. Look at the slowest 5%, not the average |
| Circuit breaker state | 1 paused endpoint = normal, 50 = something big is wrong |

Example alert: *"queue longer than 50,000 for 5 minutes → message the engineer."*

### 6. ⚖️ Trade-offs
- **What breaks first:** the database, because everything depends on it.
- **What you give up:**

  | You gain | You give up |
  |---|---|
  | Many servers and workers | Simplicity: more moving parts, harder to debug |
  | Workers in parallel | Perfect order: message 2 can arrive before message 1 |
  | Never losing a message | Exactly once: sometimes a message arrives twice |

- **The bill:** today, free plans (roughly $0–20/month). At 10,000/sec, many servers, a big
  database, paid RabbitMQ and monitoring: hundreds to thousands a month. So scale only
  what you need, and start simple.

---

## Two words to remember

- **Scale up** = make the one machine stronger. Easy, but there's a ceiling, and it's still
  only one.
- **Scale out** = add more machines. No ceiling, survives failures, but brings the hidden
  problems (shared counters, connections, duplicates).
- Usual order: scale **up** first, then **out**.

---

## What Postie has today (honest)

- ✅ Stateless API, at-least-once delivery, `messageId` for dedupe, circuit breaker, index on `nextAttemptAt`
- ❌ One copy of everything, free-tier queue
- ❌ No monitoring or alerts; `/health` always says "ok"
- ❌ Live migrations run by hand
- ❌ Retry poller loads every due delivery at once (`src/workers/retryPoller.js`, no `take`)

## Still open
- Coach's probe: *"Which parts would you let an agent build, and which would you design yourself?"*

## Self-test (no notes)
1. Draw the path of one event, and say what breaks at each stop.
2. Why is copying the API easy but copying the database hard?
3. Scale up vs scale out, with an example of each.
4. Why at-least-once, and what does the receiver do about duplicates?
5. Which 4 gauges would you watch?
