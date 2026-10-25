# Database

PostgreSQL schema for the trade blotter.

- `migrations/` — plain SQL migrations, applied in filename order by the backend on startup.
  Applied migrations are recorded so each runs once.
- The same SQL runs against PostgreSQL (Docker) and [PGlite](https://pglite.dev) (in-process
  Postgres used for tests and Docker-free local development).

## Schema

```
trades                                   trade_events (append-only audit trail)
───────────────────────────────          ─────────────────────────────────────
trade_id        text PK  TRD-100001  ◀── trade_id        text FK
symbol          text                     id              bigint PK  (= SSE event id)
side            BUY | SELL               kind            CREATED | AMENDED | CANCELLED
quantity        integer  > 0             version         integer    (trade version after change)
price           numeric(18,6) > 0        changed_fields  text[]
trader          text                     before          jsonb      (NULL for CREATED)
book            text                     after           jsonb
counterparty    text                     occurred_at     timestamptz
trade_timestamp timestamptz
status          ACTIVE | CANCELLED
version         integer  (optimistic concurrency)
created_at      timestamptz
updated_at      timestamptz
```

## Design notes

- **Trades are never deleted.** Cancelling is a status transition, and every create, amend
  and cancel writes a `trade_events` row in the same transaction as the trade change.
- **`version`** increases on every change. Amend and cancel requests must send the version
  they last saw; a mismatch is rejected so concurrent edits can't overwrite each other.
- **`price` is `numeric`**, not floating point, so stored values are exact.
- **Check constraints** repeat the API validation rules as a last line of defence.
