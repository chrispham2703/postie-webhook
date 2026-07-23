
# Queue Decision — RabbitMQ vs Kafka

> **Status:** Living document
> **Related:** [ARCHITECTURE.md](./ARCHITECTURE.md) §11

---

## 1. Comparison Table

| Aspect | RabbitMQ | Kafka |
|---|---|---|
| Core model | Message queue — a message is consumed, acked, then gone | Distributed log — messages are retained and can be re-read |
| Delivery pattern | Push-based: broker pushes to consumer | Pull-based: consumer tracks its own read position (offset) |
| Ordering | FIFO per queue with a single consumer; no global ordering guarantee across consumers | Guaranteed ordering per partition |
| Replay | Not built in — once acked, the message is gone | Native — any consumer can re-read from any point in history |
| Retry / delay | Natural fit: nack + requeue, DLQ, or delayed-exchange plugin for backoff | Awkward: usually requires re-publishing to a separate "retry" topic; no native per-message delay |
| Throughput ceiling | Good for moderate task-queue workloads | Built for very high-volume streaming |
| Operational cost | Single broker, simple to run locally and in small deployments | Heavier: partition planning, replication, Zookeeper/KRaft — non-trivial for a small team |
| Best fit | Task/job queues, RPC-style work distribution, "do this thing, retry if it fails" | Event streaming, analytics pipelines, event sourcing, systems that need history replay |

---

## 2. Why RabbitMQ for Postie

Postie's core job is a **task-queue problem**, not a **stream-processing problem**: *"take this webhook delivery job, attempt it, retry with backoff if it fails, eventually give up."* That maps directly onto RabbitMQ's ack/nack/DLQ model — a message is either successfully handled or it isn't, and RabbitMQ's job is exactly to track that per message.

Specific reasons:

- **No replay requirement.** Once a webhook is delivered, Postie never needs to "go back" and reprocess it. Kafka's headline feature — long retention plus replay — solves a problem Postie doesn't have.
- **Per-job retry semantics.** Delivery attempts need individual backoff (`nack` a specific message, requeue it later). This is a first-class pattern in RabbitMQ. In Kafka, the same behavior needs to be hand-rolled by re-publishing to a separate retry topic.
- **Operational cost fits the team size.** Postie is currently a single-developer project (see ARCHITECTURE.md §12). RabbitMQ runs as one container with no partition/replication planning. Kafka's operational surface (partitions, consumer groups, broker cluster) is complexity with no corresponding benefit at this scale.
- **No cross-event ordering requirement.** Each webhook delivery is independent per endpoint — Postie doesn't need Kafka's per-partition ordering guarantees, which exist to solve a problem (strict event order across a stream) that doesn't apply here.

Feynman explanation:

> RabbitMQ is a delivery counter — a task comes in, someone picks it up, does the job, and it's done. Kafka is a recorded broadcast — anyone can tune in and re-watch from any point. Postie needs the delivery counter, not the recording.

---

## 3. When Postie Would Switch to Kafka

Kafka becomes the right tool if Postie's requirements change in either of these directions:

1. **Event replay becomes a real feature.** For example, if customers want "re-deliver every event from the last 7 days" or Postie needs to rebuild derived state (analytics, audit trail) from historical events — Kafka's retention model solves this natively; RabbitMQ does not (a consumed message is gone).
2. **Multiple independent consumers need the same event stream.** If Postie grows to have, say, a delivery worker *and* a separate analytics service *and* an audit-log service, all reading the same events independently and repeatedly — Kafka's "one log, many consumer groups, each with its own offset" model fits that naturally. Doing this in RabbitMQ requires fan-out exchanges that duplicate every message per consumer, which gets harder to reason about as more long-lived readers are added.
3. **Throughput outgrows a single-broker queue.** If event volume reaches a scale where RabbitMQ's per-message overhead becomes the bottleneck, Kafka's log-based model is built for that scale.

None of these apply to Postie today — this section exists so the trade-off is revisited deliberately if the requirements above show up, not by default.
