# Trade Blotter — Architecture & Implementation Plan

A real-time trade blotter for equity trades: view, create, amend and cancel trades, with changes pushed live to every connected client.

---

## 1. Repository Layout

npm workspaces monorepo.

```
test-tp-icp/
├── shared/            # API contract: Zod schemas + inferred TS types, event types
├── backend/           # Fastify API + SSE
├── frontend/          # Vite + React + TS
├── database/          # SQL migrations, seed notes, ERD
├── docs/              # PLAN.md, AI_USAGE.md
├── docker-compose.yml
└── README.md
```

**Key idea:** `shared/` is the single source of truth for the API contract. The backend validates requests with the same Zod schemas the frontend forms use, and both sides infer their TypeScript types from them.

---

## 2. Technology Choices

| Concern               | Choice                                                                  | Rationale                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend               | **Fastify** + `fastify-type-provider-zod`                               | Typed routes derived from Zod schemas; `app.inject()` enables integration tests without opening a port                                       |
| Database              | **PostgreSQL** (Docker) / **PGlite** (tests & Docker-free dev)          | Proper relational design; PGlite is Postgres compiled to WASM — no native builds, runs identically on Windows/Linux/macOS                    |
| Data access           | **Plain SQL** behind a typed repository + SQL migrations in `database/` | Migrations are already SQL, so an ORM schema would duplicate them; a dozen queries don't justify one                                         |
| Real time             | **Server-Sent Events** (`GET /api/events`)                              | All writes go through REST, so only server→client push is needed. `EventSource` reconnects automatically and supports `Last-Event-ID` replay |
| Frontend server state | **TanStack Query**                                                      | Caching/refetching; SSE events patch the query cache directly                                                                                |
| Grid                  | **AG Grid Community**                                                   | Virtualisation, sorting, filtering and row-flash built in                                                                                    |
| Forms                 | **react-hook-form** + a resolver around the shared Zod schema           | Identical validation on client and server                                                                                                    |
| Testing               | **Vitest** + React Testing Library                                      | One runner across the whole repo                                                                                                             |

### Open decisions (defaults in bold)

1. Real time: **SSE** vs WebSockets
2. Database: **Postgres + PGlite** vs SQLite
3. Grid: **AG Grid** vs TanStack Table

---

## 3. Domain Model

```ts
// shared/src/trade.ts
type Side = 'BUY' | 'SELL';
type Status = 'ACTIVE' | 'CANCELLED';

interface Trade {
  tradeId: string; // "TRD-100001", from a Postgres sequence
  symbol: string;
  side: Side;
  quantity: number; // integer > 0
  price: number; // > 0
  trader: string;
  book: string;
  counterparty: string;
  tradeTimestamp: string; // ISO-8601 UTC (reconciles brief's `tradeDate` with sample's `tradeTimestamp`)
  status: Status;
  version: number; // optimistic concurrency
  createdAt: string;
  updatedAt: string;
}

type CreateTradeInput = Pick<
  Trade,
  'symbol' | 'side' | 'quantity' | 'price' | 'trader' | 'book' | 'counterparty'
> & { tradeTimestamp?: string };

type AmendTradeInput = Partial<CreateTradeInput> & { expectedVersion: number };
```

### Tables

- **`trades`** — `price numeric(18,6)`; indexes on `symbol`, `trader`, `trade_timestamp`.
- **`trade_events`** — append-only audit trail: `id, trade_id, type (CREATED | AMENDED | CANCELLED), before jsonb, after jsonb, at`. Written in the same transaction as the trade mutation.

### Domain rules

- Quantity must be a positive integer; price must be positive; trader, book, counterparty and symbol are required.
- A `CANCELLED` trade cannot be amended or cancelled again → **409 Conflict**.
- Amend/cancel with a mismatched `expectedVersion` → **409 `STALE_VERSION`**.

---

## 4. API Design

| Method  | Path                      | Purpose                                                              |
| ------- | ------------------------- | -------------------------------------------------------------------- |
| `GET`   | `/api/trades`             | List trades (≤1k → return all; optional query filters)               |
| `GET`   | `/api/trades/:id`         | Get one trade                                                        |
| `POST`  | `/api/trades`             | Create → `201`                                                       |
| `PATCH` | `/api/trades/:id`         | Amend (requires `expectedVersion`)                                   |
| `POST`  | `/api/trades/:id/cancel`  | Status transition to `CANCELLED` (trades are never deleted)          |
| `GET`   | `/api/trades/:id/history` | Audit trail                                                          |
| `GET`   | `/api/positions`          | Net quantity and notional by symbol, active trades only (bonus)      |
| `GET`   | `/api/events`             | SSE stream: `trade` events (kind CREATED/AMENDED/CANCELLED), `reset` |
| `GET`   | `/health`                 | Liveness                                                             |

**Error envelope** (consistent across all endpoints):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [] } }
```

A central error handler maps: Zod errors → `400`, `NotFoundError` → `404`, `ConflictError` → `409`, anything else → `500`.

---

## 5. Backend Architecture

```
routes (HTTP + schema)
   └─▶ TradeService (domain rules, transactions)
          ├─▶ TradeRepository (interface) ─▶ SQL implementation (pg or PGlite)
          └─▶ EventBus (interface) ─▶ in-process emitter ─▶ SSE hub ─▶ clients
```

- Repository and bus are interfaces → the service is unit-testable with fakes, and the bus can later be swapped for Postgres `LISTEN/NOTIFY` or Redis to support multiple instances.
- **Seeding on startup:** if `trades` is empty, a seeded random generator inserts ~500 realistic trades (real symbols with plausible prices, trader codes, books, counterparties, timestamps spread across trading hours, ~5–10% cancelled). `SEED` env var makes it deterministic.

---

## 6. Frontend Architecture

```
App
├── StatsBar        headline figures (trades, active, symbols, gross notional, buy/sell) + live status
├── PositionsPanel  highlight cards: largest longs, largest shorts, most traded (bonus)
├── Toolbar         All / Active view, quick search, Refresh, "New trade"
├── BlotterGrid     AG Grid: per-column sort/filter, cell flash on change, cancelled rows greyed
├── TradeForm       create / amend drawer (shared Zod schema), inline server errors, TradeHistory
├── ConfirmCancel   confirmation dialog
└── ToastList       success / error messages
```

- **`useTradeStream()`** — opens the `EventSource` from the list's `lastEventId`, merges each event into the TanStack Query cache through the pure `upsertTrade` (newer `version` wins), and reloads the list on `reset`.
- **Conflict UX** — while amending, a banner appears as soon as the stream shows a newer version, with "Load latest". A stale save still gets `409`, shown in the form without losing input.
- Sorting/filtering is client-side (fine at ≤1k rows). Server-side paging is the documented scale-up path.

---

## 7. Testing Strategy

| Layer               | What                                                                                  | How                                                                          |
| ------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `shared`            | Schema validation edge cases                                                          | Vitest                                                                       |
| Backend unit        | `TradeService`: status transitions, version conflicts, event emission; seed generator | Vitest + PGlite (shared per file, truncated per test) + recording publisher  |
| Backend integration | Full CRUD flow, error codes, SSE event after POST                                     | Fastify `inject()` against PGlite with migrations applied (no Docker needed) |
| Frontend            | API client, cache merge, stream hook (fake `EventSource`), form logic and form UI     | Vitest + React Testing Library (jsdom)                                       |
| E2E (optional)      | Two browser contexts — live update propagates                                         | Playwright, time permitting                                                  |

---

## 8. Running Locally

- **Docker:** `docker compose up` → Postgres → backend (runs migrations + seed on boot) → frontend (static build served by nginx, proxying `/api`). Open `http://localhost:8080`.
- **Without Docker:** `npm install && npm run dev` (starts backend and frontend together), then open `http://localhost:5173`. With no `DATABASE_URL`, the backend falls back to file-backed PGlite; Vite proxies `/api` to the backend.
- **OS agnostic:** no shell scripts — cross-platform npm scripts only; `.gitattributes` normalises line endings.

---

## 9. Implementation Steps

### Phase 1 — Scaffold (~2h)

- [x] `git init`, `.gitignore`, `.gitattributes`, root `package.json` with workspaces
- [x] Shared TS config (`tsconfig.base.json`), ESLint + Prettier
- [x] `shared/`: Zod schemas, inferred types, event types, error envelope type
- [x] `database/`: initial migration (`trades`, `trade_events`, sequence, indexes)
- [x] Seed generator + unit tests
- [x] Start `docs/AI_USAGE.md`

### Phase 2 — Backend (~3h)

- [x] Fastify app factory (`buildApp(deps)`) with Zod type provider
- [x] DB layer: Postgres / PGlite selection via `DATABASE_URL`
- [x] `TradeRepository` (interface + plain SQL implementation)
- [x] `TradeService` with domain rules, transactions, audit events
- [x] `EventBus` + SSE hub with heartbeat and `Last-Event-ID`
- [x] Routes: trades CRUD, cancel, history, positions, events, health
- [x] Central error handler
- [x] Migrate + seed-if-empty on startup
- [x] Unit tests (service) + integration tests (`inject()` on PGlite)

**Deviations from the original plan** (see AI_USAGE.md):

- No Drizzle: plain SQL in the repository, since migrations are already hand-written SQL.
- Service tests run against PGlite rather than an in-memory fake: real SQL, no fake to keep in sync, ~2s total.
- `GET /api/trades` also returns `lastEventId`, so the client can open the SSE stream with no gap.
- The audit-row id doubles as the SSE event id, enabling replay on reconnect (`reset` if too far behind).

### Phase 3 — Frontend (~4h)

- [x] Vite + React + TS scaffold (replaced Create React App), dev proxy to backend
- [x] Typed API client using shared types (responses validated with the shared schemas)
- [x] TanStack Query hooks (`useTrades`, `useCreateTrade`, `useAmendTrade`, `useCancelTrade`)
- [x] `useTradeStream()` + `upsertTrade` cache merge
- [x] `BlotterGrid` with AG Grid (formatters, cell flash, cancelled styling)
- [x] Toolbar: quick search, All / Active view, refresh; connection indicator in the stats bar
- [x] `TradeForm` drawer (create/amend) with react-hook-form + shared schema, plus audit history
- [x] Cancel confirmation, toasts, 409 conflict handling, loading/error states
- [x] `PositionsPanel` (bonus)
- [x] Component + hook + logic tests (26 frontend tests)
- [x] Visual design: market-data style, light/dark theme, AG Grid theme from the same CSS tokens

**Deviations from the original plan:**

- The form validates with a small custom resolver around `CreateTradeSchema` instead of `zodResolver`: inputs hold text, and the resolver converts numbers and local time before validating, so messages match the server's exactly.
- Amends send only the fields the user edited, so an untouched timestamp can't lose its milliseconds.
- Conflicts are surfaced before saving: the drawer watches the live trade and offers "Load latest".
- Positions are highlight cards above the grid instead of a side panel, leaving the grid full width.
- No grid smoke test: AG Grid doesn't render meaningfully in jsdom; grid behaviour is checked by hand.

### Phase 4 — Packaging & Docs (~2h)

- [x] Dockerfiles (backend, frontend/nginx) + `docker-compose.yml` with healthchecks
- [x] Root `npm run dev` that starts backend and frontend together (`concurrently`, cross-platform)
- [x] Verify clean `docker compose up` against real Postgres (migrate, seed, API and live stream through nginx)
- [x] Verify `npm ci`, typecheck, tests, build and `npm run dev` from a fresh copy (PGlite)
- [x] README: architecture, install, run, test, assumptions, trade-offs
- [ ] Finalise `AI_USAGE.md` and the prompt log

### Phase 5 — Buffer (~1h)

- [ ] Polish, fix rough edges, optional Playwright e2e

---

## 10. Assumptions & Trade-offs

| Decision                                 | Trade-off                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Load all trades, filter/sort client-side | Simple and fast at ≤1k rows; server-side paging needed at scale                                             |
| In-process event bus                     | Works for a single backend instance; multi-instance needs `LISTEN/NOTIFY` or Redis                          |
| Price sent as JSON `number`              | Stored as `numeric` in DB; float precision acceptable for display — a real system would use decimal strings |
| No authentication                        | Out of scope; at most a "current trader" picker                                                             |
| No P&L view                              | Requires a market data feed; could be faked if time allows                                                  |
| Cancel is a status transition            | No regulatory workflow, per the brief                                                                       |
