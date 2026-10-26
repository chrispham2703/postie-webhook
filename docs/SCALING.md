# Scaling Postie to 10,000 events a second

> Week 10 system design question, in plain words. Numbers are rough, to show the idea.

**The question:** 1,000 customers send 10,000 events a second (about 10 each). What
breaks, and how do I fix it?

Setup (signup, API key, endpoint) happens **once** per customer. Sending events happens
**all the time**, so that's the part that has to scale.

---

## The path of one event

```
receive  →  save  →  queue  →  deliver
  API      Postgres  RabbitMQ   worker
```

At 10,000 a second, **all four break**.

---

## 1. Receive (API)

- **Breaks:** one server can't take 10,000 requests a second. Also, today's rate limit
  (100 a minute) would block a busy customer.
- **Fix:** run several copies behind a **load balancer**. This works because the API
  remembers nothing itself. Everything goes to the database (**stateless**).
- **Hidden problems with copies:**
  - Each copy counts the rate limit on its own, so 3 copies = 3× the limit → keep one
    shared counter (e.g. Redis)
  - Each copy opens its own database connections → see below

## 2. Save (database): breaks first

- **Breaks:** every event is several writes, so 20–30 thousand writes a second, and
  around 860 million new rows a day. Everything else depends on it.
- **Fix, easiest first:**
  1. **Connection pooling:** share a few connections instead of thousands
  2. **Indexes:** jump straight to the right rows
  3. **One table per month** (partitioning): old months can be archived or dropped
  4. **Read copies** (replicas): help the dashboard's reads, but not writes
  5. Last: **split the data** across databases by customer (sharding). Hardest, so last
- **Why copying a database is hard:** the API remembers nothing, so copies never need to
  agree. A database *is* the memory, so its copies must always agree, which is hard. So
  writes go to one main database, and copies are only for reading.

## 3. Queue (RabbitMQ)

- **Breaks:** one RabbitMQ, on a free plan. If it dies, nothing gets delivered.
- **Fix:**
  - A bigger plan (**scale up**), and several RabbitMQ servers working as one (**cluster**,
    scale out)
  - **Prefetch:** limit how many messages each worker holds at once, so work is shared
    fairly. Postie doesn't set this yet.
  - **Kafka?** Faster at huge scale, but loses easy "this one failed, retry it later".
    Postie is a task queue, not a data stream (`docs/QUEUE_DECISION.md`), so RabbitMQ stays.

## 4. Deliver (worker)

- **Breaks:** each delivery waits for the other server (up to 5 seconds).
- **Fix:** more workers.
  - **How many?** Jobs per second × time per job = jobs running at once.
    10,000 × 0.5 s = 5,000 at once. If each worker handles 100 → **about 50 workers**.
- **Duplicates:** if a worker crashes after sending but before confirming, the message is
  sent again. Postie accepts that: **twice is better than lost**. Every message has a
  unique ID, so the receiver can skip repeats (**idempotency**, like a lift button).

## 5. Monitoring

Watch four numbers, with alerts:

| Number | Tells you |
|---|---|
| Queue length | Workers can't keep up |
| Messages that gave up (dead letter list) | Something keeps failing |
| How late messages arrive (slowest 5%, p95) | Working, but slow |
| Paused endpoints (circuit breakers) | 1 is normal, 50 means something big is wrong |

## 6. The price

- **Breaks first:** the database
- **You give up:** simplicity, strict order (message 2 may arrive before message 1), and
  exactly once delivery
- **The bill:** from almost free to hundreds or thousands of dollars a month
- **So:** only scale what actually hits its limit, and start with the simplest fix

---

## Two words to remember

- **Scale up** = make one machine stronger. Easy, but it has a ceiling, and it's still one.
- **Scale out** = add more machines. No ceiling and survives failures, but brings the
  hidden problems above.

---

## What Postie has today

- ✅ Stateless API, at least once delivery, unique message IDs, circuit breaker, index on retry time
- ✅ Real health check (tests the database), uptime alerts, automatic migrations on deploy (October 2026)
- ❌ One copy of everything, free plan queue, no prefetch limit
- ❌ Retry poller loads every due delivery at once (`src/workers/retryPoller.js`)
- ❌ `deliveryWorker.js` doesn't reconnect if its queue connection drops

## Self test (no notes)

1. Draw the path of one event and say what breaks at each stop.
2. Why is copying the API easy but copying the database hard?
3. Scale up vs scale out, with an example of each.
4. Why "twice is better than lost", and what does the receiver do?
5. Which four numbers would you watch?
