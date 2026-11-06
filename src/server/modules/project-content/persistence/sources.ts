import { sql } from 'drizzle-orm';
import type { SourceInput, StoredSource } from '../../../../contracts/project-content.js';
import { sourceInputSchema } from '../../../../contracts/project-content.js';
import { ensure } from '../errors.js';
import { digestText, insert, json, type QueryConnection } from './sql.js';

export interface PendingOperation {
  id: string;
  version: number;
  savedAt: number;
}

export function saveSources(
  connection: QueryConnection,
  projectId: string,
  operationId: string,
  sources: SourceInput[],
): void {
  const ids = new Set<string>();
  for (const source of sources) {
    ensure(!ids.has(source.id), 'INVALID_INPUT', '同一请求中的来源 ID 重复。');
    ids.add(source.id);
    const existing = connection.get<{
      project_id: string;
      kind: string;
      raw_text: string;
      locator_json: string;
      occurred_at: number | null;
    }>(sql`SELECT * FROM sources WHERE id = ${source.id}`);
    if (existing) {
      ensure(
        existing.project_id === projectId,
        'INVALID_REFERENCE',
        '来源不存在或不属于目标项目。',
      );
      ensure(
        json({
          kind: existing.kind,
          rawText: existing.raw_text,
          locator: JSON.parse(existing.locator_json),
          occurredAt: existing.occurred_at,
        }) ===
          json({
            kind: source.kind,
            rawText: source.rawText,
            locator: source.locator,
            occurredAt: source.occurredAt,
          }),
        'CONFLICT',
        '来源不可覆盖；更正材料请使用新的来源 ID。',
      );
      continue;
    }
    insert(connection, 'sources', {
      id: source.id,
      project_id: projectId,
      captured_by_operation_id: operationId,
      kind: source.kind,
      raw_text: source.rawText,
      content_hash: digestText(source.rawText),
      locator_json: json(source.locator),
      occurred_at: source.occurredAt,
    });
  }
}

export function readSources(
  connection: QueryConnection,
  projectId: string,
  ids: string[],
  version: number,
  pending?: PendingOperation,
): StoredSource[] {
  const unique = [...new Set(ids)].sort();
  const result: StoredSource[] = [];
  // Bounded parameter batches also work with SQLite builds using smaller limits.
  for (let offset = 0; offset < unique.length; offset += 500) {
    const batch = unique.slice(offset, offset + 500);
    const rows = connection.all<{
      id: string;
      kind: string;
      raw_text: string;
      content_hash: string;
      locator_json: string;
      occurred_at: number | null;
      captured_by_operation_id: string;
      captured_at: number;
      captured_version: number;
    }>(sql`SELECT s.*, CASE WHEN s.captured_by_operation_id = ${pending?.id ?? null} THEN ${pending?.savedAt ?? null} ELSE o.saved_at END AS captured_at,
      CASE WHEN s.captured_by_operation_id = ${pending?.id ?? null} THEN ${pending?.version ?? null} ELSE o.result_content_version END AS captured_version
      FROM sources s LEFT JOIN write_operations o ON o.project_id = s.project_id AND o.id = s.captured_by_operation_id
      WHERE s.project_id = ${projectId} AND s.id IN (${sql.join(
        batch.map((id) => sql`${id}`),
        sql`, `,
      )})
      AND (o.result_content_version <= ${version} OR s.captured_by_operation_id = ${pending?.id ?? null}) ORDER BY s.id`);
    for (const row of rows) {
      ensure(
        digestText(row.raw_text) === row.content_hash,
        'STORAGE_CORRUPT',
        '已存来源的内容校验失败。',
      );
      result.push({
        ...sourceInputSchema.parse({
          id: row.id,
          kind: row.kind,
          rawText: row.raw_text,
          locator: JSON.parse(row.locator_json),
          occurredAt: row.occurred_at,
        }),
        contentHash: row.content_hash,
        capturedByOperationId: row.captured_by_operation_id,
        capturedAt: row.captured_at,
        capturedProjectVersion: row.captured_version,
      });
    }
  }
  ensure(
    result.length === unique.length,
    'INVALID_REFERENCE',
    '有来源不存在、不属于项目或晚于所读快照。',
  );
  return result;
}
