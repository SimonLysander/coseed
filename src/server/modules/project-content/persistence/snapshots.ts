import { sql, type SQL } from 'drizzle-orm';
import type {
  Citation,
  ObjectType,
  OperationReceipt,
  ProjectSnapshot,
  StoredRevision,
} from '../../../../contracts/project-content.js';
import { ContentError, ensure } from '../errors.js';
import { definitions, objectKey, objectTypes } from './definitions.js';
import {
  decodeCurrentLink,
  decodeHistoricalLink,
  memberDefinitions,
  type Row,
} from './relations.js';
import { readSources, type PendingOperation } from './sources.js';
import { digestText, type QueryConnection } from './sql.js';

interface ReadScope {
  projectId: string;
  version: number;
  pending?: PendingOperation;
  id?: string;
  revisionNo?: number;
  includeDeleted?: boolean;
  ids?: string[];
  allRevisions?: boolean;
  beforeRevision?: number;
  limit?: number;
}

export class SnapshotRepository {
  constructor(readonly connection: QueryConnection) {}

  head(projectId: string): number {
    const row = this.connection.get<{ current_content_version: number }>(
      sql`SELECT current_content_version FROM projects WHERE id = ${projectId}`,
    );
    ensure(row, 'NOT_FOUND', '项目不存在。');
    return row.current_content_version;
  }

  requireVersion(projectId: string, version: number): void {
    ensure(
      this.connection.get(
        sql`SELECT 1 FROM write_operations WHERE project_id = ${projectId} AND result_content_version = ${version}`,
      ),
      'NOT_FOUND',
      '项目快照不存在。',
    );
  }

  operation(projectId: string, operationId: string): OperationReceipt | null {
    const row = this.connection.get<Row>(sql`SELECT o.*, r.retrospective_id FROM write_operations o
      LEFT JOIN retrospective_operations r ON r.project_id = o.project_id AND r.operation_id = o.id
      WHERE o.project_id = ${projectId} AND o.id = ${operationId}`);
    if (!row) return null;
    const statements = objectTypes.map((objectType) => {
      const d = definitions[objectType];
      const removed = d.removable ? sql`is_deleted` : sql`0`;
      return sql`SELECT ${objectType} AS objectType, ${sql.identifier(d.key)} AS id, revision_no AS revisionNo, ${removed} AS isDeleted
        FROM ${sql.identifier(d.revisions)} WHERE project_id = ${projectId} AND operation_id = ${operationId}`;
    });
    const changes = this.connection.all<{
      objectType: ObjectType;
      id: string;
      revisionNo: number;
      isDeleted: number;
    }>(sql.join(statements, sql` UNION ALL `));
    return {
      projectId,
      operationId,
      baseVersion: row.base_content_version as number | null,
      version: row.result_content_version as number,
      savedAt: row.saved_at as number,
      entrypoint: row.entrypoint as OperationReceipt['entrypoint'],
      actorKind: row.actor_kind as OperationReceipt['actorKind'],
      actorLabel: row.actor_label as string,
      retrospectiveId: row.retrospective_id as string | null,
      changes: changes.map((value) => ({ ...value, isDeleted: value.isDeleted === 1 })),
    };
  }

  selection(type: ObjectType, scope: ReadScope): SQL {
    const d = definitions[type];
    const table = sql.identifier(d.revisions);
    const key = sql.identifier(d.key);
    const pendingId = scope.pending?.id ?? null;
    const version = sql`CASE WHEN r.operation_id = ${pendingId} THEN ${scope.pending?.version ?? null} ELSE o.result_content_version END`;
    const savedAt = sql`CASE WHEN r.operation_id = ${pendingId} THEN ${scope.pending?.savedAt ?? null} ELSE o.saved_at END`;
    const createdAt = sql`CASE WHEN f.operation_id = ${pendingId} THEN ${scope.pending?.savedAt ?? null} ELSE fo.saved_at END`;
    const captureVersion =
      type === 'record'
        ? sql`CASE WHEN f.operation_id = ${pendingId} THEN ${scope.pending?.version ?? null} ELSE fo.result_content_version END`
        : sql`NULL`;
    const captureOrdinal = type === 'record' ? sql`f.capture_ordinal` : sql`NULL`;
    const removed = d.removable ? sql`r.is_deleted` : sql`0`;
    const idFilter =
      scope.id !== undefined
        ? sql`AND r.${key} = ${scope.id}`
        : scope.ids !== undefined
          ? scope.ids.length
            ? sql`AND r.${key} IN (${sql.join(
                scope.ids.map((id) => sql`${id}`),
                sql`, `,
              )})`
            : sql`AND 0 = 1`
          : sql``;
    const revisionFilter =
      scope.revisionNo === undefined ? sql`` : sql`AND r.revision_no = ${scope.revisionNo}`;
    return sql`SELECT * FROM (
      SELECT r.*, ${version} AS __version, ${savedAt} AS __saved_at, ${createdAt} AS __created_at,
        ${captureVersion} AS __capture_version, ${captureOrdinal} AS __capture_ordinal, ${removed} AS __removed,
        row_number() OVER (PARTITION BY r.project_id, r.${key} ORDER BY ${version} DESC) AS __position
      FROM ${table} r LEFT JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
      LEFT JOIN ${table} f ON f.project_id = r.project_id AND f.${key} = r.${key} AND f.revision_no = 1
      LEFT JOIN write_operations fo ON fo.project_id = f.project_id AND fo.id = f.operation_id
      WHERE r.project_id = ${scope.projectId} AND (o.result_content_version <= ${scope.version} OR r.operation_id = ${pendingId}) ${idFilter} ${revisionFilter}
      ${scope.beforeRevision === undefined ? sql`` : sql`AND r.revision_no < ${scope.beforeRevision}`}
    ) WHERE ${scope.allRevisions ? sql`1 = 1` : sql`__position = 1`} ${scope.includeDeleted ? sql`` : sql`AND __removed = 0`}
    ${scope.allRevisions ? sql`ORDER BY revision_no DESC` : sql``}
    ${scope.limit === undefined ? sql`` : sql`LIMIT ${scope.limit}`}`;
  }

  private children(table: string, type: ObjectType, scope: ReadScope): Row[] {
    const key = sql.identifier(definitions[type].key);
    return this.connection
      .all<Row>(sql`SELECT c.* FROM ${sql.identifier(table)} c JOIN (${this.selection(type, scope)}) p
      ON p.project_id = c.project_id AND p.${key} = c.${key} AND p.revision_no = c.revision_no`);
  }

  readType(type: ObjectType, scope: ReadScope): StoredRevision[] {
    const d = definitions[type];
    const rows = this.connection.all<Row>(this.selection(type, scope));
    if (rows.length === 0) return [];
    const citations = this.children(d.citations, type, scope);
    const members = (memberDefinitions[type] ?? []).map((member) => ({
      ...member,
      rows: this.children(member.table, type, scope),
    }));
    const links =
      type === 'requirement'
        ? this.children('requirement_revision_links', type, scope)
        : type === 'record'
          ? this.children('progress_record_revision_links', type, scope)
          : [];
    const inputs =
      type === 'retrospective' ? this.children('retrospective_revision_inputs', type, scope) : [];
    const statusRecords =
      type === 'requirement'
        ? this.children('requirement_revision_status_records', type, scope)
        : [];
    const groups = new Map<Row[], Map<string, Row[]>>();
    for (const values of [
      citations,
      links,
      inputs,
      statusRecords,
      ...members.map((member) => member.rows),
    ]) {
      const index = new Map<string, Row[]>();
      for (const child of values) {
        const key = JSON.stringify([child[d.key], child.revision_no]);
        const group = index.get(key) ?? [];
        group.push(child);
        index.set(key, group);
      }
      groups.set(values, index);
    }
    return rows.map((row) => {
      const key = JSON.stringify([row[d.key], row.revision_no]);
      const own = (values: Row[]) => groups.get(values)?.get(key) ?? [];
      let content: Record<string, unknown>;
      if (type === 'project')
        content = {
          name: row.name,
          repositoryLocator:
            row.repository_locator_json === null
              ? null
              : JSON.parse(row.repository_locator_json as string),
        };
      else if (['overview', 'entity', 'relationship'].includes(type)) {
        ensure(row.schema_version === 1, 'UNSUPPORTED_CONTENT', '无法解析所存内容的结构版本。');
        if (type === 'overview')
          ensure(
            digestText(row.content_json as string) === row.content_hash,
            'STORAGE_CORRUPT',
            '已存综述的内容校验失败。',
          );
        content = JSON.parse(row.content_json as string) as Record<string, unknown>;
      } else if (type === 'requirement')
        content = { title: row.title, markdown: row.markdown, status: row.status };
      else if (type === 'record')
        content = {
          requirementId: row.requirement_id,
          title: row.title,
          markdown: row.markdown,
          occurredAt: row.occurred_at,
        };
      else if (type === 'retrospective')
        content = { title: row.title, scopeMd: row.scope_md, summaryMd: row.summary_md };
      else if (type === 'diagram')
        content = {
          title: row.title,
          scope:
            row.scope_kind === 'project'
              ? { kind: 'project' }
              : { kind: 'module', moduleId: row.scope_module_id },
        };
      else content = { title: row.title, problemMd: row.problem_md };
      for (const member of members)
        content[member.field] = own(member.rows)
          .map((value) => value[member.key] as string)
          .sort();
      try {
        content = d.schema.parse(content);
      } catch (cause) {
        throw new ContentError('STORAGE_CORRUPT', '已保存内容不符合结构约定。', { cause });
      }
      ensure(typeof row.__created_at === 'number', 'STORAGE_CORRUPT', '对象缺少首版保存信息。');
      const statusChange =
        type === 'requirement' && row.status_change_kind !== null
          ? {
              kind: row.status_change_kind as 'initial' | 'progress' | 'correction',
              reasonMd: row.status_change_reason_md as string,
              records: own(statusRecords).map((value) => ({
                id: value.record_id as string,
                revisionNo: value.record_revision_no as number,
              })),
            }
          : null;
      const ownLinks = own(links).sort((a, b) => (a.position as number) - (b.position as number));
      return {
        objectType: type,
        id: row[d.key] as string,
        revisionNo: row.revision_no as number,
        operationId: row.operation_id as string,
        projectVersion: row.__version as number,
        savedAt: row.__saved_at as number,
        createdAt: row.__created_at,
        isDeleted: row.__removed === 1,
        content,
        citations: own(citations).map((value): Citation => ({
          sourceId: value.source_id as string,
          side: value.target_side as Citation['side'],
          path: value.target_path as string,
          explanationMd: value.explanation_md as string,
        })),
        links:
          type === 'requirement'
            ? ownLinks.map(decodeCurrentLink)
            : type === 'record'
              ? ownLinks.map(decodeHistoricalLink)
              : [],
        inputSourceIds: own(inputs)
          .map((value) => value.source_id as string)
          .sort(),
        statusChange,
        captureOrdinal: row.__capture_ordinal as number | null,
        captureVersion: row.__capture_version as number | null,
      };
    });
  }

  revision(
    projectId: string,
    type: ObjectType,
    id: string,
    revisionNo: number,
    version = this.head(projectId),
    pending?: PendingOperation,
  ): StoredRevision {
    const result = this.readType(type, {
      projectId,
      version,
      id,
      revisionNo,
      includeDeleted: true,
      ...(pending ? { pending } : {}),
    })[0];
    ensure(result, 'INVALID_REFERENCE', '对象修订不存在、不属于项目或晚于所读快照。');
    return result;
  }

  snapshot(
    projectId: string,
    version = this.head(projectId),
    pending?: PendingOperation,
    includeSources = true,
  ): ProjectSnapshot {
    if (!pending || version !== pending.version) this.requireVersion(projectId, version);
    const scope: ReadScope = { projectId, version, ...(pending ? { pending } : {}) };
    const project = this.readType('project', scope)[0];
    ensure(project, 'STORAGE_CORRUPT', '项目缺少基本资料。');
    const objects = objectTypes
      .filter((type) => type !== 'project')
      .flatMap((type) => this.readType(type, scope));
    objects.sort((a, b) => {
      if (a.objectType === 'record' && b.objectType === 'record')
        return a.captureVersion! - b.captureVersion! || a.captureOrdinal! - b.captureOrdinal!;
      const left = objectKey(a.objectType, a.id);
      const right = objectKey(b.objectType, b.id);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    const sourceIds = new Set<string>();
    for (const value of [project, ...objects]) {
      for (const citation of value.citations) sourceIds.add(citation.sourceId);
      for (const id of value.inputSourceIds) sourceIds.add(id);
      if (value.objectType === 'entity')
        for (const key of ['primarySourceId', 'typeSourceId'])
          if (typeof value.content[key] === 'string') sourceIds.add(value.content[key] as string);
    }
    const sources = includeSources
      ? readSources(this.connection, projectId, [...sourceIds], version, pending)
      : [];
    return { projectId, version, project, objects, sources };
  }
}
