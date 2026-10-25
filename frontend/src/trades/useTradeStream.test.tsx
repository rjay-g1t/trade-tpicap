import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RESET_SSE_EVENT, TRADE_SSE_EVENT, type TradeListResponse } from '@trade-blotter/shared';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aTrade, aTradeEvent } from '../test/fixtures';
import { queryKeys } from './queries';
import { useTradeStream } from './useTradeStream';

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  close() {
    this.closed = true;
  }
}

function latestSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error('No EventSource was opened');
  return source;
}

function renderStream(initial: TradeListResponse) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.trades, initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ lastEventId }: { lastEventId: number }) => useTradeStream(lastEventId),
    { wrapper, initialProps: { lastEventId: initial.lastEventId } },
  );
  const cachedTrades = () => queryClient.getQueryData<TradeListResponse>(queryKeys.trades)?.trades;
  return { queryClient, hook, cachedTrades };
}

describe('useTradeStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('subscribes from the list cursor and reports the connection status', () => {
    const { hook } = renderStream({ trades: [], lastEventId: 7 });
    expect(latestSource().url).toBe('/api/events?lastEventId=7');
    expect(hook.result.current).toBe('connecting');

    act(() => latestSource().onopen?.());
    expect(hook.result.current).toBe('live');

    act(() => latestSource().onerror?.());
    expect(hook.result.current).toBe('reconnecting');
  });

  it('merges newer trades from the stream and ignores stale ones', () => {
    const { cachedTrades } = renderStream({
      trades: [aTrade({ version: 1, price: 100 })],
      lastEventId: 1,
    });

    latestSource().emit(TRADE_SSE_EVENT, aTradeEvent(aTrade({ version: 2, price: 101 })));
    expect(cachedTrades()?.[0]?.price).toBe(101);

    latestSource().emit(TRADE_SSE_EVENT, aTradeEvent(aTrade({ version: 1, price: 100 })));
    expect(cachedTrades()?.[0]?.price).toBe(101);
  });

  it('reconnects from the new cursor when the list is reloaded', () => {
    const { hook } = renderStream({ trades: [], lastEventId: 3 });
    const first = latestSource();

    hook.rerender({ lastEventId: 9 });

    expect(first.closed).toBe(true);
    expect(latestSource().url).toBe('/api/events?lastEventId=9');
  });

  it('reloads the list when the server sends reset', () => {
    const { queryClient } = renderStream({ trades: [], lastEventId: 0 });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    latestSource().emit(RESET_SSE_EVENT, {});

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.trades });
  });
});
