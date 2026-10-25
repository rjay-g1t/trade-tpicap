import type { CreateTrade } from '@trade-blotter/shared';
import { describe, expect, it } from 'vitest';
import { aTrade } from '../test/fixtures';
import {
  EMPTY_TRADE_FORM,
  changedFields,
  toFormValues,
  validateTradeForm,
  type TradeFormValues,
} from './tradeForm';

const filled: TradeFormValues = {
  symbol: ' aapl ',
  side: 'SELL',
  quantity: '1500',
  price: '189.25',
  trader: 'jsmith',
  book: 'eq_us_tech',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '',
};

describe('validateTradeForm', () => {
  it('converts form text into a normalised API input', () => {
    expect(validateTradeForm(filled)).toEqual({
      success: true,
      data: {
        symbol: 'AAPL',
        side: 'SELL',
        quantity: 1500,
        price: 189.25,
        trader: 'JSMITH',
        book: 'EQ_US_TECH',
        counterparty: 'Goldman Sachs',
      },
    });
  });

  it('reports blank fields as required', () => {
    expect(validateTradeForm(EMPTY_TRADE_FORM)).toMatchObject({
      success: false,
      errors: {
        symbol: 'Symbol is required',
        quantity: 'Quantity is required',
        price: 'Price is required',
        trader: 'Trader is required',
        book: 'Book is required',
        counterparty: 'Counterparty is required',
      },
    });
  });

  it('rejects text in a number field', () => {
    expect(validateTradeForm({ ...filled, quantity: 'ten' })).toMatchObject({
      success: false,
      errors: { quantity: 'Quantity must be a number' },
    });
  });

  it('converts the local trade time to a UTC timestamp', () => {
    const result = validateTradeForm({ ...filled, tradeTimestamp: '2026-10-24T09:30:00' });

    expect(result.success && result.data.tradeTimestamp).toBe(
      new Date('2026-10-24T09:30:00').toISOString(),
    );
  });
});

describe('toFormValues', () => {
  it('round-trips the trade time through local time', () => {
    const trade = aTrade({ tradeTimestamp: '2026-10-24T09:30:15.000Z' });

    expect(new Date(toFormValues(trade).tradeTimestamp).toISOString()).toBe(trade.tradeTimestamp);
  });
});

describe('changedFields', () => {
  it('keeps only the fields the user edited', () => {
    const input: CreateTrade = {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 100,
      price: 190.5,
      trader: 'JSMITH',
      book: 'EQ_US_TECH',
      counterparty: 'Goldman Sachs',
    };

    expect(changedFields(input, { price: true, quantity: false })).toEqual({ price: 190.5 });
  });
});
