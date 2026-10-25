import { z } from 'zod';

export const SIDES = ['BUY', 'SELL'] as const;
export const TRADE_STATUSES = ['ACTIVE', 'CANCELLED'] as const;

export const MAX_QUANTITY = 10_000_000;
export const MAX_PRICE = 1_000_000;
export const PRICE_DECIMALS = 6;

/** "X is required" when missing, otherwise `invalid` — friendlier than Zod's default type errors. */
function fieldError(label: string, invalid: string) {
  return {
    error: (issue: { input?: unknown }) =>
      issue.input === undefined ? `${label} is required` : invalid,
  };
}

const text = (label: string) => z.string(fieldError(label, `${label} must be text`));
const numeric = (label: string) => z.number(fieldError(label, `${label} must be a number`));

export const SideSchema = z.enum(SIDES, fieldError('Side', 'Side must be BUY or SELL'));
export type Side = z.infer<typeof SideSchema>;

export const TradeStatusSchema = z.enum(TRADE_STATUSES);
export type TradeStatus = z.infer<typeof TradeStatusSchema>;

export const TradeIdSchema = z.string().regex(/^TRD-\d{6,}$/, 'Invalid trade id');
export type TradeId = z.infer<typeof TradeIdSchema>;

const IsoTimestampSchema = z.iso.datetime({ offset: true });

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-3;
}

/** Field validators shared by the Trade entity and the create/amend inputs. */
const tradeFields = {
  symbol: text('Symbol')
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9.]{0,9}$/, 'Symbol must be 1–10 letters, digits or "."'),
  side: SideSchema,
  quantity: numeric('Quantity')
    .int('Quantity must be a whole number')
    .positive('Quantity must be positive')
    .max(MAX_QUANTITY, `Quantity cannot exceed ${MAX_QUANTITY.toLocaleString('en-US')}`),
  price: numeric('Price')
    .positive('Price must be positive')
    .max(MAX_PRICE, `Price cannot exceed ${MAX_PRICE.toLocaleString('en-US')}`)
    .refine((p) => hasAtMostDecimals(p, PRICE_DECIMALS), {
      error: `Price can have at most ${PRICE_DECIMALS} decimal places`,
    }),
  trader: text('Trader')
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,19}$/, 'Trader must be 2–20 letters, digits or "_"'),
  book: text('Book')
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Book must be 2–40 letters, digits or "_"'),
  counterparty: text('Counterparty')
    .trim()
    .min(1, 'Counterparty is required')
    .max(100, 'Counterparty cannot exceed 100 characters'),
  tradeTimestamp: z.iso.datetime({
    offset: true,
    error: 'Trade time must be an ISO-8601 timestamp, e.g. 2026-08-18T09:15:23Z',
  }),
};

export const TradeSchema = z.object({
  tradeId: TradeIdSchema,
  ...tradeFields,
  status: TradeStatusSchema,
  version: z.number().int().positive(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});
export type Trade = z.infer<typeof TradeSchema>;

export const TRADE_FIELDS = TradeSchema.keyof().options;
export const TradeFieldSchema = TradeSchema.keyof();
export type TradeField = z.infer<typeof TradeFieldSchema>;

const VersionSchema = z.number().int().positive();

/** POST /api/trades. `tradeTimestamp` defaults to "now" on the server. */
export const CreateTradeSchema = z.strictObject({
  ...tradeFields,
  tradeTimestamp: tradeFields.tradeTimestamp.optional(),
});
export type CreateTradeInput = z.input<typeof CreateTradeSchema>;
export type CreateTrade = z.output<typeof CreateTradeSchema>;

export const AMENDABLE_FIELDS = [
  'symbol',
  'side',
  'quantity',
  'price',
  'trader',
  'book',
  'counterparty',
  'tradeTimestamp',
] as const satisfies readonly TradeField[];
export type AmendableField = (typeof AMENDABLE_FIELDS)[number];

/**
 * PATCH /api/trades/:id. Status is deliberately not amendable — cancelling is
 * its own transition. `expectedVersion` enables optimistic concurrency.
 */
export const AmendTradeSchema = z
  .strictObject({
    ...z.object(tradeFields).partial().shape,
    expectedVersion: VersionSchema,
  })
  .refine((input) => AMENDABLE_FIELDS.some((field) => input[field] !== undefined), {
    error: 'At least one field must be amended',
  });
export type AmendTradeInput = z.input<typeof AmendTradeSchema>;
export type AmendTrade = z.output<typeof AmendTradeSchema>;

/** POST /api/trades/:id/cancel */
export const CancelTradeSchema = z.strictObject({ expectedVersion: VersionSchema });
export type CancelTradeInput = z.infer<typeof CancelTradeSchema>;

export const TradeIdParamsSchema = z.object({ id: TradeIdSchema });

/** GET /api/trades query string. All filters are optional exact matches. */
export const TradeListQuerySchema = z.object({
  symbol: tradeFields.symbol.optional(),
  side: SideSchema.optional(),
  trader: tradeFields.trader.optional(),
  book: tradeFields.book.optional(),
  status: TradeStatusSchema.optional(),
});
export type TradeListQuery = z.infer<typeof TradeListQuerySchema>;

/**
 * GET /api/trades response. `lastEventId` is read before the trades, so a client
 * that subscribes to `/api/events?lastEventId=…` misses nothing; any overlap is
 * resolved by ignoring events whose trade version is not newer than the cached one.
 */
export const TradeListResponseSchema = z.object({
  trades: z.array(TradeSchema),
  lastEventId: z.number().int().nonnegative(),
});
export type TradeListResponse = z.infer<typeof TradeListResponseSchema>;
