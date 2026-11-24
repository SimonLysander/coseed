import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { SnapshotRepository } from './persistence/snapshots.js';
import type { QueryConnection } from './persistence/sql.js';
import { ensure } from './errors.js';
import { projectMetadataSchema, type StoredRevision } from '../../../contracts/project-content.js';
import { businessDesignBundleSchema } from '../../../contracts/content/business-design.js';
import { diagramSummarySchema } from '../../../contracts/business-http.js';

const ids = (values: string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
function readScope(tx: QueryConnection, projectId: string, version?: number) {
  const repository = new SnapshotRepository(tx);
  const at = version ?? repository.head(projectId);
  repository.requireVersion(projectId, at);
  const current = repository.readType('project', { projectId, version: at, id: projectId })[0];
  ensure(current, 'STORAGE_CORRUPT', '项目资料缺失。');
  return {
    repository,
    at,
    project: {
      ...projectMetadataSchema.parse(current.content),
      id: projectId,
      version: at,
      createdAt: current.createdAt,
    },
  };
}
function diagramIndex(
  tx: QueryConnection,
  repository: SnapshotRepository,
  projectId: string,
  version: number,
  projectName: string,
) {
  const rows = tx.all<{
    id: string;
    revisionNo: number;
    title: string;
    savedAt: number;
    scope_kind: 'project' | 'module';
    scope_module_id: string | null;
  }>(sql`SELECT diagram_id AS id, revision_no AS revisionNo, title, __saved_at AS savedAt, scope_kind, scope_module_id
    FROM (${repository.selection('diagram', { projectId, version })}) ORDER BY scope_kind DESC, title, diagram_id`);
  const modules = new Map(
    repository
      .readType('entity', {
        projectId,
        version,
        ids: [
          ...new Set(rows.flatMap((row) => (row.scope_module_id ? [row.scope_module_id] : []))),
        ],
      })
      .map((value) => [value.id, value.content]),
  );
  return rows.map((row) => {
    const owner = row.scope_module_id === null ? null : modules.get(row.scope_module_id);
    ensure(
      row.scope_kind === 'project' || owner?.kind === 'module',
      'STORAGE_CORRUPT',
      '设计图的模块范围缺失。',
    );
    return diagramSummarySchema.parse({
      id: row.id,
      revisionNo: row.revisionNo,
      savedAt: row.savedAt,
      title: row.title,
      scope:
        row.scope_kind === 'project'
          ? { kind: 'project' }
          : { kind: 'module', moduleId: row.scope_module_id },
      scopeName: row.scope_kind === 'project' ? projectName : owner?.name,
    });
  });
}
@Injectable()
export class BusinessReadService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  list(projectId: string, version?: number) {
    return this.database.db.transaction((tx) => {
      const { repository, at, project } = readScope(tx, projectId, version);
      const diagrams = diagramIndex(tx, repository, projectId, at, String(project.name));
      const projectViews = diagrams.filter((value) => value.scope.kind === 'project');
      return {
        project,
        diagrams,
        landingDiagramId: projectViews.length === 1 ? projectViews[0]!.id : null,
      };
    });
  }
  diagram(projectId: string, diagramId: string, version?: number) {
    return this.database.db.transaction((tx) => {
      const { repository, at, project } = readScope(tx, projectId, version);
      const value = repository.readType('diagram', { projectId, version: at, id: diagramId })[0];
      ensure(value, 'NOT_FOUND', '设计图不存在、已移除或不属于当前项目。');
      const entityIds = value.content.entityIds as string[];
      const selected = repository.readType('entity', { projectId, version: at, ids: entityIds });
      const ownerIds = new Set(
        selected.flatMap((item) =>
          'owner' in item.content ? [(item.content.owner as { id: string }).id] : [],
        ),
      );
      if ((value.content.scope as { kind: string }).kind === 'module')
        ownerIds.add((value.content.scope as { moduleId: string }).moduleId);
      const known = new Set(selected.map((item) => item.id));
      const owners = repository.readType('entity', {
        projectId,
        version: at,
        ids: [...ownerIds].filter((id) => !known.has(id)),
      });
      const snapshot = (item: StoredRevision) => ({
        id: item.id,
        revisionNo: item.revisionNo,
        content: item.content,
      });
      const bundle = businessDesignBundleSchema.parse({
        schemaVersion: 2,
        projectVersion: at,
        entities: [...selected, ...owners].map(snapshot),
        relationships: repository
          .readType('relationship', {
            projectId,
            version: at,
            ids: value.content.relationshipIds as string[],
          })
          .map(snapshot),
        notes: repository
          .readType('note', { projectId, version: at, ids: value.content.noteIds as string[] })
          .map(snapshot),
        diagrams: [snapshot(value)],
      });
      const sourceIds = selected.flatMap((item) =>
        typeof item.content.primarySourceId === 'string' ? [item.content.primarySourceId] : [],
      );
      const sources = sourceIds.length
        ? tx.all<{
            id: string;
            kind: string;
            locator: string;
          }>(sql`SELECT s.id, s.kind, s.locator_json AS locator FROM sources s JOIN write_operations o ON o.project_id = s.project_id AND o.id = s.captured_by_operation_id
        WHERE s.project_id = ${projectId} AND o.result_content_version <= ${at} AND s.id IN (${ids([...new Set(sourceIds)])})`)
        : [];
      const sourcePaths = sources.map((source) => {
        const path: unknown = JSON.parse(source.locator).path;
        ensure(
          source.kind === 'code' && typeof path === 'string',
          'STORAGE_CORRUPT',
          '核心实现路径缺失。',
        );
        return { id: source.id, path };
      });
      ensure(
        new Set(sourcePaths.map((s) => s.id)).size === new Set(sourceIds).size,
        'STORAGE_CORRUPT',
        '核心实现来源缺失。',
      );
      const index = diagramIndex(tx, repository, projectId, at, String(project.name));
      return {
        project,
        diagram: index.find((item) => item.id === diagramId)!,
        bundle,
        sourcePaths,
        moduleDiagrams: index.filter(
          (item) =>
            item.scope.kind === 'module' &&
            (entityIds.includes(item.scope.moduleId) || ownerIds.has(item.scope.moduleId)),
        ),
        projectDiagrams: index.filter((item) => item.scope.kind === 'project'),
      };
    });
  }
}
