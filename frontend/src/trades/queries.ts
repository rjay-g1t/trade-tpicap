import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AmendTradeInput, Trade, TradeListResponse } from '@trade-blotter/shared';
import { tradesApi } from '../api/trades';
import { upsertTrade } from './tradeCache';

export const queryKeys = {
  trades: ['trades'] as const,
  positions: ['positions'] as const,
  history: (tradeId: string) => ['trade-history', tradeId] as const,
};

export function useTrades() {
  return useQuery({
    queryKey: queryKeys.trades,
    queryFn: tradesApi.list,
    staleTime: Infinity,
  });
}

export function usePositions() {
  return useQuery({ queryKey: queryKeys.positions, queryFn: tradesApi.positions });
}

export function useTradeHistory(tradeId: string) {
  return useQuery({
    queryKey: queryKeys.history(tradeId),
    queryFn: () => tradesApi.history(tradeId),
  });
}

export function applyTrade(queryClient: QueryClient, trade: Trade): void {
  queryClient.setQueryData<TradeListResponse>(
    queryKeys.trades,
    (data) => data && upsertTrade(data, trade),
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.positions });
  void queryClient.invalidateQueries({ queryKey: queryKeys.history(trade.tradeId) });
}

export function useCreateTrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: tradesApi.create,
    onSuccess: (trade) => applyTrade(queryClient, trade),
  });
}

export interface AmendVariables {
  tradeId: string;
  input: AmendTradeInput;
}

export function useAmendTrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, input }: AmendVariables) => tradesApi.amend(tradeId, input),
    onSuccess: (trade) => applyTrade(queryClient, trade),
  });
}

export function useCancelTrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trade: Trade) =>
      tradesApi.cancel(trade.tradeId, { expectedVersion: trade.version }),
    onSuccess: (cancelled) => applyTrade(queryClient, cancelled),
  });
}
