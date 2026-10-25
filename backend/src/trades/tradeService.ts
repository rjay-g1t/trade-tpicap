import {
  AMENDABLE_FIELDS,
  type AmendableField,
  type AmendTrade,
  type CancelTradeInput,
  type CreateTrade,
  type Position,
  type Trade,
  type TradeEvent,
  type TradeHistoryEntry,
  type TradeListQuery,
  type TradeListResponse,
} from '@trade-blotter/shared';
import { StaleVersionError, TradeCancelledError, TradeNotFoundError } from './errors';
import type { TradeEventPublisher } from './tradeEventBus';
import type { TradeChanges, TradeRepository, TradeWriter } from './tradeRepository';

export interface TradeServiceDeps {
  repository: TradeRepository;
  events: TradeEventPublisher;
  clock?: () => Date;
}

/**
 * Trade use cases. Each change runs in one transaction that updates the trade
 * and appends its audit event; the event is published only after commit.
 */
export class TradeService {
  private readonly repository: TradeRepository;
  private readonly events: TradeEventPublisher;
  private readonly clock: () => Date;

  constructor({ repository, events, clock = () => new Date() }: TradeServiceDeps) {
    this.repository = repository;
    this.events = events;
    this.clock = clock;
  }

  async list(filter: TradeListQuery = {}): Promise<TradeListResponse> {
    // Read the cursor first: an event racing with the list may then be delivered
    // twice (harmless, clients compare versions) but never missed.
    const lastEventId = await this.repository.latestEventId();
    const trades = await this.repository.list(filter);
    return { trades, lastEventId };
  }

  async get(tradeId: string): Promise<Trade> {
    const trade = await this.repository.findById(tradeId);
    if (!trade) throw new TradeNotFoundError(tradeId);
    return trade;
  }

  async history(tradeId: string): Promise<TradeHistoryEntry[]> {
    const entries = await this.repository.history(tradeId);
    if (entries.length === 0) await this.get(tradeId); // 404 for unknown trades
    return entries;
  }

  positions(): Promise<Position[]> {
    return this.repository.positions();
  }

  eventsAfter(eventId: number, limit: number): Promise<TradeEvent[]> {
    return this.repository.eventsAfter(eventId, limit);
  }

  async create(input: CreateTrade): Promise<Trade> {
    const event = await this.repository.transaction(async (writer) => {
      const trade = await writer.insert({
        ...input,
        tradeTimestamp: input.tradeTimestamp ?? this.clock().toISOString(),
        status: 'ACTIVE',
      });
      return writer.appendEvent({ kind: 'CREATED', before: null, after: trade, changedFields: [] });
    });
    this.events.publish(event);
    return event.trade;
  }

  /** Applies the fields that actually differ. A no-op amend returns the trade unchanged. */
  async amend(tradeId: string, input: AmendTrade): Promise<Trade> {
    const { expectedVersion, ...requested } = input;
    const result = await this.repository.transaction(async (writer) => {
      const current = await this.loadForChange(writer, tradeId, expectedVersion);
      const changedFields = AMENDABLE_FIELDS.filter(
        (field) =>
          requested[field] !== undefined && !isSameValue(field, requested[field], current[field]),
      );
      if (changedFields.length === 0) return { trade: current, event: null };

      const changes: TradeChanges = Object.fromEntries(
        changedFields.map((field) => [field, requested[field]]),
      );
      const updated = await writer.update(tradeId, changes);
      const event = await writer.appendEvent({
        kind: 'AMENDED',
        before: current,
        after: updated,
        changedFields,
      });
      return { trade: updated, event };
    });
    if (result.event) this.events.publish(result.event);
    return result.trade;
  }

  async cancel(tradeId: string, { expectedVersion }: CancelTradeInput): Promise<Trade> {
    const event = await this.repository.transaction(async (writer) => {
      const current = await this.loadForChange(writer, tradeId, expectedVersion);
      const cancelled = await writer.update(tradeId, { status: 'CANCELLED' });
      return writer.appendEvent({
        kind: 'CANCELLED',
        before: current,
        after: cancelled,
        changedFields: ['status'],
      });
    });
    this.events.publish(event);
    return event.trade;
  }

  /** Locks the trade and checks it can still be changed by a caller who saw `expectedVersion`. */
  private async loadForChange(
    writer: TradeWriter,
    tradeId: string,
    expectedVersion: number,
  ): Promise<Trade> {
    const trade = await writer.findByIdForUpdate(tradeId);
    if (!trade) throw new TradeNotFoundError(tradeId);
    if (trade.status === 'CANCELLED') throw new TradeCancelledError(tradeId);
    if (trade.version !== expectedVersion) {
      throw new StaleVersionError(tradeId, expectedVersion, trade.version);
    }
    return trade;
  }
}

function isSameValue(field: AmendableField, requested: unknown, current: unknown): boolean {
  if (field === 'tradeTimestamp') {
    // Same instant written differently, e.g. "+01:00" vs "Z".
    return Date.parse(requested as string) === Date.parse(current as string);
  }
  return requested === current;
}
