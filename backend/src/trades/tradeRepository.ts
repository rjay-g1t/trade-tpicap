import type {
  AmendableField,
  Position,
  Trade,
  TradeEvent,
  TradeEventKind,
  TradeField,
  TradeHistoryEntry,
  TradeListQuery,
} from '@trade-blotter/shared';

/** A trade before it is stored; id, version and audit timestamps come from the database. */
export type NewTrade = Omit<Trade, 'tradeId' | 'version' | 'createdAt' | 'updatedAt'>;

/** Fields an update may change. The version is always incremented by the repository. */
export type TradeChanges = Partial<Pick<Trade, AmendableField | 'status'>>;

export interface NewTradeEvent {
  kind: TradeEventKind;
  before: Trade | null;
  after: Trade;
  changedFields: TradeField[];
}

/** Write operations, only available inside a transaction. */
export interface TradeWriter {
  insert(trade: NewTrade): Promise<Trade>;
  /** Locks the row until the transaction ends, so concurrent changes are serialised. */
  findByIdForUpdate(tradeId: string): Promise<Trade | null>;
  update(tradeId: string, changes: TradeChanges): Promise<Trade>;
  appendEvent(event: NewTradeEvent): Promise<TradeEvent>;
}

export interface TradeRepository {
  list(filter?: TradeListQuery): Promise<Trade[]>;
  findById(tradeId: string): Promise<Trade | null>;
  count(): Promise<number>;
  history(tradeId: string): Promise<TradeHistoryEntry[]>;
  positions(): Promise<Position[]>;
  latestEventId(): Promise<number>;
  eventsAfter(eventId: number, limit: number): Promise<TradeEvent[]>;
  transaction<T>(fn: (writer: TradeWriter) => Promise<T>): Promise<T>;
}
