# AI Workflow — Failure Log

## Entry 1 — Route bypassed existing service helper

**What it got wrong:** Asked the agent to add a new endpoint touching both `Application`
and `Endpoint` data. It correctly used `apiKeyAuth`, scoped the lookup by `orgId`, and
returned 404 (not 403) for cross-org access — but it wrote the ownership check directly
in the route handler using two stores, instead of reusing the existing
`applicationService.findOwnedApplication(appId, orgId)` helper that already does this.

**How I caught it:** Ran the Task 7 test — fresh session, asked for a trivial new
endpoint, read the diff line by line before accepting anything.

**Root cause:** Not agent error — `CLAUDE.md`'s rule said the *principle* ("logic
spanning models goes route → service") but didn't name the *specific function* that
already existed. The agent had no way to know it, so it reinvented equivalent logic.

**What I changed:** Added a concrete example to the Structure section pointing at
`applicationService.findOwnedApplication(appId, orgId)` by name, so future sessions
reuse it instead of guessing.
