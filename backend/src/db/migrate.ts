import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from './database';

/**
 * Locates `database/migrations` by walking up from this file, so it resolves
 * both from `src/` (tsx, tests) and from the bundled `dist/` output.
 */
export function findMigrationsDir(start = dirname(fileURLToPath(import.meta.url))): string {
  for (let dir = start; ; dir = dirname(dir)) {
    const candidate = join(dir, 'database', 'migrations');
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) {
      throw new Error('Could not find database/migrations; set MIGRATIONS_DIR');
    }
  }
}

/**
 * Applies pending `.sql` migrations in filename order, each in its own
 * transaction, and records them in `schema_migrations`.
 *
 * @returns the names of the migrations applied by this call.
 */
export async function migrate(
  db: Database,
  migrationsDir = findMigrationsDir(),
): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));
  const pending = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql') && !applied.has(file))
    .sort();

  for (const name of pending) {
    const sql = await readFile(join(migrationsDir, name), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
  }
  return pending;
}
