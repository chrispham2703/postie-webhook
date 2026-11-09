# Onboarding UI — Design

> **Status:** Accepted (2026-11-09)
> **Related:** [FRONTEND_DESIGN.md](./FRONTEND_DESIGN.md), [DASHBOARD_ENDPOINTS.md](./DASHBOARD_ENDPOINTS.md), [BACKLOG.md](./BACKLOG.md), `frontend/src/EventList.jsx`

---

## 1. Problem

A new customer can sign up and see the Events page, but can't get any further without help. To
send a single webhook they need an application, an endpoint to deliver to, and an API key for
their own server. All three exist only as API routes today:

- `POST/GET /api/dashboard/applications`
- `POST/GET /api/dashboard/endpoints` (+ `PATCH` to disable)
- `POST/GET /api/api-keys`

The "Send test event" button already fails for a new org, with an alert that says
"create an Application first (see the backend API)".

**Goal:** a new customer, alone, goes from signup to a delivered test webhook in the dashboard.

**Constraints**

- The API key (`postie_...`) and the endpoint signing secret (`whsec_...`) are each shown **once**,
  right after creation. Each comes with a copy button and a clear "you won't see this again"
  warning. The backends already enforce show-once: only the create response contains them.
- Members get read-only views. Owners and admins can create. The backends already return 403 for
  member writes; the UI must not offer forms that will fail.
- Match the existing style (`EventList.jsx`, `App.css`): plain function components, `useState`
  and `useEffect`, the `api` axios client, `dashboard-page` / `dashboard-header` / `btn-primary` /
  `event-table` classes, and the "Loading..." / "Couldn't load ... — try again" states.
- No backend changes unless a decision below needs one.

## 2. What exists today (verified in code)

- **Navigation:** no router. `App.jsx` holds `token`, `view` (`'login' | 'register'`) and
  `selectedEventId` in state, and renders one screen at a time.
- **Role:** the frontend doesn't know it. `/api/auth/login` returns only `{ token }`. The JWT
  payload does carry `{ userId, orgId, role }` (`src/utils/jwt.js`).
- **401 handling:** the `api.js` interceptor clears the token and calls `window.location.reload()`.
- **Create responses:**
  - API key: `{ data: { id, name, prefix, createdAt, key }, meta: { note } }`
  - Endpoint: the full row, including `secret`
  - Application: the row
- **A new signup is the org's owner**, so the first user always can create.
- **Frontend tooling:** Vite, oxlint (`npm run lint` in `frontend/`). No test runner. CI
  (`.github/workflows/ci.yml`) runs backend lint and tests only. Nothing in CI touches `frontend/`.

## 3. Decisions

**Review (2026-11-09):** all five decisions below accepted as written, including the section order
(endpoint before API key), the "I've saved it" checkbox, and reading the role from the JWT.

**Build plan:** two PRs.
1. Vitest + Testing Library setup, the `frontend` CI job, and `ShowOnce` with its tests.
2. The Setup page, on top of PR 1.

### 3.1 Navigation: router or not

**Option A: keep state-based navigation.** Add a `page` value to `App.jsx` state
(`'events' | 'setup'`) and a small nav in the header.

- **+** No new dependency, and it's the pattern the app already uses.
- **+** Nothing to configure for deep links on the static host.
- **−** The browser Back button leaves the app instead of going to the previous screen. Refreshing
  always lands on the default page.
- **−** It gets harder to manage as screens are added.

**Option B: add `react-router-dom`.**

- **+** URLs per screen, Back works, pages can be bookmarked.
- **−** A new dependency, and `App.jsx` gets rewritten around it.
- **−** The static host needs an SPA fallback so `/setup` doesn't 404 on refresh.
- **−** A URL per screen invites refresh, and refreshing the show-once screen loses the secret
  either way.

**Chosen: A (no router).** Two top-level pages (Events, Setup) don't justify a router and a host
config change. The show-once screens are the riskiest part of this feature, and they're safer
without URLs a user can refresh or share.

**Revisit** when there are more than about four top-level pages, or when someone needs to link
straight to a screen (e.g. an event detail URL in an alert email). Logged in BACKLOG.md.

### 3.2 One guided flow vs separate pages

**Option A: a wizard.** Step 1 → 2 → 3 screens with Next and Back, shown once after signup.

- **+** The clearest first-run experience.
- **−** Useless afterwards. Customers still need to add a second endpoint or rotate a key, which
  means separate management pages anyway, so the forms get built twice.
- **−** If they abandon it halfway, it needs its own "resume" state.

**Option B: separate pages** (Applications, Endpoints, API keys), each with a list and a create
form.

- **+** Reusable for the life of the account.
- **−** A new customer has to work out the order on their own: an endpoint needs an application,
  and none of them say "do this first".

**Option C: one Setup page with three ordered sections.** Each section has a list and a create
form, plus a short progress checklist at the top.

- Progress is **derived from server data** (any applications? any endpoints? any API keys?), not
  from a stored "onboarding step", so leaving halfway and coming back just works.
- A section whose prerequisite is missing shows why. For example, Endpoints says "Create an
  application first" until one exists.
- Once all three are done, the checklist collapses to "Setup complete". The page stays as the
  management page for all three resources.

**Chosen: C.** It gives a new customer the guided order without a wizard that becomes dead weight.
It's one set of forms, there's no resume state to store, and it keeps the page count at two, which
also supports 3.1.

**Landing rule:** after login or signup, if the org has **no applications**, open Setup; otherwise
open Events. The header always has an Events / Setup switch.

**Section order:**

1. **Application:** name only. The optional `uid` stays API-only for now, since it's a developer
   concept.
2. **Endpoint:** application picker (preselected when there's only one), URL, optional event-type
   filter. Shows the signing secret once.
3. **API key:** name. Shows the key once. Includes a short example request for `POST /api/events`
   using the new key.
4. **Try it:** the existing "Send test event" action, moved here as well, with a link to Events to
   see the delivery.

API keys don't depend on an application. They're third because a customer only needs one when
they wire up their own server. The test event (step 4) works without a key.

### 3.3 Showing a value once: the `ShowOnce` component

One shared component, used by the endpoint and API-key sections:

- Shows the value in a read-only, monospace field, selected on focus.
- **Copy** button: `navigator.clipboard.writeText`, with a "Copied" confirmation. If the clipboard
  API is unavailable or rejects (non-secure context, permissions), it selects the text and says
  "Press Ctrl/Cmd+C to copy".
- Warning, always visible: **"This is the only time you'll see this [API key / signing secret].
  Copy it now and store it somewhere safe. If you lose it, you'll need to create a new one."**
- A **"I've saved it"** checkbox must be ticked before **Done** enables. Done clears the value from
  state and returns the section to its list.
- While it's on screen, a `beforeunload` handler asks for confirmation if the user tries to close
  or refresh the tab.
- The value lives only in that component's state. It's never written to `localStorage`, a URL or
  logs, and it's dropped on unmount.

### 3.4 Members get read-only views

The UI needs the role, and there are two ways to get it:

**Option A: decode the JWT payload in the browser.** Base64-decode the middle segment (no library
needed) and read `role`.

- **+** No backend change.
- **−** Unverified. That's fine for showing or hiding buttons, since the server still enforces
  every write. But it shares the stale-role gap in BACKLOG.md: a demoted admin's token still says
  `admin` for up to 7 days.

**Option B: add `role` to the login response, or add `GET /api/auth/me`.**

- **+** Explicit. `/me` could later re-check the database and close the stale-role gap.
- **−** A backend change, and the token in `localStorage` would need the role stored alongside it
  (signup already returns `user.role`; login doesn't).

**Chosen: A, with the server as the real check.** It's a UI hint only, and Option B's real value
(re-checking the database) belongs to the stale-role BACKLOG fix, not this feature.

- If a write ever returns 403 anyway, the section shows "You don't have permission to do this. Ask
  an owner or admin." and switches to read-only.
- Members see the three lists with a one-line note: "Only owners and admins can create
  applications, endpoints and API keys."
- The progress checklist still shows for members, so they can see what's missing.

## 4. Data model changes

**None.** No schema change, no migration, no new backend routes.

- Setup progress is derived from the three existing list endpoints, not stored.
- Lists never contain secrets: `PUBLIC_FIELDS` for endpoints; `prefix`/`name`/`lastUsedAt` for API
  keys.

**Frontend dependency changes** (dev only, see §6): `vitest`, `jsdom`, `@testing-library/react`,
`@testing-library/user-event`, `@testing-library/jest-dom`.

## 5. Failure modes

| # | Failure | Effect | Handling |
|---|---|---|---|
| 1 | User refreshes or closes the tab while a key or secret is shown | Value lost for good | `beforeunload` confirmation, the "I've saved it" gate before Done, and the warning text. If lost anyway: create a new key and delete the old one. For a secret: register a new endpoint and disable the old one. Secret rotation is a BACKLOG item. |
| 2 | Clipboard API unavailable (plain-HTTP preview, permissions) | Copy button does nothing | Catch the rejection, select the text, show "Press Ctrl/Cmd+C". The value is always visible, so copying by hand always works. |
| 3 | Token expires while a value is shown → `api.js` reloads the page on 401 | Value lost | The display itself makes no API calls, so it can't trigger the 401. Only a later action can (e.g. Done refreshing the list). Done refreshes the list only after the value is cleared. |
| 4 | Double-click on Create | Two keys or endpoints created; only the second is shown | Disable the button while the request is in flight, as `Login.jsx` does. |
| 5 | A member's stale token says `admin` | Forms shown, then a 403 | Friendly 403 message, and the section switches to read-only (§3.4). |
| 6 | 422 validation error (bad URL, empty name) | Form can't be submitted | Show each `details[].msg` next to its field. The 422 body only has `{ path, msg }`, never the submitted value. |
| 7 | Several applications exist | Endpoint registered on the wrong one | Explicit application picker, with no silent "first app" default once there's more than one. |
| 8 | User leaves after step 1 | Half-finished setup | Progress comes from server data, so Setup picks up at the next step. Landing only opens Setup when there are no applications; otherwise the checklist on Setup shows what's left. |
| 9 | Customer puts the key in browser code or a public repo | Key leaked | Out of scope for the UI. The example request is a server-side `curl`, and the warning says "store it somewhere safe". |
| 10 | Endpoint URL points at an internal address | SSRF from the delivery worker | Backend gap, already in BACKLOG.md. The UI doesn't add its own URL rules beyond what the API validates. |
| 11 | "Send test event" before an endpoint exists | Event created, delivered nowhere | Step 4 is enabled only once an endpoint exists. The existing alert text is replaced with a pointer to Setup. |
| 12 | A list request fails | Section can't render | Per-section "Couldn't load … — try again", like `EventList`. One failing section doesn't blank the page. |

## 6. Test plan

There are no frontend tests or frontend CI yet. Options:

| Option | What | + | − |
|---|---|---|---|
| A | **Vitest + React Testing Library + jsdom**, with `api.js` mocked (`vi.mock('./api')`) | Fast, no backend or browser needed, runs in CI in seconds, fits Vite with no extra config | Doesn't prove the real API contract or real clipboard behaviour |
| B | **Playwright end-to-end** against the real stack | Proves the whole path, including real 403s and show-once | Needs Postgres, RabbitMQ, API and a browser in CI. Slow, and a big first step |
| C | Manual checklist only | Zero setup | Nothing stops regressions, especially on the show-once rules |

**Chosen: A now, plus a short manual smoke test before merging. B goes in BACKLOG.md.** The
show-once and role rules are UI logic, and component tests cover them precisely. The backend's own
tests already cover the API contract and the 403s.

**CI:** add a `frontend` job to `.github/workflows/ci.yml` that runs, in `frontend/`:
`npm ci`, `npm run lint`, `npm test`, `npm run build`. It needs no services. It also catches build
breaks, which nothing does today.

**Component tests** (in `frontend/src/__tests__/` or next to each component):

*`ShowOnce`*
- Renders the value and the warning text.
- Copy calls `navigator.clipboard.writeText` with the exact value and shows "Copied".
- Clipboard rejects → the text is selected and "Press Ctrl/Cmd+C" is shown.
- Done is disabled until "I've saved it" is ticked. Clicking it calls `onDone` and the value is
  gone from the DOM.
- A `beforeunload` listener is registered while mounted and removed on unmount.
- The value is never written to `localStorage` (spy on `setItem`).

*Setup page*
- **Landing:** no applications → App opens Setup; one or more → App opens Events.
- **Progress:** each of the 8 combinations of `{ apps, endpoints, keys }` empty or non-empty shows
  the right checklist state.
- **Prerequisites:** no application → the Endpoint section shows "Create an application first"
  and no form.
- **Create application:** the form posts `{ name }`, the list refreshes, the checklist updates.
- **Create endpoint:**
  - posts `{ appId, url, filterTypes }`, then shows `ShowOnce` with the `secret` from the response
  - after Done, the list shows the endpoint and no secret anywhere in the DOM
- **Create API key:**
  - shows `ShowOnce` with `data.key`, plus the example request containing the key
  - after Done, the list shows only `prefix`
- **App picker:** with two applications, the picker has no silent default, and submitting needs a
  choice.
- **Double-submit:** the button is disabled while the request is pending, so only one `api.post`
  call is made.
- **422:** each field message is shown next to its field.
- **Member role** (token payload `role: 'member'`):
  - no create forms in any section
  - the read-only note is shown
  - lists still render
- **403 on create** (role says admin, server says no): the permission message is shown and the
  section switches to read-only.
- **A list load fails:** only that section shows the error; the others render.

**Manual smoke test** (before merging, against `npm run dev` and the local backend):
1. Sign up a new org → lands on Setup.
2. Create an application, an endpoint (`https://httpbin.org/post`) and an API key. Copy each value;
   try refreshing while one is shown and check the browser asks first.
3. Send a test event → open Events → the delivery shows `delivered`.
4. Log in as a member of the same org → read-only Setup. There's no invite flow yet, so the member
   account has to be added directly in the local database.

## 7. Out of scope (logged in BACKLOG.md)

- A router and deep links (§3.1 revisit trigger).
- Playwright end-to-end tests.
- Editing or disabling endpoints from the UI (the PATCH exists; the "Disable" button needs its own
  small design: confirmation text explaining that queued deliveries are cancelled for good).
- Deleting API keys from the UI (the DELETE exists).
- Inviting members. There's no invite flow at all yet, which also makes manual test step 4 awkward.
- Showing the role from a verified source (`/api/auth/me`), tied to the stale-JWT BACKLOG item.
