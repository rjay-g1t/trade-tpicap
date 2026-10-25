import type { TradeEvent } from '@trade-blotter/shared';

export type TradeEventListener = (event: TradeEvent) => void;

export interface TradeEventPublisher {
  publish(event: TradeEvent): void;
}

/**
 * In-process fan-out of committed trade events to live subscribers (SSE
 * connections). A multi-instance deployment would swap this for Postgres
 * LISTEN/NOTIFY or Redis pub/sub behind the same interface.
 */
export class TradeEventBus implements TradeEventPublisher {
  private readonly listeners = new Set<TradeEventListener>();

  subscribe(listener: TradeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: TradeEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}
