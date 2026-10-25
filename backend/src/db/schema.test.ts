import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateTrades } from '../seed/generateTrades';
import { createTestDatabase } from '../testing/testDatabase';
import type { Database } from './database';

/** Checks the migrated schema enforces the domain rules on its own, below the API. */
describe('database schema', () => {
  let db: Database;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  const insertTrade = (overrides: Record<string, unknown> = {}) => {
    const row = {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 100,
      price: 227.45,
      trader: 'JSMITH',
      book: 'EQUITIES_US',
      counterparty: 'Goldman Sachs',
      trade_timestamp: '2026-08-18T09:15:23Z',
      ...overrides,
    };
    const columns = Object.keys(row);
    return db.query<{ trade_id: string; status: string; version: number }>(
      `INSERT INTO trades (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING trade_id, status, version`,
      Object.values(row),
    );
  };

  it('assigns sequential TRD- ids and sensible defaults', async () => {
    const first = await insertTrade();
    const second = await insertTrade();
    expect(first.rows[0]).toEqual({ trade_id: 'TRD-100001', status: 'ACTIVE', version: 1 });
    expect(second.rows[0]?.trade_id).toBe('TRD-100002');
  });

  it('stores prices exactly', async () => {
    const { rows } = await db.query<{ price: string }>(
      `INSERT INTO trades (symbol, side, quantity, price, trader, book, counterparty, trade_timestamp)
       VALUES ('KO', 'SELL', 100, 0.1 + 0.2, 'ABROWN', 'EQUITIES_US', 'UBS', now())
       RETURNING price::text`,
    );
    expect(rows[0]?.price).toBe('0.300000');
  });

  it.each([
    { quantity: 0 },
    { quantity: -1 },
    { price: 0 },
    { symbol: 'aapl' },
    { trader: '' },
    { book: 'x' },
    { counterparty: '   ' },
    { side: 'HOLD' },
  ])('rejects %j', async (overrides) => {
    await expect(insertTrade(overrides)).rejects.toThrow();
  });

  it('accepts every generated seed trade', async () => {
    const trades = generateTrades({
      count: 200,
      seed: 7,
      endDate: new Date('2026-08-18T00:00:00Z'),
      tradingDays: 5,
    });
    await db.transaction(async (tx) => {
      for (const t of trades) {
        await tx.query(
          `INSERT INTO trades (symbol, side, quantity, price, trader, book, counterparty, trade_timestamp, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            t.symbol,
            t.side,
            t.quantity,
            t.price,
            t.trader,
            t.book,
            t.counterparty,
            t.tradeTimestamp,
            t.status,
          ],
        );
      }
    });
    const { rows } = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM trades WHERE trade_timestamp < '2026-08-19'`,
    );
    expect(rows[0]?.count).toBeGreaterThanOrEqual(200);
  });

  describe('trade_events', () => {
    it('requires `before` for every kind except CREATED', async () => {
      const { rows } = await insertTrade();
      const tradeId = rows[0]!.trade_id;
      const after = JSON.stringify({ tradeId });

      await expect(
        db.query(
          `INSERT INTO trade_events (trade_id, kind, version, after) VALUES ($1, 'CREATED', 1, $2)`,
          [tradeId, after],
        ),
      ).resolves.toBeDefined();

      await expect(
        db.query(
          `INSERT INTO trade_events (trade_id, kind, version, after) VALUES ($1, 'AMENDED', 2, $2)`,
          [tradeId, after],
        ),
      ).rejects.toThrow();
    });

    it('allows only one event per trade version', async () => {
      const { rows } = await insertTrade();
      const tradeId = rows[0]!.trade_id;
      const insertCreated = () =>
        db.query(
          `INSERT INTO trade_events (trade_id, kind, version, after) VALUES ($1, 'CREATED', 1, '{}')`,
          [tradeId],
        );
      await insertCreated();
      await expect(insertCreated()).rejects.toThrow();
    });

    it('rejects events for unknown trades', async () => {
      await expect(
        db.query(
          `INSERT INTO trade_events (trade_id, kind, version, after) VALUES ('TRD-999999', 'CREATED', 1, '{}')`,
        ),
      ).rejects.toThrow();
    });
  });
});
