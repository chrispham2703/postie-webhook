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

## Entry 4 — Dashboard design pointed at the wrong auth mechanism

**What it got wrong:** My first draft of `docs/FRONTEND_DESIGN.md` picked
`GET /api/events` as the event list page's data source, without checking which auth
guard protects it. That route sits behind `apiKeyAuth` — the org's shared, permanent
API key, meant for server-to-server traffic (other companies' backends sending Postie
events). A browser-based dashboard would have had to hold that key client-side to call
it, which means anyone opening dev tools could read it.

**How I caught it:** I was dry-run testing whether the new `code-reviewer` subagent
actually worked (Task 9), so I had it review the new files I'd just created — the two
skill files, the two subagent files, and the design doc. It pointed out that
`react-page/SKILL.md` told the agent to call an endpoint that needs the shared API key,
but never said the dashboard should use a login instead. It flagged this as a real risk:
putting that API key inside browser-facing code means anyone could open dev tools and
steal it. This matched a rule already written in `CLAUDE.md` — the API key and the
personal-login system protect different things and should never get mixed up on the same
route. My design had walked straight into the mistake that rule exists to prevent.

**Root cause:** The design doc was built entirely around *what data* the page needed
(fields, columns, loading/error states) and never considered *who* — a person vs. a
machine — should be allowed to call the endpoint. Access control wasn't part of the
design checklist at all until the subagent's review forced the question.

**What I changed:** Redesigned the event list page around a new endpoint,
`GET /api/dashboard/events`, protected by `userAuth`. First draft of this fix wrongly
assumed `/api/applications` was already `userAuth`-protected (trusting `CLAUDE.md`'s
claim without checking) — verifying the actual code showed it's `apiKeyAuth`, same as
everything else in that file, and `CLAUDE.md` was wrong. The one real working `userAuth`
example is `apiKeys.js`, so the new route follows that file's structure instead, in its
own file, kept separate so the two auth guards never mix in one router. Fixed the wrong
claim in `CLAUDE.md` too. A leaked login session only affects one user and expires; it
never touches the shared API key real integrations depend on.

## Entry 5 — RabbitMQ connection never reconnects after dropping

**What happened:** While testing the live Railway deployment through Postman, an event
got stuck with `status: 'queue_failed'`. The `recoveryScan` service is supposed to
auto-heal exactly this case (per its own comment, referencing `docs/ARCHITECTURE.md`
§16), but its logs showed the same error on every 60s cycle for well over an hour:
`[recoveryScan] failed to recover event ...: Channel closed`.

**Root cause, found by reading `src/config/rabbitmq.js`:** `connect()` runs exactly
once, when the process starts, and stores the connection/channel in module-level
variables. If that connection ever drops after startup — most likely CloudAMQP's free
tier closing an idle connection, since `recoveryScan` mostly sits idle between finding
stuck events — nothing detects the drop or reconnects. Every later call to `publish()`
tries to use a channel that no longer exists, and fails forever, until the process is
manually restarted. This isn't specific to `recoveryScan` — `retryPoller.js` and
`app.js` share the same `connect()`/`publish()` pair and have the identical gap;
`deliveryWorker.js` opens its own separate connection inline and wasn't checked.

**How I caught it:** Not an agent mistake this time — live testing against the real
Railway deployment surfaced it. Checked `GET /api/endpoints` first to rule out a bad
endpoint URL (both endpoints were `active`, `failureCount: 0`), which pointed the
problem back at the queue layer instead.

**What I did:** Manually restarted the `recoveryScan` service in Railway, which forces
`connect()` to run again and get a fresh channel — confirmed working via the logs
(`[recoveryScan] recovered event ..., requeued 1 delivery(ies)`). This is a workaround,
not a fix.

**Update — confirmed the same bug hit `deliveryWorker` independently:** hours later, a
different event sat stuck at `pending` with no error visible anywhere, and only cleared
after manually redeploying the `postie-worker` service. Checked `deliveryWorker.js`
directly: it does **not** import `connect`/`publish` from `config/rabbitmq.js` — it
opens its own separate `amqplib.connect(...)` inline, with the identical "connect once,
never reconnect" flaw, just duplicated in a second place instead of shared. This means
a fix to `config/rabbitmq.js` alone would not have protected `deliveryWorker` — it
would need the exact same reconnect logic written a second time, or `deliveryWorker`
refactored to use the shared module instead of its own inline copy. Confirms this is a
systemic gap across all 4 processes, not a one-off in a single file.

**Update — finished the reconnect fix, found a new bug along the way:** Implemented
`scheduleReconnect()` in `rabbitmq.js`, which listens for the connection's `'close'`
event and automatically reconnects after a drop. While verifying it by running the test
suite, found that the handler didn't distinguish an *intentional* close from a real
drop — so every clean shutdown (including the tests' own teardown) still scheduled a
reconnect 3 seconds later, forever. This left a zombie timer running, which is why the
test suite hung and never exited on its own. Fixed by adding an `intentionalClose`
flag: set to `true` right before `close()` runs, and checked inside the `'close'`
handler — if it's `true`, skip the reconnect and reset the flag; otherwise, reconnect
as before. Confirmed fixed by running the full test suite without `--forceExit`: before
the fix it hung indefinitely, after the fix all 53 tests pass and Jest exits cleanly in
under 5 seconds.

## Entry 6 — Let the agent build a whole feature without me

**What happened:** Asked for the circuit breaker to be implemented. The agent built the
entire thing end to end on its own — schema change, service logic, worker integration,
tests, two rounds of subagent review — without me writing a single line or being
consulted at any step along the way.

**How I caught it:** Realised I couldn't explain any of it. The coach has already told
me I need to be able to explain why I did a specific thing, and the whole point of the
3-stage learning process is that I build the skill myself — handing me a finished
feature only ever produces stage 1 (I can recognise it), never stages 2-3 (I can
actually do it). Watching the agent silently finish the whole feature while I was still
typing made this obvious.

**Root cause:** Nothing in how I asked for it drew a line between "implement this" and
"implement this with me as the author, checking in at each step." Without that line,
the agent defaulted to delivering a finished result, which is the opposite of what the
coaching program is for.

**What I changed:** Discarded the entire autonomous attempt, including resetting the
dev database (which hit Prisma's own built-in confirmation step before letting an
agent reset a database), and rebuilt the circuit breaker from zero with me writing the
code and the agent reacting to it in small pieces instead. Added a standing rule so
future Postie feature work defaults to that split.

## Entry 7 — Pasted the wrong kind of database URL

**What happened:** Needed to run a migration against the live Railway Postgres
database. Pasted the `DATABASE_URL` from Railway's dashboard — the one ending in
`.railway.internal` — and the migration command couldn't reach it at all.

**Root cause:** `.railway.internal` is a private hostname that only resolves *inside*
Railway's own network, between services Railway itself is running. It's not reachable
from an outside machine like my laptop. The connection string that works from outside
is the public one, ending in `*.proxy.rlwy.net` — Railway shows both on the same page
and it's easy to grab the wrong one.

**How I caught it:** The migration command failed immediately instead of connecting,
which was the signal to stop and check which host I'd actually copied.

**What I changed:** Got the public `*.proxy.rlwy.net` connection string instead, and the
migration ran successfully. Flagged separately: that connection string includes the
real database password, so it shouldn't stay sitting in chat history — worth rotating
the password afterward.

## Entry 8 — Production was missing a column the new code needed

**What happened:** After merging the circuit breaker work, the live site started
failing with a Prisma `P2022` error — a column the new code expected simply didn't
exist in the production database.

**Root cause:** All week, migrations were applied with `npx prisma migrate dev`, which
only ever touched the local dev database. Nothing had run the production equivalent,
`npx prisma migrate deploy`, against the live Railway Postgres — so the schema in
production had drifted behind the schema the code now assumed, and nothing caught the
gap until a live request actually hit the new column.

**How I caught it:** The live error surfaced it directly — not something found by
testing locally, since local never had the gap to begin with.

**What I changed:** Ran `prisma migrate deploy` against the production database (using
the correct public connection string, per Entry 7) to bring it up to date. Worth
automating this as part of the deploy process going forward, rather than relying on
remembering to run it by hand after every merge.

## How I verify agent-written tests

A test suite full of green checkmarks doesn't mean the code is correct — it means
nothing that ran has failed yet. Three checks before I trust any test, agent-written
or not:

1. **Mutation check** — break the real code on purpose (invert a comparison, change a
   constant, flip a boolean), rerun the test, confirm it fails for that exact reason,
   then revert. Did this by hand across `backoff.test.js`, `signature.test.js`, and
   `deliveryService.test.js` (full log in `docs/TEST_PLAN.md`). Example: changing
   `sign()`'s algorithm from `'sha256'` to `'sha1'` made the signature test fail with a
   different hex string — proving the test actually checks the algorithm, not just
   "some string came back."

2. **Error-branch coverage, not just the happy path** — e.g.
   `deliveryWorker.test.js`'s `a failing call that exhausts the ladder marks the
   delivery failed_permanent` test exists specifically to check the *give-up* path, not
   just the successful-delivery path. A suite that only tests success would pass even
   if the retry-exhaustion logic were completely broken.

3. **No mocking the thing under test** — `signature.test.js` calls the real `sign()`
   and independently recomputes the expected hash with Node's own `crypto` module,
   rather than mocking `sign()` and asserting it was called. Mocking the function
   you're supposed to be testing proves the mock works, not that the real code does.

A useless test looks identical to a real one in the test runner's output — green is
green. The only way to tell them apart is to break the code yourself and watch whether
the test notices.

## MCP — Postgres server, local dev only

Added a Postgres MCP server (`@modelcontextprotocol/server-postgres`) pointed at the
local dev database only, per the security rule (never production, never a database
with real user data).

**What it made easier:** asked it "what columns does the events table actually have
in the live database?" and got a real, accurate answer straight from Postgres —
including correctly noting there's no `orgId` column directly on `Event`, and that org
scoping must go through `appId` → `Application` instead. That's the exact same fact I
spent time confirming by hand earlier tonight, reading `eventStore.js`'s
`where: { app: { orgId } }` — the MCP server got there in one query instead of me
reading source files to piece it together.

**What it didn't help with:** it can only describe the schema — it doesn't know
*why* a table looks the way it does, or which conventions apply (e.g., it wouldn't know
about `PUBLIC_FIELDS` or the `apiKeyAuth`/`userAuth` split on its own; those live in
code comments and `CLAUDE.md`, not the database). It's a shortcut for "what does the
data actually look like right now," not a replacement for reading the code to
understand behavior.
