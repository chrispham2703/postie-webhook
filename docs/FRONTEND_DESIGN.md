# Frontend Design — Week 7

Design gate for the dashboard. The agent implements against this doc, not its own
idea. Scope for this week: the event list page only — detail and dead-letter-queue
pages are deferred to a later week.

## Event List page

**Endpoint:** `GET /api/events`

Already exists and works (`src/routes/events.js`), paginated via `cursor`/`limit`,
returns `{ data: [...events], meta: { nextCursor, hasMore } }`.

**Backend change needed before this page can work:** `Event` doesn't carry its own
target URL or delivery status — those live on the related `Delivery` and `Endpoint`
records (`prisma/schema.prisma`). `GET /api/events` needs to include each event's
delivery + endpoint data in the same query (e.g. Prisma `include: { deliveries: {
include: { endpoint: true } } }`) so the frontend doesn't have to make a separate
call per row.

**Table columns:**
| Column | Source |
|---|---|
| Event type | `event.eventType` |
| Target URL | `event.deliveries[0].endpoint.url` |
| Status | `event.deliveries[0].status` — shown as a colored badge |
| Created | `event.createdAt` |

**Status badge colors** (fixed, from the coach's spec):
- 🟢 green = `delivered`
- 🟡 yellow = `pending`
- 🔴 red = `failed`
- ⚪ grey = `dead_letter`

**Loading state:** show "Loading events..." in place of the table while the request
is in flight.

**Error state:** if the request fails, show "Couldn't load events — try again"
in place of the table.

## Deferred to a later week

- Event detail page (full payload + delivery attempt timeline)
- Dead-letter queue page
- Status filters, pagination controls
