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

## Entry 2 — Same fix, retested twice, still didn't take

**What happened:** Reran the exact same fresh-session test twice more after the Entry 1
fix (once after naming the function in Structure, once more after moving the rule into
Landmines as a harder "never" statement). Both times, the new route still checked
ownership via `applicationStore.findByIdForOrg` directly instead of
`applicationService.findOwnedApplication` — neither wording fix changed the outcome.

**The evidence that changed the diagnosis:** On the third run, the agent added a comment
to the new store function naming `findOwnedApplication` by name — proof it knew the
correct function existed. It still didn't call it.

**Revised root cause:** Not a documentation-clarity problem — the agent understood the
rule both times. The existing `GET /:id` route, sitting right next to the new route in
the same file, calls `applicationStore.findByIdForOrg` directly, which is the *correct*
call for that route since it only touches one model. A fresh agent pattern-matches
against that visible, working, uncontradicted example more strongly than it weighs a
written rule elsewhere, even when it demonstrably understands the rule.

**What I'm changing instead:** Editing `CLAUDE.md`'s wording a third time won't fix a
disagreement with real code that's already understood correctly. Planned for next week: update the existing `GET /:id` route to also call
`applicationService.findOwnedApplication`, removing the contradicting example — then
retest.

## Entry 3 — Fourth run passed, but the "why" is unconfirmed

**What happened:** Ran the same test a fourth time (`claude -p`, identical prompt, no
hints). This time the route correctly called
`applicationService.findOwnedApplication(req.params.id, req.orgId)` — not
`applicationStore.findByIdForOrg` — and the agent's own commentary cited "per the
CLAUDE.md landmine" as the reason. It also wrote real tests
(`tests/applications.test.js`) and ran the full suite (32/32 passing) unprompted.
Kept this code — it's correct and tested, not a throwaway experiment.

**Two competing explanations, neither confirmed:**
1. The agent may have read `docs/AI_WORKFLOW.md` itself while exploring the repo before
   writing code — Entry 1 and 2 spell out the exact mistake and the correct function by
   name. If so, a concrete failure log describing a past mistake may work as a stronger
   signal than an abstract rule, the same way a contradicting code example did in
   Entry 2 — just pointed in the right direction this time.
2. Plain non-determinism — the same prompt against the same repo doesn't guarantee the
   same output every run. This could be luck, not signal.

**Not yet done:** Haven't isolated which explanation is correct (e.g. rerunning with
`AI_WORKFLOW.md` temporarily removed to see if it fails again). Don't treat this as
"the landmine wording fix worked" without that isolation — one pass after three
identical failures is weak evidence on its own.
