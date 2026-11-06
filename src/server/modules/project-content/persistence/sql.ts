import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { ContentError } from '../errors.js';

export type QueryConnection = Pick<BetterSQLite3Database, 'get' | 'all' | 'run'>;
export const digestText = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');
export function json(value: unknown): string {
  try {
    const result = canonicalize(value);
    if (result === undefined) throw new Error('没有 JSON 表示');
    return result;
  } catch (cause) {
    throw new ContentError('INVALID_INPUT', '内容必须是有效且可规范化的 JSON。', { cause });
  }
}
export function insert(
  connection: QueryConnection,
  table: string,
  values: Record<string, unknown>,
): void {
  const entries = Object.entries(values);
  connection.run(sql`INSERT INTO ${sql.identifier(table)} (${sql.join(
    entries.map(([key]) => sql.identifier(key)),
    sql`, `,
  )})
    VALUES (${sql.join(
      entries.map(([, value]) => sql`${value}`),
      sql`, `,
    )})`);
}
