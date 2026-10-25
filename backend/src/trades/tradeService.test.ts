import type { TradeEvent } from '@trade-blotter/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../db/database';
import { seedIfEmpty } from '../seed/seedDatabase';
import { aTrade } from '../testing/fixtures';
import { createTestDatabase, resetTestDatabase } from '../testing/testDatabase';
import { StaleVersionError, TradeCancelledError, TradeNotFoundError } from './errors';
import { PostgresTradeRepository } from './postgresTradeRepository';
import { TradeService } from './tradeService';

describe('TradeService', () => {
  const now = new Date('2026-08-18T10:00:00.000Z');
  let db: Database;
  let repository: PostgresTradeRepository;
  let published: TradeEvent[];
  let service: TradeService;

  beforeAll(async () => {
    db = await createTestDatabase();
    repository = new PostgresTradeRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(db);
    published = [];
    service = new TradeService({
      repository,
      events: { publish: (event) => published.push(event) },
      clock: () => now,
    });
  });

  describe('create', () => {
    it('stores an ACTIVE trade at version 1 with a generated id', async () => {
      const trade = await service.create(aTrade());

      expect(trade).toMatchObject({
        ...aTrade(),
        tradeId: 'TRD-100001',
        status: 'ACTIVE',
        version: 1,
      });
      expect(await service.get(trade.tradeId)).toEqual(trade);
    });

    it('defaults tradeTimestamp to now', async () => {
      const { tradeTimestamp: _, ...input } = aTrade();
      const trade = await service.create(input);
      expect(trade.tradeTimestamp).toBe(now.toISOString());
    });

    it('publishes a CREATED event', async () => {
      const trade = await service.create(aTrade());
      expect(published).toEqual([
        expect.objectContaining({ kind: 'CREATED', trade, changedFields: [] }),
      ]);
    });
  });

  describe('amend', () => {
    it('updates only the changed fields and increments the version', async () => {
      const original = await service.create(aTrade());
      const amended = await service.amend(original.tradeId, {
        price: 230.1,
        quantity: original.quantity, // unchanged
        expectedVersion: 1,
      });

      expect(amended).toMatchObject({ price: 230.1, quantity: 5000, version: 2 });
      expect(published.at(-1)).toMatchObject({
        kind: 'AMENDED',
        trade: amended,
        changedFields: ['price'],
      });
    });

    it('treats the same instant in a different offset as unchanged', async () => {
      const original = await service.create(aTrade());
      const result = await service.amend(original.tradeId, {
        tradeTimestamp: '2026-08-18T10:15:23+01:00',
        expectedVersion: 1,
      });
      expect(result).toEqual(original);
    });

    it('returns the trade unchanged without an event when nothing differs', async () => {
      const original = await service.create(aTrade());
      const result = await service.amend(original.tradeId, { price: 227.45, expectedVersion: 1 });

      expect(result).toEqual(original);
      expect(published).toHaveLength(1);
    });

    it('rejects a stale version and leaves the trade untouched', async () => {
      const original = await service.create(aTrade());
      await service.amend(original.tradeId, { price: 230, expectedVersion: 1 });

      await expect(
        service.amend(original.tradeId, { price: 231, expectedVersion: 1 }),
      ).rejects.toBeInstanceOf(StaleVersionError);
      expect((await service.get(original.tradeId)).price).toBe(230);
    });

    it('rejects amending a cancelled trade', async () => {
      const original = await service.create(aTrade());
      await service.cancel(original.tradeId, { expectedVersion: 1 });

      await expect(
        service.amend(original.tradeId, { price: 1, expectedVersion: 2 }),
      ).rejects.toBeInstanceOf(TradeCancelledError);
    });

    it('rejects an unknown trade', async () => {
      await expect(
        service.amend('TRD-999999', { price: 1, expectedVersion: 1 }),
      ).rejects.toBeInstanceOf(TradeNotFoundError);
    });

    it('serialises concurrent amends: exactly one wins', async () => {
      const original = await service.create(aTrade());
      const results = await Promise.allSettled([
        service.amend(original.tradeId, { price: 240, expectedVersion: 1 }),
        service.amend(original.tradeId, { price: 250, expectedVersion: 1 }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const [rejected] = results.filter((r) => r.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(StaleVersionError);
      expect((await service.get(original.tradeId)).version).toBe(2);
    });
  });

  describe('cancel', () => {
    it('sets status to CANCELLED and publishes a CANCELLED event', async () => {
      const original = await service.create(aTrade());
      const cancelled = await service.cancel(original.tradeId, { expectedVersion: 1 });

      expect(cancelled).toMatchObject({ status: 'CANCELLED', version: 2 });
      expect(published.at(-1)).toMatchObject({
        kind: 'CANCELLED',
        trade: cancelled,
        changedFields: ['status'],
      });
    });

    it('cannot cancel twice', async () => {
      const original = await service.create(aTrade());
      await service.cancel(original.tradeId, { expectedVersion: 1 });
      await expect(service.cancel(original.tradeId, { expectedVersion: 2 })).rejects.toBeInstanceOf(
        TradeCancelledError,
      );
    });
  });

  describe('history', () => {
    it('records every change with the state before and after', async () => {
      const created = await service.create(aTrade());
      const amended = await service.amend(created.tradeId, { quantity: 100, expectedVersion: 1 });
      const cancelled = await service.cancel(created.tradeId, { expectedVersion: 2 });

      const history = await service.history(created.tradeId);
      expect(history.map(({ kind, before, trade }) => ({ kind, before, trade }))).toEqual([
        { kind: 'CREATED', before: null, trade: created },
        { kind: 'AMENDED', before: created, trade: amended },
        { kind: 'CANCELLED', before: amended, trade: cancelled },
      ]);
    });

    it('throws for an unknown trade', async () => {
      await expect(service.history('TRD-999999')).rejects.toBeInstanceOf(TradeNotFoundError);
    });
  });

  describe('list', () => {
    it('returns trades newest first with the latest event id', async () => {
      const older = await service.create(aTrade({ tradeTimestamp: '2026-08-18T09:00:00.000Z' }));
      const newer = await service.create(aTrade({ tradeTimestamp: '2026-08-18T11:00:00.000Z' }));

      const { trades, lastEventId } = await service.list();
      expect(trades.map((t) => t.tradeId)).toEqual([newer.tradeId, older.tradeId]);
      expect(lastEventId).toBe(published.at(-1)?.eventId);
    });

    it('filters by exact field values', async () => {
      await service.create(aTrade({ symbol: 'AAPL', side: 'BUY' }));
      const msft = await service.create(aTrade({ symbol: 'MSFT', side: 'SELL' }));
      await service.create(aTrade({ symbol: 'MSFT', side: 'BUY' }));

      const { trades } = await service.list({ symbol: 'MSFT', side: 'SELL' });
      expect(trades).toEqual([msft]);
    });
  });

  describe('positions', () => {
    it('nets active trades per symbol and ignores cancelled ones', async () => {
      await service.create(aTrade({ symbol: 'AAPL', side: 'BUY', quantity: 300, price: 10 }));
      await service.create(aTrade({ symbol: 'AAPL', side: 'SELL', quantity: 100, price: 12 }));
      const cancelled = await service.create(aTrade({ symbol: 'AAPL', quantity: 999 }));
      await service.cancel(cancelled.tradeId, { expectedVersion: 1 });
      await service.create(aTrade({ symbol: 'MSFT', side: 'SELL', quantity: 50, price: 2 }));

      expect(await service.positions()).toEqual([
        {
          symbol: 'AAPL',
          tradeCount: 2,
          buyQuantity: 300,
          sellQuantity: 100,
          netQuantity: 200,
          buyNotional: 3000,
          sellNotional: 1200,
          netNotional: 1800,
        },
        {
          symbol: 'MSFT',
          tradeCount: 1,
          buyQuantity: 0,
          sellQuantity: 50,
          netQuantity: -50,
          buyNotional: 0,
          sellNotional: 100,
          netNotional: -100,
        },
      ]);
    });
  });

  describe('seedIfEmpty', () => {
    const options = { count: 50, seed: 1, endDate: now, tradingDays: 3 };

    it('seeds an empty database once, with an audit trail', async () => {
      expect(await seedIfEmpty(repository, options)).toBe(50);
      expect(await seedIfEmpty(repository, options)).toBe(0);

      const { trades } = await service.list();
      expect(trades).toHaveLength(50);

      const cancelled = trades.find((t) => t.status === 'CANCELLED');
      expect(cancelled).toBeDefined();
      const history = await service.history(cancelled!.tradeId);
      expect(history.map((h) => h.kind)).toEqual(['CREATED', 'CANCELLED']);
    });
  });
});
