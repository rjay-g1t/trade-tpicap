import { useQueryClient } from '@tanstack/react-query';
import {
  RESET_SSE_EVENT,
  TRADE_SSE_EVENT,
  TradeEventSchema,
  type TradeEvent,
} from '@trade-blotter/shared';
import { useEffect, useState } from 'react';
import { applyTrade, queryKeys } from './queries';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';

export function useTradeStream(lastEventId: number | undefined): ConnectionStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    if (lastEventId === undefined) return;

    const source = new EventSource(`/api/events?lastEventId=${lastEventId}`);
    setStatus('connecting');
    source.onopen = () => setStatus('live');
    source.onerror = () => setStatus('reconnecting');

    source.addEventListener(TRADE_SSE_EVENT, (message) => {
      const event = parseTradeEvent(message.data);
      if (event) applyTrade(queryClient, event.trade);
    });

    source.addEventListener(RESET_SSE_EVENT, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trades });
    });

    return () => source.close();
  }, [lastEventId, queryClient]);

  return status;
}

function parseTradeEvent(data: unknown): TradeEvent | null {
  try {
    const result = TradeEventSchema.safeParse(JSON.parse(String(data)));
    if (result.success) return result.data;
    console.warn('Ignoring a trade event that does not match the schema', result.error);
  } catch (error) {
    console.warn('Ignoring a trade event that is not valid JSON', error);
  }
  return null;
}
