import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { applyMigrations, migrationsDirectory } from '../../dist/server/database/migrations.js';
import * as schema from '../../dist/server/database/schema/index.js';

const memory = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
};

describe('formal SQLite migrations', () => {
  it('applies every migration once and query mappings match every real column', () => {
    const db = memory();
    try {
      applyMigrations(db);
      applyMigrations(db);
      expect(db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get()).toEqual({ n: 4 });
      expect(db.pragma('foreign_key_check')).toEqual([]);
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name != '__drizzle_migrations'",
        )
        .all() as { name: string }[];
      expect(Object.values(schema)).toHaveLength(tables.length);
      for (const table of Object.values(schema)) {
        const config = getTableConfig(table);
        const columns = db.prepare(`PRAGMA table_xinfo("${config.name}")`).all() as {
          name: string;
          type: string;
          notnull: number;
          hidden: number;
        }[];
        expect(config.columns.map((column) => column.name).sort()).toEqual(
          columns.map((column) => column.name).sort(),
        );
        for (const column of config.columns) {
          const actual = columns.find((value) => value.name === column.name)!;
          expect(column.getSQLType().toUpperCase(), `${config.name}.${column.name}`).toBe(
            actual.type,
          );
          expect(column.notNull, `${config.name}.${column.name}`).toBe(actual.notnull === 1);
          expect(!!column.generated, `${config.name}.${column.name}`).toBe(actual.hidden === 3);
        }
      }
    } finally {
      db.close();
    }
  });

  it('refuses changed migration checksums and databases created by a newer migration set', () => {
    const db = memory();
    const directory = mkdtempSync(join(tmpdir(), 'coseed-migrations-'));
    try {
      applyMigrations(db);
      cpSync(migrationsDirectory, directory, { recursive: true });
      const file = join(directory, '0000_coordination.sql');
      writeFileSync(file, `${readFileSync(file, 'utf8')}\n-- Unexpected checksum edit.\n`);
      expect(() => applyMigrations(db, directory)).toThrow(/不一致/);
      const journalFile = join(directory, 'meta/_journal.json');
      const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: unknown[] };
      journal.entries.pop();
      writeFileSync(journalFile, JSON.stringify(journal));
      expect(() => applyMigrations(db, directory)).toThrow(/不一致/);
      expect(db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get()).toEqual({ n: 4 });
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rolls back pending DDL together when a migration fails', () => {
    const directory = mkdtempSync(join(tmpdir(), 'coseed-failed-migration-'));
    const db = memory();
    try {
      cpSync(migrationsDirectory, directory, { recursive: true });
      const file = join(directory, '0003_requirements.sql');
      writeFileSync(
        file,
        `${readFileSync(file, 'utf8')}\n--> statement-breakpoint\nTHIS IS INVALID SQL;`,
      );
      expect(() => applyMigrations(db, directory)).toThrow();
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'")
          .get(),
      ).toBeUndefined();
      expect(db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get()).toEqual({ n: 0 });
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not adopt or overwrite unversioned business tables', () => {
    const db = memory();
    try {
      db.exec('CREATE TABLE projects (precious TEXT)');
      db.exec("INSERT INTO projects VALUES ('Keep existing data')");
      expect(() => applyMigrations(db)).toThrow(/未登记/);
      expect(db.prepare('SELECT precious FROM projects').get()).toEqual({
        precious: 'Keep existing data',
      });
    } finally {
      db.close();
    }
  });
});
