# Postie — System Architecture (Feynman Version)

> **Status:** Living document  
> **Last updated:** May 13, 2026  

---

## 1. What is Postie?

Postie is a **webhook delivery service**.

In simple words, Postie helps one application send important event messages to another application in a reliable way.

For example, imagine an online store creates a new order. The store may need to tell another system about that order, such as a warehouse system, a finance system, or a customer relationship management system. That notification is often sent through a webhook.

A basic webhook flow looks like this:

```txt
Something happens in App A
→ App A sends an HTTP request to App B
→ App B receives the event and does something with it
```

At first, this sounds simple. However, real systems are not always reliable. The receiving server may be down, slow, overloaded, or temporarily unavailable. Postie exists to handle those problems.

A simple way to describe Postie is:

> Postie is like a smart post office for webhooks. It receives the message, writes it down, puts it in a queue, sends it to the receiver, and tries again if the first delivery fails.

---

## 2. A Real-Life Example

Imagine a small e-commerce company called **Pho Anh Hai**.

Pho Anh Hai sells grocery boxes online. When a customer places an order, Pho Anh Hai needs to notify three external systems:

1. The warehouse system, so staff can pack the order
2. The delivery company, so a driver can be assigned
3. The email system, so the customer receives a confirmation email

Without Postie, Pho anh Hai might directly send webhook requests to all three systems:

```txt
Pho Anh Hai App
→ Warehouse API
→ Delivery API
→ Email API
```

This works only when everything is healthy.

But what if the delivery company’s API is down for 10 minutes?

If Pho anh Hai sends the webhook only once, the delivery company may never receive the order. That means the customer pays for the order, but no driver is assigned.

With Postie, the flow becomes safer:

```txt
Pho Anh Hai App
→ Postie receives the order event
→ Postie saves the event in PostgreSQL
→ Postie puts a message into RabbitMQ
→ A worker sends the webhook to the delivery company
→ If delivery fails, Postie retries later
```

This means Pho Anh Hai does not need to wait for the delivery company’s server to be ready. Postie protects the event and keeps trying.

---

## 3. High-Level Architecture

```txt
Client App
   |
   | sends event, for example: "order.created"
   v
Postie API
   |
   | saves event data
   v
PostgreSQL
   |
   | puts delivery job into queue
   v
RabbitMQ
   |
   | worker takes message from queue
   v
Delivery Worker
   |
   | sends webhook request
   v
Customer Endpoint
```

A simple human explanation:

```txt
Postie API      = front desk
PostgreSQL      = official notebook
RabbitMQ        = waiting line
Worker          = delivery person
Customer API    = receiver's address
```

The API receives the event. The database stores the event. The queue holds the delivery job. The worker takes the job and sends it to the customer endpoint.

---

## 4. Main Components

### 4.1 Postie API

The Postie API is the front door of the system.

Its job is to:

- receive webhook events from client applications
- check whether the request is allowed
- validate the request body
- save the event into PostgreSQL
- publish a message into RabbitMQ
- return a response quickly

The API should not wait until the webhook has been fully delivered. If the API waits for every delivery, the client will experience slow responses.

Instead, Postie should say:

```txt
"I received your event. I saved it. I will deliver it in the background."
```

This is why the API can return a response such as:

```txt
202 Accepted
```

This means the request has been accepted for processing, but the full work may happen later.

---

### 4.2 PostgreSQL

PostgreSQL is the main database.

It stores important records such as:

- users
- applications
- endpoints
- events
- deliveries
- delivery attempts
- failure logs

Postie uses PostgreSQL because the data has clear relationships.

For example:

```txt
One user can own many applications.
One application can have many webhook endpoints.
One event can have many delivery attempts.
```

This kind of data fits a relational database well.

Feynman explanation:

> PostgreSQL is like the official notebook of Postie. If Postie receives an event, it must write it down properly. If something goes wrong later, Postie can look back at the notebook and know what happened.

PostgreSQL is also useful because it supports transactions. A transaction helps group multiple database operations together so they succeed or fail as one unit. This is important when working with reliable systems.

---

### 4.3 RabbitMQ

RabbitMQ is the message queue.

Its job is to hold work that should be processed later.

Without RabbitMQ:

```txt
Client sends event
→ Postie sends webhook immediately
→ Customer endpoint is slow
→ Client has to wait
```

With RabbitMQ:

```txt
Client sends event
→ Postie saves event
→ Postie puts delivery job into RabbitMQ
→ Postie responds quickly
→ Worker processes the job later
```

Feynman explanation:

> RabbitMQ is like a post office. You give the letter to the post office and continue your day. You do not stand outside the receiver’s house waiting for them to open the door.

RabbitMQ helps Postie become more reliable because the API and the worker are separated. The API can receive events quickly, while the worker can process deliveries at a safe speed.

---

### 4.4 Delivery Worker

The worker runs in the background.

Its job is to:

- take messages from RabbitMQ
- load the correct endpoint information
- sign the webhook payload
- send an HTTP request to the customer endpoint
- record success or failure
- retry later if needed
- acknowledge the message when the job is done

Feynman explanation:

> If Postie API is the receptionist, the worker is the delivery person. The receptionist receives the parcel. The delivery person takes it and sends it to the final address.

The worker is important because webhook delivery can be slow or unreliable. It should not block the main API request.

---

## 5. Why Webhook Delivery Is Hard

Webhook delivery sounds simple, but it becomes difficult in real production systems.

---

### Problem 1: The customer endpoint may be down

The customer server may be offline because of deployment, maintenance, or an outage.

A naive system may do this:

```txt
Send webhook once
→ It fails
→ Give up
```

That is dangerous because the event is lost.

Postie’s decision:

```txt
Save the event first
Retry delivery later
Do not lose the event immediately
```

---

### Problem 2: The customer endpoint may be slow

Some endpoints may take too long to respond.

If Postie waits too long, workers become stuck.

Postie’s decision:

```txt
Use a reasonable timeout
Mark slow requests as failed
Retry later
```

---

### Problem 3: The customer endpoint may return 500 errors

A 500 error usually means the customer server has a problem.

If Postie retries immediately many times, it can make the customer system even worse.

Postie’s decision:

```txt
Use retry with exponential backoff
```

This means Postie waits longer after each failure:

```txt
30 seconds
→ 2 minutes
→ 10 minutes
→ 1 hour
→ 6 hours
→ 24 hours
```

Feynman explanation:

> If you call someone and they do not answer, you should not call them 100 times in one minute. You wait for a while and try again later.

---

### Problem 4: The customer endpoint may return 429

A 429 response means:

```txt
"You are sending too many requests. Slow down."
```

Postie should respect this signal.

Postie’s decision:

```txt
Wait longer before retrying
Respect Retry-After if the customer provides it
```

---

### Problem 5: Webhooks can be faked

A webhook endpoint is just a URL. If an attacker knows the URL, they may try to send fake events.

Postie’s decision:

```txt
Use HMAC signing
```

This means Postie signs the webhook using a secret. The customer can verify the signature before trusting the request.

Feynman explanation:

> HMAC is like a signature on a letter. The receiver checks the signature to know whether the letter really came from Postie.

---

### Problem 6: Events may be delivered more than once

In distributed systems, it is difficult to guarantee that something happens exactly once.

For example:

```txt
Worker sends webhook successfully
→ Customer receives it
→ Worker crashes before saving "success"
→ Postie is not sure whether delivery worked
→ Postie may retry
```

This can create duplicate delivery.

Postie’s decision:

```txt
Use at-least-once delivery
```

This means:

```txt
Postie prefers duplicate delivery over lost delivery.
```

The customer can use a unique `message_id` to ignore duplicates.

---

## 6. At-Least-Once Delivery

There are three common delivery styles:

```txt
At-most-once    = send at most one time, but the event may be lost
At-least-once   = send at least one time, but duplicates may happen
Exactly-once    = sounds perfect, but is very hard in distributed systems
```

Postie chooses **at-least-once delivery**.

Why?

Because for important business events, losing the event is worse than sending it twice.

Example:

```txt
If an order event is sent twice, the receiver can ignore the duplicate.
If an order event is lost, the warehouse may never pack the order.
```

So Postie chooses reliability first.

---

## 7. Dead Letter Queue

A Dead Letter Queue, or DLQ, is a place for messages that fail too many times.

Example:

```txt
Attempt 1 fails
Attempt 2 fails
Attempt 3 fails
Attempt 4 fails
Attempt 5 fails
Attempt 6 fails
→ move to DLQ
```

Feynman explanation:

> The DLQ is like a special box for letters that could not be delivered. We do not throw them away immediately. We keep them so a human or admin process can inspect them later.

The DLQ helps Postie avoid retrying forever while still keeping failed events visible.

---

## 8. Circuit Breaker

A circuit breaker protects the system from repeatedly calling a broken endpoint.

Example:

```txt
Customer endpoint fails 5 times in 1 minute
→ Postie pauses delivery to that endpoint for 5 minutes
→ Later, Postie tries again
```

Feynman explanation:

> If you ring someone’s doorbell five times and nobody answers, you should not keep pressing the bell forever. You stop for a while and come back later.

A circuit breaker helps Postie:

- reduce wasted work
- avoid making customer outages worse
- protect worker capacity
- reduce noisy logs

---

## 9. Docker Compose in Postie

Docker Compose is used for local development infrastructure.

In Postie, Docker Compose runs:

```txt
PostgreSQL
RabbitMQ
Docker volumes
Docker network
```

The Express app can still run locally with:

```bash
npm run dev
```

This local development style is useful because the app code changes often. Running it locally makes hot reload and debugging easier.

Meanwhile, PostgreSQL and RabbitMQ are heavier infrastructure services. They are harder to install manually and should use consistent versions. Docker Compose helps with that.

Feynman explanation:

```txt
Node.js app        = the chef changing the recipe often
PostgreSQL        = the storage room
RabbitMQ          = the delivery counter
Docker Compose    = the tool that starts the storage room and delivery counter
```

We do not need to put the chef inside Docker during early local development. We only need Docker to run the heavy support systems.

---

## 10. Why PostgreSQL Instead of MongoDB?

MongoDB is flexible, but Postie has structured data with clear relationships.

Postie data looks like this:

```txt
User
→ Application
→ Endpoint
→ Event
→ Delivery
→ Attempt
```

This fits PostgreSQL well because PostgreSQL is designed for relational data, constraints, and structured queries.

Feynman explanation:

```txt
MongoDB     = a flexible box where items can have many shapes
PostgreSQL = a filing cabinet with clear drawers and labels
```

Postie needs the filing cabinet because its data relationships are clear and important.

---

## 11. Why RabbitMQ Instead of Kafka?

Kafka is powerful, but it is designed for large-scale event streaming and long-term replay.

Postie version 1 does not need that level of complexity.

Postie needs:

```txt
receive event
put event in queue
worker processes event
retry if delivery fails
```

RabbitMQ is a better fit because it is simpler for queue-based background work.

Feynman explanation:

```txt
RabbitMQ = a delivery queue
Kafka    = a huge event highway and history log
```

Postie needs a delivery queue, not a huge highway.

---

## 12. Why Modular Monolith Instead of Microservices?

Postie is a portfolio project built by one developer.

If Postie starts as many microservices, the project becomes harder too early.

Microservices would require extra work:

```txt
service discovery
networking
multiple deployments
multiple logs
harder debugging
API gateway
```

Postie chooses a **modular monolith**.

This means:

```txt
One application is deployed
But the code is organised into clear modules
```

Feynman explanation:

> A modular monolith is like one house with many clean rooms. Microservices are like many separate houses. For one developer, one clean house is easier to build and manage.

---

## 13. Real-Life Scenario: Restaurant Ordering Platform

Imagine Postie is used by a restaurant ordering platform called **MealNow**.

MealNow has many restaurants. When a customer places an order, MealNow must notify each restaurant’s kitchen system.

### Without Postie

```txt
Customer places order
→ MealNow calls restaurant webhook directly
→ Restaurant system is offline
→ Webhook fails
→ Kitchen never receives the order
```

This is a serious business problem. The customer paid, but the restaurant may not prepare the food.

### With Postie

```txt
Customer places order
→ MealNow sends "order.created" event to Postie
→ Postie saves the event in PostgreSQL
→ Postie puts a delivery message into RabbitMQ
→ Worker sends webhook to restaurant kitchen
```

If the restaurant system is online:

```txt
Restaurant returns 200 OK
→ Worker marks delivery as successful
→ RabbitMQ message is acknowledged
```

If the restaurant system is offline:

```txt
Webhook fails
→ Worker records failure
→ Postie schedules a retry
→ Worker tries again later
```

If it keeps failing:

```txt
After several attempts
→ Message goes to DLQ
→ Admin can inspect or replay it later
```

This makes MealNow more reliable because order events are not easily lost.

The most important idea is:

> MealNow does not need to wait for the restaurant system to be ready. Postie protects the event and delivers it when possible.

---

## 14. Summary

Postie works like this:

```txt
Client sends event
→ Postie API receives it
→ PostgreSQL stores it
→ RabbitMQ queues it
→ Worker sends it
→ If it fails, Postie retries
→ If it keeps failing, Postie moves it to DLQ
```

The main goal of Postie is reliability.

Postie chooses:

```txt
Reliability over speed
Simple architecture over unnecessary complexity
Clear trade-offs over fake perfection
```

A simple final sentence:

> Postie is a smart post office for webhooks. It receives important messages, stores them safely, queues them, delivers them, retries when needed, and keeps failed messages for later review.

---

## 15. Key Terms

| Term | Simple Meaning |
|---|---|
| Webhook | A way for one app to notify another app when something happens |
| Postie API | The front door that receives events |
| PostgreSQL | The official notebook where important data is stored |
| RabbitMQ | The waiting line for delivery jobs |
| Worker | The background process that sends webhooks |
| Retry | Try again after failure |
| Exponential backoff | Wait longer after each failure |
| DLQ | A box for messages that failed too many times |
| HMAC | A signature that proves the webhook came from Postie |
| At-least-once | The event may be delivered more than once, but should not be lost |
| Idempotency | Handling duplicate events safely |
| Circuit breaker | Temporarily stop calling an endpoint that keeps failing |
| Docker Compose | A tool to start local infrastructure like PostgreSQL and RabbitMQ |
