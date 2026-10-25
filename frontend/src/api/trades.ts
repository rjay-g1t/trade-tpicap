import {
  PositionSchema,
  TradeHistoryEntrySchema,
  TradeListResponseSchema,
  TradeSchema,
  type AmendTradeInput,
  type CancelTradeInput,
  type CreateTradeInput,
} from '@trade-blotter/shared';
import { request } from './client';

const tradePath = (tradeId: string) => `/trades/${encodeURIComponent(tradeId)}`;

export const tradesApi = {
  list: () => request('/trades', TradeListResponseSchema),

  history: (tradeId: string) =>
    request(`${tradePath(tradeId)}/history`, TradeHistoryEntrySchema.array()),

  positions: () => request('/positions', PositionSchema.array()),

  create: (input: CreateTradeInput) =>
    request('/trades', TradeSchema, { method: 'POST', body: input }),

  amend: (tradeId: string, input: AmendTradeInput) =>
    request(tradePath(tradeId), TradeSchema, { method: 'PATCH', body: input }),

  cancel: (tradeId: string, input: CancelTradeInput) =>
    request(`${tradePath(tradeId)}/cancel`, TradeSchema, { method: 'POST', body: input }),
};
