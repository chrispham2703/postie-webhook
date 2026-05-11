# Postie — Architecture

> **Status:** Living document
> **Last updated:** May 11, 2026

## 1. Overview

### What is Postie?

Postie is a webhook delivery and processing platform designed to receive, queue, and process webhook events reliably using asynchronous communication patterns. The system focuses on decoupling services, improving reliability, and preventing webhook producers from blocking while downstream services are busy or temporarily unavailable.

### Core capabilities

* Receive webhook events through HTTP endpoints
* Queue webhook events asynchronously using RabbitMQ
* Process webhook jobs in background workers
* Persist webhook/event metadata in PostgreSQL
* Expose health monitoring endpoints
* Support retryable and scalable event processing architecture

### Non-goals

* Real-time websocket communication
* Large-scale event streaming analytics
* Kafka-scale distributed log processing
* User-facing frontend application
* Complex workflow orchestration
* Long-term event archival system

---

## 2. System Architecture

```txt
                    ┌──────────────────┐
                    │  External Client │
                    │  / Webhook Sender│
                    └────────┬─────────┘
                             │ HTTP Request
                             ▼
                    ┌──────────────────┐
                    │   Express API    │
                    │   (Node.js)      │
                    └────────┬─────────┘
                             │
                Store metadata / logs
                             │
                             ▼
                    ┌──────────────────┐
                    │   PostgreSQL     │
                    └──────────────────┘

                             │
                     Publish Message
                             │
                             ▼
                    ┌──────────────────┐
                    │    RabbitMQ      │
                    │   Message Queue  │
                    └────────┬─────────┘
                             │
                      Consume Message
                             ▼
                    ┌──────────────────┐
                    │ Background Worker│
                    │ Event Processor  │
                    └──────────────────┘
```

---

## 3. Technology Stack

### Language: Node.js

**Why:**
Node.js uses an asynchronous event-driven architecture and non-blocking I/O model, making it suitable for webhook systems and network applications handling many concurrent requests. Its lightweight concurrency model fits queue-based systems well. ([Node.js][1])

### Framework: Express

**Why:**
Express provides a minimal and flexible HTTP framework for Node.js. It simplifies route handling, middleware management, JSON parsing, and API development while remaining lightweight and easy to extend.

### Database: PostgreSQL

**Why:**
PostgreSQL provides strong relational consistency, ACID transactions, indexing, and reliable structured data storage. Postie requires predictable relational data handling for webhook events, delivery attempts, logs, and retry metadata. Compared to MongoDB, PostgreSQL offers stronger transactional guarantees and better relational integrity for this use case.

### Queue: RabbitMQ

**Why:**
RabbitMQ allows asynchronous communication between services using message queues. It decouples webhook ingestion from webhook processing so the API layer does not block while downstream systems are busy. RabbitMQ was selected over Redis because it provides stronger queue semantics and delivery guarantees. Kafka was considered unnecessary because Postie does not require massive event-stream replay or distributed log retention.

### Container: Docker Compose (local dev only)

**Why:**
Docker Compose is used to run infrastructure services such as PostgreSQL and RabbitMQ consistently across development environments. The Express application itself runs locally during development to improve hot reload speed, debugging experience, and iteration speed.

---

## 4. Data Model (high-level)

### Entities

* User
* Webhook Endpoint
* Webhook Event
* Delivery Attempt
* Queue Message
* Processing Log

### Relationships

* A User can own multiple Webhook Endpoints
* A Webhook Endpoint can receive many Webhook Events
* A Webhook Event can have multiple Delivery Attempts
* Queue Messages are generated from Webhook Events
* Processing Logs are associated with webhook processing activities

---