import { z } from 'zod';
import { TradeFieldSchema, TradeSchema } from './trade';

export const TRADE_EVENT_KINDS = ['CREATED', 'AMENDED', 'CANCELLED'] as const;
export const TradeEventKindSchema = z.enum(TRADE_EVENT_KINDS);
export type TradeEventKind = z.infer<typeof TradeEventKindSchema>;

/** SSE event name used on the `/api/events` stream. */
export const TRADE_SSE_EVENT = 'trade';

/** Sent when a reconnecting client missed too much to replay; it should reload the blotter. */
export const RESET_SSE_EVENT = 'reset';

/**
 * A change to a trade, pushed to every connected client.
 *
 * `eventId` is the id of the audit-trail row, so it doubles as the SSE event id
 * and lets a reconnecting client resume from `Last-Event-ID`.
 */
export const TradeEventSchema = z.object({
  eventId: z.number().int().positive(),
  kind: TradeEventKindSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  trade: TradeSchema,
  /** Fields that differ from the previous version; empty for CREATED. */
  changedFields: z.array(TradeFieldSchema),
});
export type TradeEvent = z.infer<typeof TradeEventSchema>;

/** GET /api/trades/:id/history — an event plus the state it replaced. */
export const TradeHistoryEntrySchema = TradeEventSchema.extend({
  before: TradeSchema.nullable(),
});
export type TradeHistoryEntry = z.infer<typeof TradeHistoryEntrySchema>;
