import { createPGliteDatabase, type Database } from '../db/database';
import { migrate } from '../db/migrate';

/** A fresh, fully migrated in-memory Postgres for a test suite. */
export async function createTestDatabase(): Promise<Database> {
  const db = await createPGliteDatabase();
  await migrate(db);
  return db;
}

/** Empties all tables and restarts id sequences — much faster than a new database per test. */
export async function resetTestDatabase(db: Database): Promise<void> {
  await db.exec(`
    TRUNCATE trade_events, trades RESTART IDENTITY;
    ALTER SEQUENCE trade_id_seq RESTART;
  `);
}
