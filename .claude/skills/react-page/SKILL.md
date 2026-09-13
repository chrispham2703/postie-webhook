---
name: react-page
description: Use when creating or updating a page in the Postie React dashboard. Points to the design doc for what the page shows, and enforces the data-fetching, loading, and error pattern.
---
# Building a Postie dashboard page

0. If no `frontend/` project exists yet, scaffold one first (Vite + React, `axios`
   installed, API base URL from an environment variable) before building any page.
1. Check `docs/FRONTEND_DESIGN.md` first for this page's endpoint, fields, and
   loading/error wording — implement that, not a guess.
2. Fetch data with `axios` inside `useEffect` (never directly in the render body),
   using the API base URL from an environment variable, never hardcoded.
3. Show the design doc's loading state while the request is in flight.
4. Show the design doc's error state if the request fails.
5. Render the fields/columns exactly as listed in the design doc once data loads.
6. Keep one page component per route; break out a shared component (e.g. a status
   badge) only if it's reused across more than one page.
