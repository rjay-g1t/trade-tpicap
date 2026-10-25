import type { Trade, TradeEvent } from '@trade-blotter/shared';

export function aTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    tradeId: 'TRD-100001',
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 100,
    price: 189.5,
    trader: 'JSMITH',
    book: 'EQ_US_TECH',
    counterparty: 'Goldman Sachs',
    tradeTimestamp: '2026-10-24T09:15:00.000Z',
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-10-24T09:15:00.000Z',
    updatedAt: '2026-10-24T09:15:00.000Z',
    ...overrides,
  };
}

export function aTradeEvent(trade: Trade, overrides: Partial<TradeEvent> = {}): TradeEvent {
  return {
    eventId: 1,
    kind: 'AMENDED',
    occurredAt: trade.updatedAt,
    trade,
    changedFields: [],
    ...overrides,
  };
}