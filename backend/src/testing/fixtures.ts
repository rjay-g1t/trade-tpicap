import type { CreateTrade } from '@trade-blotter/shared';

export function aTrade(overrides: Partial<CreateTrade> = {}): CreateTrade {
  return {
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 5000,
    price: 227.45,
    trader: 'JSMITH',
    book: 'EQUITIES_US',
    counterparty: 'Goldman Sachs',
    tradeTimestamp: '2026-08-18T09:15:23.000Z',
    ...overrides,
  };
}
