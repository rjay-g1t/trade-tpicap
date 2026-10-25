import { describe, expect, it } from 'vitest';
import { aTrade } from '../test/fixtures';
import { summarizeTrades } from './summary';

describe('summarizeTrades', () => {
  it('totals active notional by side and ignores cancelled trades', () => {
    const summary = summarizeTrades([
      aTrade({ tradeId: 'TRD-100001', symbol: 'AAPL', side: 'BUY', quantity: 100, price: 30 }),
      aTrade({ tradeId: 'TRD-100002', symbol: 'MSFT', side: 'SELL', quantity: 10, price: 100 }),
      aTrade({
        tradeId: 'TRD-100003',
        symbol: 'TSLA',
        side: 'BUY',
        quantity: 1,
        price: 999,
        status: 'CANCELLED',
      }),
    ]);

    expect(summary).toEqual({
      total: 3,
      active: 2,
      cancelled: 1,
      symbols: 3,
      buyNotional: 3000,
      sellNotional: 1000,
      grossNotional: 4000,
      buyShare: 0.75,
    });
  });

  it('reports a zero buy share when there is nothing active', () => {
    expect(summarizeTrades([]).buyShare).toBe(0);
  });
});
