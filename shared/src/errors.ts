import { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'TRADE_CANCELLED',
  'STALE_VERSION',
  'INTERNAL_ERROR',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorDetailSchema = z.object({
  /** Dot-separated path to the offending field, e.g. "price". Empty for form-level errors. */
  path: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

/** Every non-2xx response from the API has this shape. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.array(ErrorDetailSchema).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
