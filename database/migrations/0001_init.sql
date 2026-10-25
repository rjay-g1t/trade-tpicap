-- Trades and their append-only audit trail.
--
-- Constraints mirror the validation rules in shared/src/trade.ts so the
-- database stays consistent even if a write bypasses the API.

CREATE TYPE trade_side AS ENUM ('BUY', 'SELL');
CREATE TYPE trade_status AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE trade_event_kind AS ENUM ('CREATED', 'AMENDED', 'CANCELLED');

-- Produces human-readable ids: TRD-100001, TRD-100002, ...
CREATE SEQUENCE trade_id_seq START WITH 100001;

CREATE TABLE trades (
  trade_id        text          PRIMARY KEY DEFAULT ('TRD-' || nextval('trade_id_seq')),
  symbol          text          NOT NULL CHECK (symbol ~ '^[A-Z][A-Z0-9.]{0,9}$'),
  side            trade_side    NOT NULL,
  quantity        integer       NOT NULL CHECK (quantity > 0),
  price           numeric(18,6) NOT NULL CHECK (price > 0),
  trader          text          NOT NULL CHECK (trader ~ '^[A-Z][A-Z0-9_]{1,19}$'),
  book            text          NOT NULL CHECK (book ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  counterparty    text          NOT NULL CHECK (length(btrim(counterparty)) BETWEEN 1 AND 100),
  trade_timestamp timestamptz   NOT NULL,
  status          trade_status  NOT NULL DEFAULT 'ACTIVE',
  version         integer       NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX trades_trade_timestamp_idx ON trades (trade_timestamp DESC);
CREATE INDEX trades_symbol_idx ON trades (symbol);
CREATE INDEX trades_trader_idx ON trades (trader);

-- One row per change. `id` is also the SSE event id, so clients can resume
-- a dropped stream with Last-Event-ID.
CREATE TABLE trade_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_id       text             NOT NULL REFERENCES trades (trade_id),
  kind           trade_event_kind NOT NULL,
  version        integer          NOT NULL,
  changed_fields text[]           NOT NULL DEFAULT '{}',
  before         jsonb,
  after          jsonb            NOT NULL,
  occurred_at    timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (trade_id, version),
  CHECK ((kind = 'CREATED') = (before IS NULL))
);

CREATE INDEX trade_events_trade_id_idx ON trade_events (trade_id, id);
