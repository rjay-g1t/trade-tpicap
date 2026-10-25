import type { Trade } from '@trade-blotter/shared';

export interface TradeSummary {
  total: number;
  active: number;
  cancelled: number;
  symbols: number;
  buyNotional: number;
  sellNotional: number;
  grossNotional: number;
  /** Share of gross notional that is buying, from 0 to 1. */
  buyShare: number;
}

/** Headline figures for the blotter. Notional counts active trades only, like positions. */
export function summarizeTrades(trades: readonly Trade[]): TradeSummary {
  const symbols = new Set<string>();
  let active = 0;
  let buyNotional = 0;
  let sellNotional = 0;

  for (const trade of trades) {
    symbols.add(trade.symbol);
    if (trade.status !== 'ACTIVE') continue;
    active += 1;
    const notional = trade.quantity * trade.price;
    if (trade.side === 'BUY') buyNotional += notional;
    else sellNotional += notional;
  }

  const grossNotional = buyNotional + sellNotional;
  return {
    total: trades.length,
    active,
    cancelled: trades.length - active,
    symbols: symbols.size,
    buyNotional,
    sellNotional,
    grossNotional,
    buyShare: grossNotional === 0 ? 0 : buyNotional / grossNotional,
  };
}
