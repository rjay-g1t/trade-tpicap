import { PGlite } from '@electric-sql/pglite';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';

export interface Queryable {
  query<R>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
  /** Runs one or more statements without parameters (e.g. a migration file). */
  exec(sql: string): Promise<void>;
}

/**
 * The minimal database surface the app needs. Implemented by node-postgres
 * (Docker / real Postgres) and PGlite (tests and Docker-free development), so
 * everything above this layer is unaware of which one is in use.
 */
export interface Database extends Queryable {
  readonly kind: 'postgres' | 'pglite';
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createPostgresDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString });

  const queryable = (client: pg.Pool | pg.PoolClient): Queryable => ({
    async query<R>(sql: string, params?: unknown[]) {
      const result = await client.query(sql, params);
      return { rows: result.rows as R[] };
    },
    async exec(sql: string) {
      await client.query(sql);
    },
  });

  return {
    kind: 'postgres',
    ...queryable(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(queryable(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** @param dataDir Directory to persist data in; omit for an in-memory database. */
export async function createPGliteDatabase(dataDir?: string): Promise<Database> {
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const db = dataDir ? await PGlite.create(dataDir) : await PGlite.create();

  const queryable = (client: Pick<PGlite, 'query' | 'exec'>): Queryable => ({
    query: (sql, params) => client.query(sql, params),
    async exec(sql) {
      await client.exec(sql);
    },
  });

  return {
    kind: 'pglite',
    ...queryable(db),
    transaction: (fn) => db.transaction((tx) => fn(queryable(tx))),
    close: () => db.close(),
  };
}

export function createDatabase(options: {
  databaseUrl?: string | undefined;
  pgliteDataDir: string;
}): Promise<Database> | Database {
  return options.databaseUrl
    ? createPostgresDatabase(options.databaseUrl)
    : createPGliteDatabase(options.pgliteDataDir);
}
