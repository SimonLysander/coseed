import { sql } from 'drizzle-orm';
import type { ObjectType, StoredRevision } from '../../../../contracts/project-content.js';
import { definitions, objectTypes } from './definitions.js';
import { insert, json, digestText, type QueryConnection } from './sql.js';
import { memberDefinitions, writeLinks, type Row } from './relations.js';
import { ensure } from '../errors.js';

export interface PlannedRevision {
  before: StoredRevision | null;
  after: StoredRevision;
  action: 'upsert' | 'remove' | 'restore';
}

export function ensureIdentity(
  connection: QueryConnection,
  projectId: string,
  value: StoredRevision,
): void {
  const d = definitions[value.objectType];
  if (d.singleton) {
    ensure(value.id === projectId, 'INVALID_INPUT', '项目基本资料及综述必须使用项目 ID。');
    return;
  }
  const existing = connection.get<{ project_id: string }>(
    sql`SELECT project_id FROM ${sql.identifier(d.identity)} WHERE id = ${value.id}`,
  );
  if (existing) {
    ensure(existing.project_id === projectId, 'INVALID_REFERENCE', '对象不存在或不属于项目。');
    return;
  }
  const fields: Row = {
    id: value.id,
    project_id: projectId,
    current_revision_no: 1,
    created_at: value.createdAt,
  };
  if (value.objectType === 'entity') fields.kind = value.content.kind;
  insert(connection, d.identity, fields);
}

export function writeRevision(
  connection: QueryConnection,
  projectId: string,
  value: StoredRevision,
): void {
  const d = definitions[value.objectType];
  const c = value.content;
  const fields: Row = {
    project_id: projectId,
    [d.key]: value.id,
    revision_no: value.revisionNo,
    operation_id: value.operationId,
  };
  if (d.removable) fields.is_deleted = Number(value.isDeleted);
  switch (value.objectType) {
    case 'project':
      Object.assign(fields, {
        previous_revision_no: value.revisionNo === 1 ? null : value.revisionNo - 1,
        name: c.name,
        repository_locator_json: c.repositoryLocator === null ? null : json(c.repositoryLocator),
      });
      break;
    case 'overview': {
      const content = json(c);
      Object.assign(fields, {
        previous_revision_no: value.revisionNo === 1 ? null : value.revisionNo - 1,
        schema_version: 1,
        content_json: content,
        content_hash: digestText(content),
      });
      break;
    }
    case 'entity':
    case 'relationship':
      Object.assign(fields, { schema_version: 1, content_json: json(c) });
      break;
    case 'requirement':
      Object.assign(fields, {
        title: c.title,
        markdown: c.markdown,
        status: c.status,
        status_change_kind: value.statusChange?.kind ?? null,
        status_change_reason_md: value.statusChange?.reasonMd ?? null,
      });
      break;
    case 'record':
      Object.assign(fields, {
        requirement_id: c.requirementId,
        title: c.title,
        markdown: c.markdown,
        occurred_at: c.occurredAt,
        capture_ordinal: value.revisionNo === 1 ? value.captureOrdinal : null,
      });
      break;
    case 'retrospective':
      Object.assign(fields, { title: c.title, scope_md: c.scopeMd, summary_md: c.summaryMd });
      break;
    case 'diagram': {
      const scope = c.scope as { kind: string; moduleId?: string };
      Object.assign(fields, {
        title: c.title,
        scope_kind: scope.kind,
        scope_module_id: scope.kind === 'module' ? scope.moduleId : null,
      });
      break;
    }
    case 'note':
      Object.assign(fields, { title: c.title, problem_md: c.problemMd });
      break;
  }
  insert(connection, d.revisions, fields);
}

export function writeRevisionChildren(
  connection: QueryConnection,
  projectId: string,
  value: StoredRevision,
): void {
  const d = definitions[value.objectType];
  const parent = { project_id: projectId, [d.key]: value.id, revision_no: value.revisionNo };
  for (const citation of value.citations)
    insert(connection, d.citations, {
      ...parent,
      source_id: citation.sourceId,
      target_side: citation.side,
      target_path: citation.path,
      explanation_md: citation.explanationMd,
    });
  for (const member of memberDefinitions[value.objectType] ?? []) {
    for (const id of value.content[member.field] as string[])
      insert(connection, member.table, { ...parent, [member.key]: id });
  }
  writeLinks(connection, projectId, value);
  if (value.objectType === 'requirement')
    for (const record of value.statusChange?.records ?? []) {
      insert(connection, 'requirement_revision_status_records', {
        ...parent,
        record_id: record.id,
        record_revision_no: record.revisionNo,
      });
    }
  if (value.objectType === 'retrospective')
    for (const sourceId of value.inputSourceIds)
      insert(connection, 'retrospective_revision_inputs', { ...parent, source_id: sourceId });
}

export function moveObjectHead(
  connection: QueryConnection,
  projectId: string,
  value: StoredRevision,
  before: StoredRevision | null,
): void {
  const d = definitions[value.objectType];
  if (!before && !d.singleton) return;
  const predicate =
    value.objectType === 'project'
      ? sql`id = ${projectId}`
      : d.singleton
        ? sql`project_id = ${projectId}`
        : sql`project_id = ${projectId} AND id = ${value.id}`;
  const previous = before
    ? sql`current_revision_no = ${before.revisionNo}`
    : sql`current_revision_no IS NULL`;
  const result = connection.run(
    sql`UPDATE ${sql.identifier(d.identity)} SET current_revision_no = ${value.revisionNo} WHERE ${predicate} AND ${previous}`,
  );
  ensure(result.changes === 1, 'CONFLICT', '对象修订已变化，未覆盖现有内容。');
}

export function checkObjectHeads(connection: QueryConnection, projectId: string): void {
  for (const type of objectTypes) {
    const d = definitions[type];
    const projectColumn = type === 'project' ? sql`i.id` : sql`i.project_id`;
    const match = d.singleton ? sql`` : sql`AND r.${sql.identifier(d.key)} = i.id`;
    const invalid =
      connection.get(sql`SELECT 1 FROM ${sql.identifier(d.identity)} i WHERE ${projectColumn} = ${projectId}
      AND i.current_revision_no IS NOT (SELECT max(r.revision_no) FROM ${sql.identifier(d.revisions)} r WHERE r.project_id = ${projectColumn} ${match})`);
    ensure(!invalid, 'STORAGE_CORRUPT', `当前修订指针与最新修订不一致：${type}。`);
  }
}

export function normalizeContent(
  type: ObjectType,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const content = structuredClone(input);
  if (type === 'diagram')
    for (const field of ['entityIds', 'relationshipIds', 'noteIds'])
      (content[field] as string[]).sort();
  if (type === 'note') (content.entityIds as string[]).sort();
  return definitions[type].schema.parse(content);
}
