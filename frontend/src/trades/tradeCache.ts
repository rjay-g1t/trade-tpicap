import type { Trade, TradeListResponse } from '@trade-blotter/shared';

export function upsertTrade(data: TradeListResponse, trade: Trade): TradeListResponse {
  const current = data.trades.find((t) => t.tradeId === trade.tradeId);
  if (!current) return { ...data, trades: [trade, ...data.trades] };
  if (current.version >= trade.version) return data;
  return {
    ...data,
    trades: data.trades.map((t) => (t.tradeId === trade.tradeId ? trade : t)),
  };
}
