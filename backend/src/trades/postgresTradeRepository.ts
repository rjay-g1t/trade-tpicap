import type {
  Position,
  Side,
  Trade,
  TradeEvent,
  TradeEventKind,
  TradeField,
  TradeHistoryEntry,
  TradeListQuery,
  TradeStatus,
} from '@trade-blotter/shared';
import type { Database, Queryable } from '../db/database';
import type {
  NewTrade,
  NewTradeEvent,
  TradeChanges,
  TradeRepository,
  TradeWriter,
} from './tradeRepository';

// Casts keep row types identical across node-postgres and PGlite, which
// otherwise differ in how they return numeric and bigint values.
const TRADE_COLUMNS = `
  trade_id, symbol, side, quantity, price::float8 AS price, trader, book, counterparty,
  trade_timestamp, status, version, created_at, updated_at`;

const EVENT_COLUMNS = `id::int AS id, kind, occurred_at, changed_fields, after`;

const COLUMN_BY_FIELD: Record<keyof TradeChanges, string> = {
  symbol: 'symbol',
  side: 'side',
  quantity: 'quantity',
  price: 'price',
  trader: 'trader',
  book: 'book',
  counterparty: 'counterparty',
  tradeTimestamp: 'trade_timestamp',
  status: 'status',
};

interface TradeRow {
  trade_id: string;
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  trader: string;
  book: string;
  counterparty: string;
  trade_timestamp: Date;
  status: TradeStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface EventRow {
  id: number;
  kind: TradeEventKind;
  occurred_at: Date;
  changed_fields: TradeField[];
  after: Trade;
}

function toTrade(row: TradeRow): Trade {
  return {
    tradeId: row.trade_id,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    trader: row.trader,
    book: row.book,
    counterparty: row.counterparty,
    tradeTimestamp: row.trade_timestamp.toISOString(),
    status: row.status,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toEvent(row: EventRow): TradeEvent {
  return {
    eventId: row.id,
    kind: row.kind,
    occurredAt: row.occurred_at.toISOString(),
    trade: row.after,
    changedFields: row.changed_fields,
  };
}

function firstRow<R>(rows: R[], what: string): R {
  const [row] = rows;
  if (!row) throw new Error(`Expected ${what} to return a row`);
  return row;
}

class PostgresTradeWriter implements TradeWriter {
  constructor(private readonly tx: Queryable) {}

  async insert(trade: NewTrade): Promise<Trade> {
    const { rows } = await this.tx.query<TradeRow>(
      `INSERT INTO trades
         (symbol, side, quantity, price, trader, book, counterparty, trade_timestamp, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${TRADE_COLUMNS}`,
      [
        trade.symbol,
        trade.side,
        trade.quantity,
        trade.price,
        trade.trader,
        trade.book,
        trade.counterparty,
        trade.tradeTimestamp,
        trade.status,
      ],
    );
    return toTrade(firstRow(rows, 'insert'));
  }

  async findByIdForUpdate(tradeId: string): Promise<Trade | null> {
    const { rows } = await this.tx.query<TradeRow>(
      `SELECT ${TRADE_COLUMNS} FROM trades WHERE trade_id = $1 FOR UPDATE`,
      [tradeId],
    );
    return rows[0] ? toTrade(rows[0]) : null;
  }

  async update(tradeId: string, changes: TradeChanges): Promise<Trade> {
    const entries = Object.entries(changes).filter(([, value]) => value !== undefined) as [
      keyof TradeChanges,
      unknown,
    ][];
    const assignments = entries.map(([field], i) => `${COLUMN_BY_FIELD[field]} = $${i + 2}`);
    const { rows } = await this.tx.query<TradeRow>(
      `UPDATE trades
       SET ${[...assignments, 'version = version + 1', 'updated_at = now()'].join(', ')}
       WHERE trade_id = $1
       RETURNING ${TRADE_COLUMNS}`,
      [tradeId, ...entries.map(([, value]) => value)],
    );
    return toTrade(firstRow(rows, 'update'));
  }

  async appendEvent(event: NewTradeEvent): Promise<TradeEvent> {
    const { rows } = await this.tx.query<EventRow>(
      `INSERT INTO trade_events (trade_id, kind, version, changed_fields, before, after)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${EVENT_COLUMNS}`,
      [
        event.after.tradeId,
        event.kind,
        event.after.version,
        event.changedFields,
        event.before && JSON.stringify(event.before),
        JSON.stringify(event.after),
      ],
    );
    return toEvent(firstRow(rows, 'appendEvent'));
  }
}

export class PostgresTradeRepository implements TradeRepository {
  constructor(private readonly db: Database) {}

  async list(filter: TradeListQuery = {}): Promise<Trade[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    for (const [field, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      params.push(value);
      conditions.push(`${COLUMN_BY_FIELD[field as keyof TradeChanges]} = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.db.query<TradeRow>(
      `SELECT ${TRADE_COLUMNS} FROM trades ${where}
       ORDER BY trade_timestamp DESC, trade_id DESC`,
      params,
    );
    return rows.map(toTrade);
  }

  async findById(tradeId: string): Promise<Trade | null> {
    const { rows } = await this.db.query<TradeRow>(
      `SELECT ${TRADE_COLUMNS} FROM trades WHERE trade_id = $1`,
      [tradeId],
    );
    return rows[0] ? toTrade(rows[0]) : null;
  }

  async count(): Promise<number> {
    const { rows } = await this.db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM trades',
    );
    return firstRow(rows, 'count').count;
  }

  async history(tradeId: string): Promise<TradeHistoryEntry[]> {
    const { rows } = await this.db.query<EventRow & { before: Trade | null }>(
      `SELECT ${EVENT_COLUMNS}, before FROM trade_events WHERE trade_id = $1 ORDER BY id`,
      [tradeId],
    );
    return rows.map((row) => ({ ...toEvent(row), before: row.before }));
  }

  async positions(): Promise<Position[]> {
    const { rows } = await this.db.query<Position>(
      `SELECT
         symbol,
         count(*)::int                                                       AS "tradeCount",
         coalesce(sum(quantity) FILTER (WHERE side = 'BUY'), 0)::float8      AS "buyQuantity",
         coalesce(sum(quantity) FILTER (WHERE side = 'SELL'), 0)::float8     AS "sellQuantity",
         sum(CASE side WHEN 'BUY' THEN quantity ELSE -quantity END)::float8  AS "netQuantity",
         coalesce(sum(quantity * price) FILTER (WHERE side = 'BUY'), 0)::float8  AS "buyNotional",
         coalesce(sum(quantity * price) FILTER (WHERE side = 'SELL'), 0)::float8 AS "sellNotional",
         sum(CASE side WHEN 'BUY' THEN quantity * price ELSE -quantity * price END)::float8
                                                                             AS "netNotional"
       FROM trades
       WHERE status = 'ACTIVE'
       GROUP BY symbol
       ORDER BY symbol`,
    );
    return rows;
  }

  async latestEventId(): Promise<number> {
    const { rows } = await this.db.query<{ id: number }>(
      'SELECT coalesce(max(id), 0)::int AS id FROM trade_events',
    );
    return firstRow(rows, 'latestEventId').id;
  }

  async eventsAfter(eventId: number, limit: number): Promise<TradeEvent[]> {
    const { rows } = await this.db.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM trade_events WHERE id > $1 ORDER BY id LIMIT $2`,
      [eventId, limit],
    );
    return rows.map(toEvent);
  }

  transaction<T>(fn: (writer: TradeWriter) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new PostgresTradeWriter(tx)));
  }
}
