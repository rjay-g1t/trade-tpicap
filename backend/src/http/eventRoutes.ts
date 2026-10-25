import { RESET_SSE_EVENT, TRADE_SSE_EVENT, type TradeEvent } from '@trade-blotter/shared';
import type { ServerResponse } from 'node:http';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TradeEventBus } from '../trades/tradeEventBus';
import type { TradeService } from '../trades/tradeService';

export interface EventRoutesOptions {
  service: TradeService;
  bus: TradeEventBus;
  /** Max events replayed on reconnect; beyond this the client is told to reload. */
  replayLimit?: number;
  heartbeatMs?: number;
}

const EventsQuerySchema = z.object({
  lastEventId: z.coerce.number().int().nonnegative().optional(),
});

/**
 * GET /events — Server-Sent Events stream of trade changes.
 *
 * A client resumes from `?lastEventId=` (initial connect, taken from the list
 * response) or the `Last-Event-ID` header (sent by EventSource on reconnect).
 * Live events are buffered during the replay so nothing is lost or reordered.
 */
export const eventRoutes: FastifyPluginAsyncZod<EventRoutesOptions> = async (
  app,
  { service, bus, replayLimit = 1000, heartbeatMs = 15_000 },
) => {
  const openStreams = new Set<ServerResponse>();

  app.addHook('preClose', async () => {
    for (const stream of openStreams) stream.end();
  });

  app.get('/events', { schema: { querystring: EventsQuerySchema } }, async (request, reply) => {
    const resumeFrom = parseEventId(request.headers['last-event-id']) ?? request.query.lastEventId;

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // stop nginx buffering the stream
    });
    res.write('retry: 3000\n\n');
    openStreams.add(res);

    let lastSentId = resumeFrom ?? 0;
    const send = (event: TradeEvent) => {
      if (event.eventId <= lastSentId) return;
      writeEvent(res, TRADE_SSE_EVENT, event, event.eventId);
      lastSentId = event.eventId;
    };

    let buffered: TradeEvent[] | null = resumeFrom === undefined ? null : [];
    const unsubscribe = bus.subscribe((event) => (buffered ? buffered.push(event) : send(event)));
    const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);

    res.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      openStreams.delete(res);
    });

    if (buffered && resumeFrom !== undefined) {
      try {
        const missed = await service.eventsAfter(resumeFrom, replayLimit + 1);
        if (missed.length > replayLimit) writeEvent(res, RESET_SSE_EVENT, {});
        else missed.forEach(send);
      } catch (error) {
        request.log.error({ err: error }, 'Failed to replay events');
        writeEvent(res, RESET_SSE_EVENT, {});
      }
      const pending = buffered;
      buffered = null;
      pending.forEach(send);
    }

    res.write(': connected\n\n');
  });
};

function writeEvent(res: ServerResponse, event: string, data: unknown, id?: number) {
  const idLine = id === undefined ? '' : `id: ${id}\n`;
  res.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function parseEventId(header: string | string[] | undefined): number | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}
