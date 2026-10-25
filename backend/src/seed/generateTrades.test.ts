import { CreateTradeSchema, TradeStatusSchema } from '@trade-blotter/shared';
import { describe, expect, it } from 'vitest';
import { generateTrades, recentWeekdays } from './generateTrades';
import { INSTRUMENTS } from './referenceData';

const options = {
  count: 500,
  seed: 42,
  endDate: new Date('2026-08-18T12:00:00Z'), // a Tuesday
  tradingDays: 5,
};

describe('generateTrades', () => {
  const trades = generateTrades(options);

  it('generates the requested number of trades', () => {
    expect(trades).toHaveLength(500);
  });

  it('is deterministic for a given seed', () => {
    expect(generateTrades(options)).toEqual(trades);
    expect(generateTrades({ ...options, seed: 43 })).not.toEqual(trades);
  });

  it('produces trades that pass API validation', () => {
    for (const { status, ...trade } of trades) {
      expect(CreateTradeSchema.safeParse(trade).success, JSON.stringify(trade)).toBe(true);
      expect(TradeStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('sorts trades by timestamp', () => {
    const timestamps = trades.map((t) => t.tradeTimestamp);
    expect(timestamps).toEqual([...timestamps].sort());
  });

  it('places trades on weekdays within the 08:00–16:30 UTC session', () => {
    for (const { tradeTimestamp } of trades) {
      const date = new Date(tradeTimestamp);
      expect([0, 6]).not.toContain(date.getUTCDay());
      const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
      expect(minutes).toBeGreaterThanOrEqual(8 * 60);
      expect(minutes).toBeLessThan(16 * 60 + 30);
    }
  });

  it('never generates trades after endDate, even mid-session', () => {
    // endDate is 12:00 UTC: today's afternoon hasn't happened yet.
    const latest = trades.at(-1)!.tradeTimestamp;
    expect(Date.parse(latest)).toBeLessThanOrEqual(options.endDate.getTime());
    expect(trades.some((t) => t.tradeTimestamp.startsWith('2026-08-18'))).toBe(true);
  });

  it('uses only earlier days when endDate is before the session opens', () => {
    const early = generateTrades({ ...options, endDate: new Date('2026-08-18T07:00:00Z') });
    const days = new Set(early.map((t) => t.tradeTimestamp.slice(0, 10)));
    expect([...days].sort()).toEqual([
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-17',
    ]);
  });

  it('keeps prices within 3% of the reference price', () => {
    const referencePrices = new Map(INSTRUMENTS.map((i) => [i.symbol, i.referencePrice]));
    for (const { symbol, price } of trades) {
      const reference = referencePrices.get(symbol)!;
      expect(Math.abs(price - reference) / reference).toBeLessThanOrEqual(0.0301);
    }
  });

  it('uses books that match the instrument', () => {
    const books = new Map(INSTRUMENTS.map((i) => [i.symbol, i.books]));
    for (const { symbol, book } of trades) {
      expect(books.get(symbol)).toContain(book);
    }
  });

  it('cancels a small minority of trades', () => {
    const cancelled = trades.filter((t) => t.status === 'CANCELLED').length;
    expect(cancelled).toBeGreaterThan(0);
    expect(cancelled / trades.length).toBeLessThan(0.15);
  });

  it('generates a mix of sides, symbols and traders', () => {
    expect(new Set(trades.map((t) => t.side)).size).toBe(2);
    expect(new Set(trades.map((t) => t.symbol)).size).toBeGreaterThan(10);
    expect(new Set(trades.map((t) => t.trader)).size).toBeGreaterThan(5);
  });
});

describe('recentWeekdays', () => {
  it('skips weekends and returns days in ascending order', () => {
    const days = recentWeekdays(new Date('2026-08-17T15:00:00Z'), 3); // Monday
    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-08-13',
      '2026-08-14',
      '2026-08-17',
    ]);
  });

  it('starts from the previous Friday when the end date is a weekend', () => {
    const days = recentWeekdays(new Date('2026-08-16T10:00:00Z'), 1); // Sunday
    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-08-14']);
  });
});
