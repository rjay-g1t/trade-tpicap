import type { Trade, TradeListResponse } from '@trade-blotter/shared';
import { describe, expect, it } from 'vitest';
import { aTrade } from '../test/fixtures';
import { upsertTrade } from './tradeCache';

const listOf = (...trades: Trade[]): TradeListResponse => ({ trades, lastEventId: 5 });

describe('upsertTrade', () => {
  it('adds a trade it has not seen to the top', () => {
    const existing = aTrade({ tradeId: 'TRD-100001' });
    const added = aTrade({ tradeId: 'TRD-100002' });

    expect(upsertTrade(listOf(existing), added).trades).toEqual([added, existing]);
  });

  it('replaces the cached trade with a newer version', () => {
    const newer = aTrade({ version: 2, price: 190 });

    const result = upsertTrade(listOf(aTrade({ version: 1 })), newer);

    expect(result).toEqual({ trades: [newer], lastEventId: 5 });
  });

  it('ignores an update that is not newer', () => {
    const data = listOf(aTrade({ version: 2, price: 190 }));

    expect(upsertTrade(data, aTrade({ version: 2, price: 999 }))).toBe(data);
    expect(upsertTrade(data, aTrade({ version: 1 }))).toBe(data);
  });
});
