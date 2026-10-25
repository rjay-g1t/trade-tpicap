# Trade Blotter

A real-time blotter for equity trades. Traders can view, book, amend and cancel trades in a
sortable, filterable grid, and every change appears live in every open browser.

- **Frontend:** React 19 + TypeScript (Vite), AG Grid, TanStack Query, react-hook-form
- **Backend:** Node.js + TypeScript (Fastify), Server-Sent Events for live updates
- **Database:** PostgreSQL (PGlite, an embedded Postgres, when running without Docker)
- **Shared contract:** Zod schemas in `shared/` validate requests on the server, validate
  responses and forms in the browser, and generate the TypeScript types for both

---

## Quick start

### With Docker (recommended)

```bash
docker compose up --build
```

Open **http://localhost:8080**. Compose starts Postgres, then the backend (which applies the
migrations and seeds 500 trades into an empty database), then nginx serving the frontend.

### Without Docker

Requires **Node.js 22.12+**.

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. With no `DATABASE_URL` set, the backend uses PGlite stored in
`backend/.data/`, so no database server is needed. Vite proxies `/api` to the backend on port 3000.

To use your own Postgres instead, set `DATABASE_URL`:

```bash
# macOS / Linux
DATABASE_URL=postgres://user:pass@localhost:5432/blotter npm run dev

# Windows (PowerShell)
$env:DATABASE_URL="postgres://user:pass@localhost:5432/blotter"; npm run dev
```

Both paths work on Windows, macOS and Linux: there are no shell scripts, and `.gitattributes`
normalises line endings. CI runs the install, typecheck, tests and build on all three, and boots
the Docker stack ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

---

## Features

| Area         | What it does                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blotter grid | Sort and filter on every column, quick search, "All / Active only" view, ~1,000 rows virtualised                                                           |
| Book / amend | Side drawer validated with the same schema as the API; server errors appear under the right field                                                          |
| Cancel       | Confirmation dialog; cancelled trades stay on the blotter, greyed out and read-only                                                                        |
| Live updates | Changes from any client appear within a second; changed cells flash                                                                                        |
| Conflicts    | Optimistic concurrency: if someone else changes a trade you are editing, a banner offers to load the latest version, and a stale save is rejected with 409 |
| Audit trail  | Every create, amend and cancel is recorded with the before/after state and shown in the drawer                                                             |
| Positions    | Net quantity and notional per symbol from active trades, shown as highlight cards                                                                          |
| UX           | Light and dark themes, connection status, loading/error states, toasts                                                                                     |

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[React components] --> Q[TanStack Query cache]
    S[useTradeStream<br/>EventSource] --> Q
  end
  Q -- REST /api --> R[Fastify routes<br/>Zod-validated]
  S -- SSE /api/events --> E[Event stream]
  R --> SV[TradeService<br/>rules + transactions]
  SV --> REPO[TradeRepository<br/>plain SQL]
  SV -- after commit --> BUS[Event bus] --> E
  REPO --> DB[(PostgreSQL<br/>trades + trade_events)]
```

**Write path.** A request is validated by the shared Zod schema. `TradeService` locks the row
(`SELECT … FOR UPDATE`), checks the trade isn't cancelled and that `expectedVersion` matches, then
updates the trade and appends an audit row in **one transaction**. Only after commit is the event
published to connected clients.

**Live updates without gaps.** `GET /api/trades` returns the trades plus `lastEventId`. The client
opens `GET /api/events?lastEventId=…`, so anything that happened in between is replayed. The audit
row id is the SSE event id, so the browser's automatic reconnect (`Last-Event-ID`) resumes where it
left off. A client too far behind receives `reset` and reloads. Updates are applied only if their
`version` is newer, so duplicates are harmless.

**Layers.** Routes only translate HTTP. Business rules live in `TradeService`. SQL lives in the
repository. One error handler turns domain errors into a consistent response:

```json
{ "error": { "code": "STALE_VERSION", "message": "…", "details": [] } }
```

| Status                 | When                                                            |
| ---------------------- | --------------------------------------------------------------- |
| 400 `VALIDATION_ERROR` | Body or query fails the schema; `details[]` lists each field    |
| 404 `NOT_FOUND`        | Unknown trade id                                                |
| 409 `TRADE_CANCELLED`  | Amending or cancelling a cancelled trade                        |
| 409 `STALE_VERSION`    | `expectedVersion` doesn't match; someone else changed the trade |

### API

| Method  | Path                      | Purpose                                                                                                  |
| ------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/trades`             | All trades (newest first) + `lastEventId`; optional `symbol`, `side`, `trader`, `book`, `status` filters |
| `GET`   | `/api/trades/:id`         | One trade                                                                                                |
| `POST`  | `/api/trades`             | Book a trade → `201`; `tradeTimestamp` defaults to now                                                   |
| `PATCH` | `/api/trades/:id`         | Amend changed fields; requires `expectedVersion`                                                         |
| `POST`  | `/api/trades/:id/cancel`  | Cancel (a status change; trades are never deleted); requires `expectedVersion`                           |
| `GET`   | `/api/trades/:id/history` | Audit trail with before/after per change                                                                 |
| `GET`   | `/api/positions`          | Net position per symbol from active trades                                                               |
| `GET`   | `/api/events`             | SSE stream: `trade` events, plus `reset` when replay isn't possible                                      |
| `GET`   | `/health`                 | Liveness check                                                                                           |

### Repository layout

```
├── shared/      API contract: Zod schemas, inferred types, error and event shapes
├── backend/     Fastify app: http/ (routes, errors), trades/ (service, repository, event bus),
│                db/ (pg + PGlite, migration runner), seed/ (deterministic trade generator)
├── frontend/    React app: api/ (typed client), trades/ (queries, live stream, form logic),
│                components/ (grid, drawer, dialogs), utils/ (formatting, theme)
├── database/    SQL migrations and schema notes (database/README.md)
├── docs/        PLAN.md (plan and progress), AI_USAGE.md
└── docker-compose.yml
```

The root holds workspace tooling shared by all packages: `package.json` (npm workspaces),
`tsconfig.base.json` (strict TypeScript settings), ESLint, Prettier and Vitest config, and
`.gitattributes` for consistent line endings across operating systems.

---

## Tests

```bash
npm test             # all packages (Vitest)
npm run typecheck    # strict TypeScript across all packages
npm run lint         # ESLint
npm run format:check # Prettier
```

135 tests across 13 files, with no Docker or database server needed:

| Package    | What's covered                                                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared`   | Schema validation edge cases and error messages                                                                                                                                                                                                                   |
| `backend`  | Service rules (version conflicts, cancelled trades, concurrent amends where exactly one wins), positions maths, migrations, the seed generator, every route via Fastify `inject()`, and the SSE stream over a real socket (fan-out, replay, `reset`, unsubscribe) |
| `frontend` | API client errors, cache merge by version, the live-stream hook with a fake `EventSource`, form conversion and validation, the trade form (required fields, server errors, minimal amends, "load latest")                                                         |

Backend tests run against PGlite, a real Postgres engine, so SQL, constraints and row locking are
tested rather than mocked.

---

## Configuration

Backend environment variables (all optional):

| Variable          | Default            | Purpose                                                     |
| ----------------- | ------------------ | ----------------------------------------------------------- |
| `DATABASE_URL`    | unset → PGlite     | Postgres connection string                                  |
| `PGLITE_DATA_DIR` | `.data/pglite`     | Where PGlite stores data when `DATABASE_URL` is unset       |
| `PORT` / `HOST`   | `3000` / `0.0.0.0` | HTTP listener                                               |
| `SEED_ON_EMPTY`   | `true`             | Seed trades when the database is empty                      |
| `SEED_COUNT`      | `500`              | Number of trades to seed (the brief asks for 100–1,000)     |
| `SEED`            | `20260818`         | Random seed; the same value always produces the same trades |
| `LOG_LEVEL`       | `info`             | Fastify/pino log level                                      |

Seeded trades use real symbols with plausible prices, trader codes, books and counterparties,
timestamps spread across recent trading sessions (never in the future), and about 6% cancelled.

---

## Assumptions and trade-offs

| Decision                                                               | Why, and what it costs                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Load all trades; sort and filter in the browser                        | Simple and instant at ≤1,000 rows. At scale this becomes server-side paging and filtering (the API already accepts filters).                     |
| SSE rather than WebSockets                                             | Updates only flow server → browser; writes are plain REST. SSE reconnects and resumes by itself. Two-way messaging would need WebSockets.        |
| In-process event bus                                                   | Correct for one backend instance. Several instances would publish through Postgres `LISTEN/NOTIFY` or Redis instead.                             |
| Optimistic concurrency (`version`) instead of locks held while editing | Nobody is blocked; conflicts are detected and shown. Two people editing the same trade must reconcile.                                           |
| Price as a JSON number, `numeric(18,6)` in the database                | Precise in storage; fine for display. A production system would send decimals as strings.                                                        |
| Plain SQL, no ORM                                                      | A dozen queries, and migrations are already SQL; an ORM would duplicate the schema. Queries are covered by tests against a real Postgres engine. |
| No authentication                                                      | Out of scope for the exercise; the trader is entered on each trade.                                                                              |
| No P&L                                                                 | Needs live market prices, which the brief doesn't provide.                                                                                       |
| Cancel is a status change                                              | Trades are never deleted, so the audit trail stays complete.                                                                                     |
| `tradeTimestamp` as the trade date                                     | The sample data uses a full timestamp; it's stored in UTC and shown in local time.                                                               |

---

## AI usage

How AI was used, what was accepted, changed or rejected, and where I applied my own judgement:
[docs/AI_USAGE.md](docs/AI_USAGE.md). The plan and progress are in [docs/PLAN.md](docs/PLAN.md).
