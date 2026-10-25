import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Postgres connection string. When unset, an embedded PGlite database is used. */
  DATABASE_URL: z.string().min(1).optional(),
  PGLITE_DATA_DIR: z.string().default('.data/pglite'),
  MIGRATIONS_DIR: z.string().optional(),
  SEED_ON_EMPTY: z.stringbool().default(true),
  SEED_COUNT: z.coerce.number().int().min(1).max(10_000).default(500),
  /** Seed for the trade generator; the same value always produces the same trades. */
  SEED: z.coerce.number().int().default(20260818),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
