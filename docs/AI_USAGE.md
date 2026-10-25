# AI Usage Report

> Living document — updated as development progresses.

## Tools used

| Tool                                              | Used for                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Claude Code** (Claude Opus 5.5, terminal agent) | Requirements analysis, architecture planning, scaffolding, writing code and tests, running the toolchain |

## How AI was used

1. **Understanding the brief first.** The brief was pasted in with an explicit "don't do anything
   yet", so the first output was a summary, not code.
2. **Plan before code.** Architecture was proposed and written to [`PLAN.md`](PLAN.md) before
   any implementation. Open choices were listed explicitly rather than decided silently.
3. **Phased implementation.** Work proceeds one phase at a time from the plan's checklist, each
   ending with tests, typecheck, lint and format all passing.
4. **Verification over trust.** Each phase was verified by running the actual toolchain rather
   than assuming generated code works.

## Decisions influenced by AI

| Decision                                               | AI's reasoning                                                                                      | Outcome                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `shared/` package of Zod schemas as the API contract   | Single source of truth; types inferred, validation reused on client and server                      | Accepted                           |
| SSE rather than WebSockets                             | Writes already go over REST; only server→client push needed; built-in reconnect and `Last-Event-ID` | Accepted                           |
| PostgreSQL + PGlite fallback                           | Real relational DB; PGlite runs the same SQL in-process, so tests need no Docker on any OS          | Accepted after clarifying question |
| Optimistic concurrency (`version` + `expectedVersion`) | Several users editing one blotter; prevents silent overwrites                                       | Accepted                           |
| Audit-trail row id as SSE event id                     | Clients can replay missed events after reconnecting                                                 | Accepted                           |
| DB check constraints mirroring API validation          | Defence in depth                                                                                    | Accepted                           |

## Accepted / rejected / corrected

- **Corrected:** dependency versions were checked against the npm registry rather than taken from
  model memory; TypeScript pinned to 6.0 for `typescript-eslint` compatibility.
- **Corrected:** the new major version of `fastify-type-provider-zod` was read from its type
  declarations before use, rather than assuming the older API.
- **Rejected (planned → changed):** Drizzle ORM. Hand-written SQL migrations plus a typed
  repository were simpler and avoided two sources of truth for the schema.
- **Rejected (planned → changed):** an in-memory fake repository for service tests. Testing against
  PGlite exercises the real SQL, constraints and row locking.
- **Caught by verification, not by tests:** a smoke test of the running server found seeded trades
  in the future and unhelpful validation messages. Both fixed with regression tests.
- **Done:** replaced the Create React App scaffold with Vite (CRA is deprecated and could not share
  the repo's TypeScript/Vitest setup), after confirming it contained no work.
- **Not yet verified:** the `pg` driver path against a real Postgres (Docker was not running).
  Scheduled for Phase 4 with `docker compose`.

## Where I applied my own judgement

- Asked for the architecture first and confirmed choices before any code was written.
- Questioned the repository layout before accepting it.
- Chose to replace Create React App with Vite.
