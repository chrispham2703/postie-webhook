# Frontend Design — Week 7

Design gate for the dashboard. The agent implements against this doc, not its own
idea. Scope for this week: the event list page only — detail and dead-letter-queue
pages are deferred to a later week.

## Event List page

**Endpoint:** `GET /api/applications/:id/events` (**new** — does not exist yet)

**Why a new endpoint, not the existing `GET /api/events`:** `GET /api/events` is
protected by `apiKeyAuth` (the org's shared, permanent API key) — meant for
server-to-server traffic, e.g. another company's backend sending Postie events.
A browser dashboard is used by a logged-in *person*, not a machine, so it must
never hold that key (leaking it would expose a permanent, org-wide credential).

Instead, this new endpoint is protected by `userAuth` (the same personal-login,
JWT-based system that already guards `GET /api/applications/:id/endpoints`) — a
leaked login session only affects that one user, expires, and doesn't touch the
API key other real integrations depend on.

**Implementation, following the existing `:id/endpoints` route as the pattern:**
1. Route in `src/routes/applications.js`, under `userAuth` (already applied to
   this router).
2. Ownership check via `applicationService.findOwnedApplication(appId, orgId)` —
   per `CLAUDE.md`'s landmine, never query the store directly for this check.
3. Fetch events for that application, including delivery + endpoint data in the
   same query (`include: { deliveries: { include: { endpoint: true } } }`) so the
   frontend doesn't need a second call per row.
4. Same paginated shape as `GET /api/events`: `{ data: [...events], meta: {
   nextCursor, hasMore } }`.

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
