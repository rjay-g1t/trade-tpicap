import type { ApiError, Trade, TradeHistoryEntry, TradeListResponse } from '@trade-blotter/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../app';
import type { Database } from '../db/database';
import { aTrade } from '../testing/fixtures';
import { createTestApp } from '../testing/testApp';
import { createTestDatabase, resetTestDatabase } from '../testing/testDatabase';

describe('trade routes', () => {
  let db: Database;
  let app: App;

  beforeAll(async () => {
    db = await createTestDatabase();
    ({ app } = await createTestApp(db));
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  beforeEach(() => resetTestDatabase(db));

  const createTrade = async (overrides = {}) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/trades',
      payload: aTrade(overrides),
    });
    expect(res.statusCode).toBe(201);
    return res.json<Trade>();
  };

  describe('POST /api/trades', () => {
    it('creates a trade and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trades',
        payload: aTrade({ symbol: 'msft', trader: 'abrown' }),
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        tradeId: 'TRD-100001',
        symbol: 'MSFT',
        trader: 'ABROWN',
        status: 'ACTIVE',
        version: 1,
      });
    });

    it('returns 400 with a detail per invalid field', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trades',
        payload: aTrade({ quantity: -5, price: 0, trader: '' }),
      });

      expect(res.statusCode).toBe(400);
      const body = res.json<ApiError>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.map((d) => d.path).sort()).toEqual([
        'price',
        'quantity',
        'trader',
      ]);
      expect(body.error.details?.find((d) => d.path === 'quantity')?.message).toBe(
        'Quantity must be positive',
      );
    });

    it('returns 400 for malformed JSON', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { 'content-type': 'application/json' },
        payload: '{"symbol":',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiError>().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/trades', () => {
    it('lists trades with the latest event id', async () => {
      const trade = await createTrade();
      const res = await app.inject({ method: 'GET', url: '/api/trades' });

      expect(res.statusCode).toBe(200);
      expect(res.json<TradeListResponse>()).toEqual({ trades: [trade], lastEventId: 1 });
    });

    it('filters by query string', async () => {
      await createTrade({ symbol: 'AAPL' });
      const msft = await createTrade({ symbol: 'MSFT' });

      const res = await app.inject({ method: 'GET', url: '/api/trades?symbol=msft' });
      expect(res.json<TradeListResponse>().trades).toEqual([msft]);
    });

    it('rejects an invalid filter value', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/trades?side=HOLD' });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiError>().error.details?.[0]?.path).toBe('side');
    });
  });

  describe('GET /api/trades/:id', () => {
    it('returns the trade', async () => {
      const trade = await createTrade();
      const res = await app.inject({ method: 'GET', url: `/api/trades/${trade.tradeId}` });
      expect(res.json()).toEqual(trade);
    });

    it('returns 404 for an unknown trade', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/trades/TRD-999999' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        error: { code: 'NOT_FOUND', message: 'Trade TRD-999999 not found' },
      });
    });

    it('returns 400 for a malformed id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/trades/abc' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/trades/:id', () => {
    it('amends the trade', async () => {
      const trade = await createTrade();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.tradeId}`,
        payload: { price: 230.5, expectedVersion: 1 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ price: 230.5, version: 2 });
    });

    it('returns 409 STALE_VERSION when the trade has moved on', async () => {
      const trade = await createTrade();
      const amend = (price: number) =>
        app.inject({
          method: 'PATCH',
          url: `/api/trades/${trade.tradeId}`,
          payload: { price, expectedVersion: 1 },
        });

      await amend(230);
      const res = await amend(231);
      expect(res.statusCode).toBe(409);
      expect(res.json<ApiError>().error.code).toBe('STALE_VERSION');
    });

    it('rejects an attempt to change status', async () => {
      const trade = await createTrade();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.tradeId}`,
        payload: { status: 'CANCELLED', expectedVersion: 1 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/trades/:id/cancel', () => {
    it('cancels the trade, then rejects further changes with 409', async () => {
      const trade = await createTrade();
      const cancel = (expectedVersion: number) =>
        app.inject({
          method: 'POST',
          url: `/api/trades/${trade.tradeId}/cancel`,
          payload: { expectedVersion },
        });

      const first = await cancel(1);
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ status: 'CANCELLED', version: 2 });

      const second = await cancel(2);
      expect(second.statusCode).toBe(409);
      expect(second.json<ApiError>().error.code).toBe('TRADE_CANCELLED');
    });
  });

  describe('GET /api/trades/:id/history', () => {
    it('returns the audit trail', async () => {
      const trade = await createTrade();
      await app.inject({
        method: 'POST',
        url: `/api/trades/${trade.tradeId}/cancel`,
        payload: { expectedVersion: 1 },
      });

      const res = await app.inject({ method: 'GET', url: `/api/trades/${trade.tradeId}/history` });
      expect(res.json<TradeHistoryEntry[]>().map((e) => e.kind)).toEqual(['CREATED', 'CANCELLED']);
    });
  });

  describe('GET /api/positions', () => {
    it('returns net positions', async () => {
      await createTrade({ symbol: 'AAPL', side: 'BUY', quantity: 100, price: 10 });
      const res = await app.inject({ method: 'GET', url: '/api/positions' });
      expect(res.json()).toEqual([expect.objectContaining({ symbol: 'AAPL', netQuantity: 100 })]);
    });
  });

  it('returns the error envelope for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json<ApiError>().error.code).toBe('NOT_FOUND');
  });

  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
