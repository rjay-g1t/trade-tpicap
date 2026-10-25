import { buildApp, type App, type AppDeps } from '../app';
import type { Database } from '../db/database';
import { PostgresTradeRepository } from '../trades/postgresTradeRepository';
import { TradeEventBus } from '../trades/tradeEventBus';
import { TradeService } from '../trades/tradeService';

export interface TestApp {
  app: App;
  bus: TradeEventBus;
  service: TradeService;
}

/** The real app wired to the given (test) database. */
export async function createTestApp(db: Database, events?: AppDeps['events']): Promise<TestApp> {
  const bus = new TradeEventBus();
  const service = new TradeService({ repository: new PostgresTradeRepository(db), events: bus });
  const app = await buildApp({ service, bus, ...(events && { events }) });
  return { app, bus, service };
}
