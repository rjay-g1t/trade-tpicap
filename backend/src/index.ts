import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/database';
import { migrate } from './db/migrate';
import { DEFAULT_SEED_OPTIONS } from './seed/generateTrades';
import { seedIfEmpty } from './seed/seedDatabase';
import { PostgresTradeRepository } from './trades/postgresTradeRepository';
import { TradeEventBus } from './trades/tradeEventBus';
import { TradeService } from './trades/tradeService';

const config = loadConfig();
const db = await createDatabase({
  databaseUrl: config.DATABASE_URL,
  pgliteDataDir: config.PGLITE_DATA_DIR,
});

const repository = new PostgresTradeRepository(db);
const bus = new TradeEventBus();
const service = new TradeService({ repository, events: bus });
const app = await buildApp({ service, bus, logger: { level: config.LOG_LEVEL } });

try {
  app.log.info(
    db.kind === 'pglite'
      ? `Using embedded PGlite database at ${config.PGLITE_DATA_DIR}`
      : 'Using PostgreSQL',
  );

  const applied = await migrate(db, config.MIGRATIONS_DIR);
  if (applied.length) app.log.info({ applied }, 'Applied migrations');

  if (config.SEED_ON_EMPTY) {
    const seeded = await seedIfEmpty(repository, {
      ...DEFAULT_SEED_OPTIONS,
      count: config.SEED_COUNT,
      seed: config.SEED,
      endDate: new Date(),
    });
    if (seeded) app.log.info(`Seeded ${seeded} trades`);
  }

  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.fatal({ err: error }, 'Failed to start');
  await db.close();
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`Received ${signal}, shutting down`);
    await app.close();
    await db.close();
    process.exit(0);
  });
}
