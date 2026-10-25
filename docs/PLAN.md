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
├── docs/              # PLAN.md, ARCHITECTURE.md, AI_USAGE.md, PROMPT_LOG.md
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
| Forms                 | **react-hook-form** + `zodResolver` (shared schemas)                    | Identical validation on client and server                                                                                                    |
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

| Method  | Path                      | Purpose                                                             |
| ------- | ------------------------- | ------------------------------------------------------------------- |
| `GET`   | `/api/trades`             | List trades (≤1k → return all; optional query filters)              |
| `GET`   | `/api/trades/:id`         | Get one trade                                                       |
| `POST`  | `/api/trades`             | Create → `201`                                                      |
| `PATCH` | `/api/trades/:id`         | Amend (requires `expectedVersion`)                                  |
| `POST`  | `/api/trades/:id/cancel`  | Status transition to `CANCELLED` (trades are never deleted)         |
| `GET`   | `/api/trades/:id/history` | Audit trail                                                         |
| `GET`   | `/api/positions`          | Net qty / avg price / notional by symbol (bonus)                    |
| `GET`   | `/api/events`             | SSE stream: `trade.created` \| `trade.amended` \| `trade.cancelled` |
| `GET`   | `/health`                 | Liveness                                                            |

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
├── Toolbar        quick filter, status/side toggles, Refresh, "New trade", live-connection indicator
├── BlotterGrid    AG Grid: per-column sort/filter, row flash on remote change, cancelled rows greyed
├── TradeDrawer    create / amend form (shared Zod schema), inline server errors
├── CancelConfirm  confirmation dialog
└── PositionsPanel (bonus)
```

- **`useTradeStream()`** — opens the `EventSource`, applies events to the TanStack Query cache via a pure reducer (`setQueryData`), and invalidates the cache on reconnect to cover any gap.
- **Conflict UX** — on `409`, show "Trade was modified by someone else — reloaded latest" and refresh the form.
- Sorting/filtering is client-side (fine at ≤1k rows). Server-side paging is the documented scale-up path.

---

## 7. Testing Strategy

| Layer               | What                                                                                  | How                                                                          |
| ------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `shared`            | Schema validation edge cases                                                          | Vitest                                                                       |
| Backend unit        | `TradeService`: status transitions, version conflicts, event emission; seed generator | Vitest + PGlite (shared per file, truncated per test) + recording publisher  |
| Backend integration | Full CRUD flow, error codes, SSE event after POST                                     | Fastify `inject()` against PGlite with migrations applied (no Docker needed) |
| Frontend            | Form validation, stream→cache reducer, grid render smoke test                         | Vitest + React Testing Library                                               |
| E2E (optional)      | Two browser contexts — live update propagates                                         | Playwright, time permitting                                                  |

---

## 8. Running Locally

- **Docker:** `docker compose up` → Postgres → backend (runs migrations + seed on boot) → frontend (static build served by nginx, proxying `/api`). Open `http://localhost:8080`.
- **Without Docker:** `npm install && npm run dev`. With no `DATABASE_URL`, the backend falls back to file-backed PGlite; Vite proxies `/api` to the backend.
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
- [ ] Typed API client using shared types
- [ ] TanStack Query hooks (`useTrades`, `useCreateTrade`, `useAmendTrade`, `useCancelTrade`)
- [ ] `useTradeStream()` + reducer
- [ ] `BlotterGrid` with AG Grid (formatters, row flash, cancelled styling)
- [ ] Toolbar: quick filter, toggles, refresh, connection indicator
- [ ] `TradeDrawer` (create/amend) with react-hook-form + shared schema
- [ ] Cancel confirmation, toasts, 409 conflict handling, loading/error states
- [ ] `PositionsPanel` (bonus)
- [ ] Component + reducer tests

### Phase 4 — Packaging & Docs (~2h)

- [ ] Dockerfiles (backend, frontend/nginx) + `docker-compose.yml` with healthchecks
- [ ] Verify clean `docker compose up` and `npm run dev` from a fresh clone
- [ ] README: architecture, install, run, test, assumptions, trade-offs
- [ ] Finalise `AI_USAGE.md` and `PROMPT_LOG.md`

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
