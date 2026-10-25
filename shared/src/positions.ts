import { z } from 'zod';

/** GET /api/positions — net position per symbol across ACTIVE trades. */
export const PositionSchema = z.object({
  symbol: z.string(),
  tradeCount: z.number().int().nonnegative(),
  buyQuantity: z.number().int().nonnegative(),
  sellQuantity: z.number().int().nonnegative(),
  netQuantity: z.number().int(),
  buyNotional: z.number().nonnegative(),
  sellNotional: z.number().nonnegative(),
  netNotional: z.number(),
});
export type Position = z.infer<typeof PositionSchema>;
