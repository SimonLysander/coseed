import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { DatabaseService } from '../../database/database.service.js';
import { SnapshotRepository } from './persistence/snapshots.js';
import { readSources } from './persistence/sources.js';
import type { QueryConnection } from './persistence/sql.js';
import type { StoredRevision } from '../../../contracts/project-content.js';
import {
  requirementViewSchema,
  recordViewSchema,
  type requirementsQuerySchema,
  type recordsQuerySchema,
  type historyQuerySchema,
} from '../../../contracts/requirements-http.js';
import { ensure } from './errors.js';

const inList = (values: string[]) =>
  sql.join(
    values.map((id) => sql`${id}`),
    sql`, `,
  );
function scope(connection: QueryConnection, projectId: string, version?: number) {
  const repository = new SnapshotRepository(connection);
  const at = version ?? repository.head(projectId);
  repository.requireVersion(projectId, at);
  const project = repository.readType('project', { projectId, version: at, id: projectId })[0];
  ensure(project, 'STORAGE_CORRUPT', '项目资料缺失。');
  return {
    repository,
    at,
    project: { ...project.content, id: projectId, version: at, createdAt: project.createdAt },
  };
}
function views(connection: QueryConnection, projectId: string, revisions: StoredRevision[]) {
  if (!revisions.length) return [];
  const actors = new Map(
    connection
      .all<{
        id: string;
        entrypoint: 'web' | 'mcp' | 'cli' | 'system';
        actorKind: 'human' | 'agent' | 'system';
        actorLabel: string;
        noteMd: string | null;
      }>(
        sql`SELECT id, entrypoint, actor_kind AS actorKind, actor_label AS actorLabel, note_md AS noteMd
      FROM write_operations WHERE project_id = ${projectId} AND id IN (${inList([...new Set(revisions.map((r) => r.operationId))])})`,
      )
      .map(({ id, ...actor }) => [id, actor]),
  );
  return revisions.map((r) => {
    const common = {
      id: r.id,
      revisionNo: r.revisionNo,
      projectVersion: r.projectVersion,
      savedAt: r.savedAt,
      createdAt: r.createdAt,
      operationId: r.operationId,
      isDeleted: r.isDeleted,
      content: r.content,
      citations: r.citations,
      links: r.links,
      actor: actors.get(r.operationId),
    };
    return r.objectType === 'requirement'
      ? requirementViewSchema.parse({ ...common, statusChange: r.statusChange })
      : recordViewSchema.parse({
          ...common,
          captureVersion: r.captureVersion,
          captureOrdinal: r.captureOrdinal,
        });
  });
}
function requireCurrent(
  repository: SnapshotRepository,
  projectId: string,
  version: number,
  id: string,
) {
  const result = repository.readType('requirement', { projectId, version, id })[0];
  ensure(result, 'NOT_FOUND', '需求不存在、已移除或不属于当前项目。');
  return result;
}
function stats(
  connection: QueryConnection,
  repository: SnapshotRepository,
  projectId: string,
  version: number,
  ids: string[],
) {
  if (!ids.length) return new Map<string, { recordCount: number; statusChangedAt: number }>();
  const counts = new Map(
    connection
      .all<{ id: string; count: number }>(
        sql`SELECT requirement_id AS id, count(*) AS count
    FROM (${repository.selection('record', { projectId, version })}) WHERE requirement_id IN (${inList(ids)}) GROUP BY requirement_id`,
      )
      .map((row) => [row.id, row.count]),
  );
  const times = connection.all<{ id: string; time: number }>(sql`SELECT id, time FROM (
    SELECT r.requirement_id AS id, o.saved_at AS time,
    row_number() OVER (PARTITION BY r.requirement_id ORDER BY o.result_content_version DESC) AS position
    FROM requirement_revisions r JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
    WHERE r.project_id = ${projectId} AND o.result_content_version <= ${version}
    AND r.requirement_id IN (${inList(ids)}) AND r.status_change_kind IS NOT NULL AND r.is_deleted = 0
  ) WHERE position = 1`);
  return new Map(
    times.map((row) => [
      row.id,
      { recordCount: counts.get(row.id) ?? 0, statusChangedAt: row.time },
    ]),
  );
}

@Injectable()
export class RequirementsReadService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  list(projectId: string, options: z.infer<typeof requirementsQuerySchema>) {
    return this.database.db.transaction((tx) => {
      const { repository, at, project } = scope(tx, projectId, options.version);
      const current = repository.selection('requirement', { projectId, version: at });
      let after: SQL = sql``;
      if (options.afterId !== undefined) {
        const cursor = requireCurrent(repository, projectId, at, options.afterId);
        after = sql`AND (__version < ${cursor.projectVersion} OR (__version = ${cursor.projectVersion} AND requirement_id > ${cursor.id}))`;
      }
      const rows = tx.all<{
        id: string;
        title: string;
        status: string;
        revisionNo: number;
        projectVersion: number;
        savedAt: number;
        createdAt: number;
        operationId: string;
      }>(sql`SELECT requirement_id AS id, title, status, revision_no AS revisionNo,
        __version AS projectVersion, __saved_at AS savedAt, __created_at AS createdAt, operation_id AS operationId
        FROM (${current}) WHERE 1 = 1 ${after}
        ${options.name === undefined ? sql`` : sql`AND instr(lower(title), lower(${options.name})) > 0`}
        ${options.status === undefined ? sql`` : sql`AND status = ${options.status}`}
        ORDER BY __version DESC, requirement_id ASC LIMIT ${options.limit + 1}`);
      const page = rows.slice(0, options.limit);
      const counts = stats(
        tx,
        repository,
        projectId,
        at,
        page.map((r) => r.id),
      );
      return {
        project,
        items: page.map((r) => {
          const count = counts.get(r.id);
          ensure(count, 'STORAGE_CORRUPT', '需求缺少首次状态记录。');
          return { ...r, isDeleted: false, ...count };
        }),
        nextAfterId: rows.length > options.limit ? page.at(-1)!.id : null,
      };
    });
  }

  detail(projectId: string, requirementId: string, version?: number) {
    return this.database.db.transaction((tx) => {
      const { repository, at, project } = scope(tx, projectId, version);
      const value = requireCurrent(repository, projectId, at, requirementId);
      const count = stats(tx, repository, projectId, at, [requirementId]).get(requirementId);
      ensure(count, 'STORAGE_CORRUPT', '需求缺少首次状态记录。');
      return { project, requirement: views(tx, projectId, [value])[0], ...count };
    });
  }

  records(projectId: string, requirementId: string, options: z.infer<typeof recordsQuerySchema>) {
    return this.database.db.transaction((tx) => {
      const { repository, at } = scope(tx, projectId, options.version);
      requireCurrent(repository, projectId, at, requirementId);
      let after: SQL = sql``;
      if (options.afterId !== undefined) {
        const cursor = repository.readType('record', {
          projectId,
          version: at,
          id: options.afterId,
        })[0];
        ensure(
          cursor && cursor.content.requirementId === requirementId,
          'INVALID_INPUT',
          '分页位置不属于该需求。',
        );
        after = sql`AND (__capture_version < ${cursor.captureVersion} OR (__capture_version = ${cursor.captureVersion} AND __capture_ordinal < ${cursor.captureOrdinal}))`;
      }
      const rows = tx.all<{
        id: string;
      }>(sql`SELECT progress_record_id AS id FROM (${repository.selection('record', { projectId, version: at })})
        WHERE requirement_id = ${requirementId} ${after} ORDER BY __capture_version DESC, __capture_ordinal DESC LIMIT ${options.limit + 1}`);
      const page = rows.slice(0, options.limit);
      const values = new Map(
        repository
          .readType('record', { projectId, version: at, ids: page.map((r) => r.id) })
          .map((r) => [r.id, r]),
      );
      return {
        version: at,
        items: views(
          tx,
          projectId,
          page.map((r) => values.get(r.id)!),
        ),
        nextAfterId: rows.length > options.limit ? page.at(-1)!.id : null,
      };
    });
  }

  history(
    projectId: string,
    type: 'requirement' | 'record',
    id: string,
    options: z.infer<typeof historyQuerySchema>,
  ) {
    return this.database.db.transaction((tx) => {
      const { repository, at } = scope(tx, projectId, options.version);
      const existing = repository.readType(type, {
        projectId,
        version: at,
        id,
        includeDeleted: true,
      })[0];
      ensure(existing, 'NOT_FOUND', '对象不存在、不属于当前项目或晚于所读版本。');
      const values = repository.readType(type, {
        projectId,
        version: at,
        id,
        includeDeleted: true,
        allRevisions: true,
        ...(options.beforeRevision === undefined ? {} : { beforeRevision: options.beforeRevision }),
        limit: options.limit + 1,
      });
      const page = values.slice(0, options.limit);
      return {
        version: at,
        items: views(tx, projectId, page).map((value) => ({ ...value, objectType: type })),
        nextBeforeRevision: values.length > options.limit ? page.at(-1)!.revisionNo : null,
      };
    });
  }

  revision(
    projectId: string,
    type: 'requirement' | 'record',
    id: string,
    revisionNo: number,
    version: number,
  ) {
    return this.database.db.transaction((tx) => {
      const { repository, at } = scope(tx, projectId, version);
      const value = repository.readType(type, {
        projectId,
        version: at,
        id,
        revisionNo,
        includeDeleted: true,
      })[0];
      ensure(value, 'NOT_FOUND', '修订不存在、不属于当前项目或晚于所读版本。');
      return {
        version: at,
        revision: { ...views(tx, projectId, [value])[0], objectType: type },
        sources: readSources(
          tx,
          projectId,
          [...new Set(value.citations.map((c) => c.sourceId))],
          at,
        ),
      };
    });
  }
}
