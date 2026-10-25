import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPGliteDatabase, type Database } from './database';
import { findMigrationsDir, migrate } from './migrate';

describe('migrate', () => {
  let db: Database | undefined;

  afterEach(async () => {
    await db?.close();
    db = undefined;
  });

  it('applies the repository migrations once', async () => {
    db = await createPGliteDatabase();
    expect(await migrate(db)).toEqual(['0001_init.sql']);
    expect(await migrate(db)).toEqual([]);

    const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
    expect(rows).toEqual([{ name: '0001_init.sql' }]);
  });

  it('applies pending migrations in filename order and rolls back a failing one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'migrations-'));
    await writeFile(join(dir, '002_insert.sql'), "INSERT INTO t VALUES ('second')");
    await writeFile(join(dir, '001_create.sql'), 'CREATE TABLE t (v text)');
    await writeFile(join(dir, 'notes.txt'), 'ignored');

    db = await createPGliteDatabase();
    expect(await migrate(db, dir)).toEqual(['001_create.sql', '002_insert.sql']);

    await writeFile(join(dir, '003_broken.sql'), "INSERT INTO t VALUES ('x'); SELECT nope;");
    await expect(migrate(db, dir)).rejects.toThrow();

    const { rows } = await db.query<{ v: string }>('SELECT v FROM t');
    expect(rows).toEqual([{ v: 'second' }]);
    const applied = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
    expect(applied.rows.map((r) => r.name)).not.toContain('003_broken.sql');
  });

  it('finds database/migrations by walking up the directory tree', () => {
    expect(findMigrationsDir()).toMatch(/database[\\/]migrations$/);
    expect(() => findMigrationsDir(tmpdir())).toThrow(/MIGRATIONS_DIR/);
  });
});
