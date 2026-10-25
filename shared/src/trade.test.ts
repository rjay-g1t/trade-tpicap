import { describe, expect, it } from 'vitest';
import {
  AmendTradeSchema,
  CancelTradeSchema,
  CreateTradeSchema,
  TradeIdSchema,
  type CreateTradeInput,
} from './trade';

const validTrade: CreateTradeInput = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 5000,
  price: 227.45,
  trader: 'JSMITH',
  book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '2026-08-18T09:15:23Z',
};

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('CreateTradeSchema', () => {
  it('accepts a valid trade', () => {
    expect(CreateTradeSchema.parse(validTrade)).toEqual(validTrade);
  });

  it('allows tradeTimestamp to be omitted', () => {
    const { tradeTimestamp: _omitted, ...rest } = validTrade;
    expect(CreateTradeSchema.safeParse(rest).success).toBe(true);
  });

  it('normalises symbol, trader and book to trimmed upper case', () => {
    const parsed = CreateTradeSchema.parse({
      ...validTrade,
      symbol: ' brk.b ',
      trader: 'jsmith',
      book: ' equities_us',
    });
    expect(parsed).toMatchObject({ symbol: 'BRK.B', trader: 'JSMITH', book: 'EQUITIES_US' });
  });

  it.each([
    ['quantity', 0],
    ['quantity', -100],
    ['quantity', 10.5],
    ['quantity', 10_000_001],
    ['price', 0],
    ['price', -1],
    ['price', 1.1234567],
    ['price', 1_000_001],
    ['symbol', ''],
    ['symbol', 'TOOLONGSYMBOL'],
    ['symbol', '1ABC'],
    ['trader', ''],
    ['trader', '   '],
    ['book', 'X'],
    ['counterparty', ''],
    ['side', 'HOLD'],
    ['tradeTimestamp', '18/08/2026'],
  ])('rejects %s = %j', (field, value) => {
    const result = CreateTradeSchema.safeParse({ ...validTrade, [field]: value });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain(field);
  });

  it('accepts prices with up to 6 decimal places', () => {
    expect(CreateTradeSchema.safeParse({ ...validTrade, price: 0.000001 }).success).toBe(true);
    expect(CreateTradeSchema.safeParse({ ...validTrade, price: 534.22 }).success).toBe(true);
  });

  it('accepts timestamps with a UTC offset', () => {
    const result = CreateTradeSchema.safeParse({
      ...validTrade,
      tradeTimestamp: '2026-08-18T10:15:23+01:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields such as status', () => {
    const result = CreateTradeSchema.safeParse({ ...validTrade, status: 'CANCELLED' });
    expect(result.success).toBe(false);
  });

  it('reports every missing required field', () => {
    const result = CreateTradeSchema.safeParse({});
    expect(issuePaths(result).sort()).toEqual(
      ['book', 'counterparty', 'price', 'quantity', 'side', 'symbol', 'trader'].sort(),
    );
  });
});

describe('AmendTradeSchema', () => {
  it('accepts a partial update with expectedVersion', () => {
    const parsed = AmendTradeSchema.parse({ price: 230.1, expectedVersion: 3 });
    expect(parsed).toEqual({ price: 230.1, expectedVersion: 3 });
  });

  it('requires expectedVersion', () => {
    const result = AmendTradeSchema.safeParse({ price: 230.1 });
    expect(issuePaths(result)).toContain('expectedVersion');
  });

  it('requires at least one amended field', () => {
    const result = AmendTradeSchema.safeParse({ expectedVersion: 1 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('At least one field must be amended');
  });

  it('applies the same field rules as create', () => {
    const result = AmendTradeSchema.safeParse({ quantity: -5, expectedVersion: 1 });
    expect(issuePaths(result)).toContain('quantity');
  });

  it('does not allow status to be amended', () => {
    const result = AmendTradeSchema.safeParse({ status: 'CANCELLED', expectedVersion: 1 });
    expect(result.success).toBe(false);
  });
});

describe('CancelTradeSchema', () => {
  it('requires a positive integer expectedVersion', () => {
    expect(CancelTradeSchema.safeParse({ expectedVersion: 2 }).success).toBe(true);
    expect(CancelTradeSchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
    expect(CancelTradeSchema.safeParse({}).success).toBe(false);
  });
});

describe('TradeIdSchema', () => {
  it.each(['TRD-100001', 'TRD-1234567'])('accepts %s', (id) => {
    expect(TradeIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(['100001', 'TRD-12', 'trd-100001', 'TRD-10000A'])('rejects %s', (id) => {
    expect(TradeIdSchema.safeParse(id).success).toBe(false);
  });
});

describe('error messages', () => {
  it('says which fields are required', () => {
    const result = CreateTradeSchema.safeParse({});
    const messages = Object.fromEntries(
      result.error!.issues.map((issue) => [issue.path.join('.'), issue.message]),
    );
    expect(messages).toEqual({
      symbol: 'Symbol is required',
      side: 'Side is required',
      quantity: 'Quantity is required',
      price: 'Price is required',
      trader: 'Trader is required',
      book: 'Book is required',
      counterparty: 'Counterparty is required',
    });
  });

  it('explains wrong types', () => {
    const result = CreateTradeSchema.safeParse({ ...validTrade, quantity: '100', side: 'buy' });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Side must be BUY or SELL',
      'Quantity must be a number',
    ]);
  });
});
