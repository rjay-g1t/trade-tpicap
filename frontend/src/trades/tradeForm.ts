import { CreateTradeSchema, type CreateTrade, type Side, type Trade } from '@trade-blotter/shared';
import type { FieldErrors, Resolver } from 'react-hook-form';

/** What the form holds: text from the inputs, converted to API types on submit. */
export interface TradeFormValues {
  symbol: string;
  side: Side;
  quantity: string;
  price: string;
  trader: string;
  book: string;
  counterparty: string;
  /** A datetime-local value in the user's time zone. Blank means "now". */
  tradeTimestamp: string;
}

export type TradeFormField = keyof TradeFormValues;

export const TRADE_FORM_FIELDS = [
  'symbol',
  'side',
  'quantity',
  'price',
  'trader',
  'book',
  'counterparty',
  'tradeTimestamp',
] as const satisfies readonly TradeFormField[];

export type TradeFormErrors = Partial<Record<TradeFormField, string>>;

export type TradeFormResult =
  | { success: true; data: CreateTrade }
  | { success: false; errors: TradeFormErrors };

export const EMPTY_TRADE_FORM: TradeFormValues = {
  symbol: '',
  side: 'BUY',
  quantity: '',
  price: '',
  trader: '',
  book: '',
  counterparty: '',
  tradeTimestamp: '',
};

export function toFormValues(trade: Trade): TradeFormValues {
  return {
    symbol: trade.symbol,
    side: trade.side,
    quantity: String(trade.quantity),
    price: String(trade.price),
    trader: trade.trader,
    book: trade.book,
    counterparty: trade.counterparty,
    tradeTimestamp: toLocalDateTime(trade.tradeTimestamp),
  };
}

export function validateTradeForm(values: TradeFormValues): TradeFormResult {
  const result = CreateTradeSchema.safeParse({
    symbol: blankToUndefined(values.symbol),
    side: values.side,
    quantity: toNumber(values.quantity),
    price: toNumber(values.price),
    trader: blankToUndefined(values.trader),
    book: blankToUndefined(values.book),
    counterparty: blankToUndefined(values.counterparty),
    tradeTimestamp: toIsoTimestamp(values.tradeTimestamp),
  });
  if (result.success) return { success: true, data: result.data };

  const errors: TradeFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (isFormField(field) && errors[field] === undefined) errors[field] = issue.message;
  }
  return { success: false, errors };
}

export const tradeFormResolver: Resolver<TradeFormValues, unknown, CreateTrade> = async (
  values,
) => {
  const result = validateTradeForm(values);
  if (result.success) return { values: result.data, errors: {} };

  const errors: FieldErrors<TradeFormValues> = {};
  for (const field of TRADE_FORM_FIELDS) {
    const message = result.errors[field];
    if (message) errors[field] = { type: 'validate', message };
  }
  return { values: {}, errors };
};

export function changedFields(
  input: CreateTrade,
  dirty: Readonly<Partial<Record<TradeFormField, boolean>>>,
): Partial<CreateTrade> {
  return Object.fromEntries(
    TRADE_FORM_FIELDS.filter((field) => dirty[field]).map((field) => [field, input[field]]),
  ) as Partial<CreateTrade>;
}

export function isFormField(key: unknown): key is TradeFormField {
  return (TRADE_FORM_FIELDS as readonly unknown[]).includes(key);
}

function blankToUndefined(value: string): string | undefined {
  return value.trim() === '' ? undefined : value;
}

function toNumber(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value);
}

function toIsoTimestamp(local: string): string | undefined {
  if (local === '') return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? local : date.toISOString();
}

/** ISO instant to "YYYY-MM-DDTHH:mm:ss" in local time, the format datetime-local inputs use. */
export function toLocalDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}