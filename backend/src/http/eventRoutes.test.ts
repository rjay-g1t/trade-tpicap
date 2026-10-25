import type { Trade, TradeEvent } from '@trade-blotter/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../app';
import type { Database } from '../db/database';
import type { TradeEventBus } from '../trades/tradeEventBus';
import { aTrade } from '../testing/fixtures';
import { createTestApp } from '../testing/testApp';
import { createTestDatabase, resetTestDatabase } from '../testing/testDatabase';

interface SseMessage {
  id?: string;
  event: string;
  data: unknown;
}

/** Minimal SSE client over fetch, so tests see exactly what goes over the wire. */
async function openStream(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const res = await fetch(url, { headers, signal: controller.signal });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const messages: SseMessage[] = [];
  let buffer = '';
  let connected = false;

  const pump = async () => {
    const { value, done } = await reader.read();
    if (done) throw new Error('Stream closed');
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (block === ': connected') connected = true;
      const fields = Object.fromEntries(
        block
          .split('\n')
          .filter((line) => line && !line.startsWith(':') && !line.startsWith('retry'))
          .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 2)]),
      );
      if (fields.event) {
        messages.push({ ...fields, event: fields.event, data: JSON.parse(fields.data ?? 'null') });
      }
    }
  };

  return {
    res,
    async ready() {
      while (!connected) await pump();
    },
    async next(count = 1): Promise<SseMessage[]> {
      while (messages.length < count) await pump();
      return messages.splice(0, count);
    },
    close: () => controller.abort(),
  };
}

describe('GET /api/events', () => {
  let db: Database;
  let app: App;
  let bus: TradeEventBus;
  let baseUrl: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ({ app, bus } = await createTestApp(db, { replayLimit: 2 }));
    baseUrl = `${await app.listen({ port: 0, host: '127.0.0.1' })}/api/events`;
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  beforeEach(() => resetTestDatabase(db));

  const createTrade = async (overrides = {}) =>
    (
      await app.inject({ method: 'POST', url: '/api/trades', payload: aTrade(overrides) })
    ).json<Trade>();

  it('streams events with SSE headers and ids', async () => {
    const stream = await openStream(baseUrl);
    await stream.ready();
    expect(stream.res.headers.get('content-type')).toBe('text/event-stream');

    const trade = await createTrade();
    const [message] = await stream.next();

    expect(message).toMatchObject({ id: '1', event: 'trade' });
    expect(message?.data).toMatchObject({ eventId: 1, kind: 'CREATED', trade });
    stream.close();
  });

  it('pushes a change made by one client to every connected client', async () => {
    const trade = await createTrade();
    const streams = await Promise.all([openStream(baseUrl), openStream(baseUrl)]);
    await Promise.all(streams.map((s) => s.ready()));

    await app.inject({
      method: 'POST',
      url: `/api/trades/${trade.tradeId}/cancel`,
      payload: { expectedVersion: 1 },
    });

    for (const stream of streams) {
      const [message] = await stream.next();
      expect((message?.data as TradeEvent).kind).toBe('CANCELLED');
      stream.close();
    }
  });

  it('replays missed events from ?lastEventId, then continues live', async () => {
    await createTrade({ symbol: 'AAPL' }); // event 1, already seen
    await createTrade({ symbol: 'MSFT' }); // event 2, missed

    const stream = await openStream(`${baseUrl}?lastEventId=1`);
    await stream.ready();
    await createTrade({ symbol: 'TSLA' }); // event 3, live

    const messages = await stream.next(2);
    expect(messages.map((m) => (m.data as TradeEvent).trade.symbol)).toEqual(['MSFT', 'TSLA']);
    stream.close();
  });

  it('prefers the Last-Event-ID header sent by EventSource on reconnect', async () => {
    await createTrade({ symbol: 'AAPL' });
    await createTrade({ symbol: 'MSFT' });

    const stream = await openStream(`${baseUrl}?lastEventId=0`, { 'Last-Event-ID': '1' });
    const [message] = await stream.next();
    expect((message?.data as TradeEvent).trade.symbol).toBe('MSFT');
    stream.close();
  });

  it('sends reset when the client is too far behind to replay', async () => {
    for (const symbol of ['AAPL', 'MSFT', 'TSLA']) await createTrade({ symbol });

    const stream = await openStream(`${baseUrl}?lastEventId=0`); // 3 missed > replayLimit 2
    const [message] = await stream.next();
    expect(message?.event).toBe('reset');
    stream.close();
  });

  it('unsubscribes when the client disconnects', async () => {
    const stream = await openStream(baseUrl);
    await stream.ready();
    expect(bus.subscriberCount).toBe(1);

    stream.close();
    await expect.poll(() => bus.subscriberCount).toBe(0);
  });
});
