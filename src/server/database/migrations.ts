import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export const migrationsDirectory = fileURLToPath(new URL('../../../migrations/', import.meta.url));

export function applyMigrations(connection: Database.Database, folder = migrationsDirectory): void {
  const planned = readMigrationFiles({ migrationsFolder: folder });
  const exists = connection
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  const applied = exists
    ? (connection
        .prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')
        .all() as { hash: string; created_at: number }[])
    : [];
  if (
    applied.length > planned.length ||
    applied.some(
      (row, index) =>
        row.hash !== planned[index]?.hash || row.created_at !== planned[index]?.folderMillis,
    )
  ) {
    throw new Error(
      '数据库迁移历史与当前安装包不一致；请使用匹配版本并保留原数据库，禁止自动重置。',
    );
  }
  if (
    applied.length === 0 &&
    connection
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name IN ('projects', 'write_operations')",
      )
      .get()
  ) {
    throw new Error('发现未登记迁移的业务表；需要先核对已有数据，不能自动覆盖。');
  }
  if (
    planned.some(
      (entry, index) => index > 0 && entry.folderMillis <= planned[index - 1]!.folderMillis,
    )
  ) {
    throw new Error('数据库迁移顺序无效。');
  }
  migrate(drizzle(connection), { migrationsFolder: folder });
}
