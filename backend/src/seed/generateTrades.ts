import type { NewTrade } from '../trades/tradeRepository';
import { Random } from './random';
import { COUNTERPARTIES, INSTRUMENTS, TRADERS } from './referenceData';

export interface GenerateTradesOptions {
  count: number;
  seed: number;
  /** Last day of the generated range. Weekends are skipped. */
  endDate: Date;
  /** Number of weekdays, counting back from `endDate`, to spread trades over. */
  tradingDays: number;
}

export const DEFAULT_SEED_OPTIONS = {
  count: 500,
  tradingDays: 5,
} as const;

/** Trading window in UTC: 08:00–16:30, covering the London session. */
const SESSION_START_MINUTES = 8 * 60;
const SESSION_END_MINUTES = 16 * 60 + 30;
const CANCELLED_PROBABILITY = 0.06;
const MAX_PRICE_DEVIATION = 0.03;

interface Session {
  start: number;
  end: number;
}

/**
 * Generates realistic-looking equity trades, sorted by timestamp so database
 * ids increase with time. No trade is later than `endDate`. Deterministic for
 * a given `seed` and `endDate`.
 */
export function generateTrades(options: GenerateTradesOptions): NewTrade[] {
  const { count, seed, endDate, tradingDays } = options;
  const random = new Random(seed);
  const sessions = tradingSessions(endDate, tradingDays);

  const trades = Array.from({ length: count }, (): NewTrade => {
    const instrument = random.pick(INSTRUMENTS);
    return {
      symbol: instrument.symbol,
      side: random.bool(0.5) ? 'BUY' : 'SELL',
      quantity: randomQuantity(random),
      price: randomPrice(random, instrument.referencePrice),
      trader: random.pick(TRADERS),
      book: random.pick(instrument.books),
      counterparty: random.pick(COUNTERPARTIES),
      tradeTimestamp: randomTimestamp(random, sessions),
      status: random.bool(CANCELLED_PROBABILITY) ? 'CANCELLED' : 'ACTIVE',
    };
  });

  return trades.sort((a, b) => a.tradeTimestamp.localeCompare(b.tradeTimestamp));
}

/** Mostly round lots of 100, with occasional larger block trades. */
function randomQuantity(random: Random): number {
  return random.bool(0.85) ? random.int(1, 50) * 100 : random.int(5, 100) * 1000;
}

/** Within ±3% of the reference price, on a tick size that suits the price level. */
function randomPrice(random: Random, referencePrice: number): number {
  const raw = referencePrice * (1 + random.float(-MAX_PRICE_DEVIATION, MAX_PRICE_DEVIATION));
  const decimals = referencePrice < 10 ? 4 : 2;
  return Number(raw.toFixed(decimals));
}

/**
 * The trading sessions of the last `count` weekdays. If `endDate` falls inside
 * a session, that session is cut short at `endDate`; if it falls before one
 * opens, that day is skipped and an earlier day is used instead.
 */
function tradingSessions(endDate: Date, count: number): Session[] {
  const minute = 60_000;
  return recentWeekdays(endDate, count + 1)
    .map((day) => ({
      start: day.getTime() + SESSION_START_MINUTES * minute,
      end: Math.min(day.getTime() + SESSION_END_MINUTES * minute, endDate.getTime()),
    }))
    .filter((session) => session.end > session.start)
    .slice(-count);
}

/** A whole-second instant, uniformly distributed across all sessions' trading time. */
function randomTimestamp(random: Random, sessions: Session[]): string {
  const total = sessions.reduce((sum, s) => sum + (s.end - s.start), 0);
  let offset = random.float(0, total);
  for (const session of sessions) {
    const length = session.end - session.start;
    if (offset < length) {
      const ms = Math.floor((session.start + offset) / 1000) * 1000;
      return new Date(ms).toISOString().replace('.000Z', 'Z');
    }
    offset -= length;
  }
  throw new Error('No trading session available');
}

/** The last `count` weekdays up to and including `endDate`, as UTC midnights. */
export function recentWeekdays(endDate: Date, count: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()),
  );
  while (days.length < count) {
    const dayOfWeek = cursor.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) days.unshift(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}
