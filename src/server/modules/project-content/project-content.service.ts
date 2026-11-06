import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  createProjectInputSchema,
  objectTypeSchema,
  saveProjectInputSchema,
  writeContextSchema,
  type ObjectType,
  type OperationReceipt,
  type StoredRevision,
} from '../../../contracts/project-content.js';
import { DatabaseService } from '../../database/database.service.js';
import { ContentError, ensure } from './errors.js';
import { definitions } from './persistence/definitions.js';
import {
  checkObjectHeads,
  ensureIdentity,
  moveObjectHead,
  normalizeContent,
  writeRevision,
  writeRevisionChildren,
} from './persistence/revisions.js';
import { SnapshotRepository } from './persistence/snapshots.js';
import { readSources, saveSources } from './persistence/sources.js';
import { digestText, insert, json, type QueryConnection } from './persistence/sql.js';
import { validateCandidate } from './validation/candidate.js';
import { validateEvidence } from './validation/evidence.js';
import { planChanges } from './validation/planning.js';

const identifier = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value);
const number = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const revisionNumber = number.refine((value) => value > 0);
const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ContentError(
      'INVALID_INPUT',
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；'),
      { cause: result.error },
    );
  return result.data;
}

function operationRow(connection: QueryConnection, id: string) {
  return connection.get<{ project_id: string; request_hash: string }>(
    sql`SELECT project_id, request_hash FROM write_operations WHERE id = ${id}`,
  );
}

function transactionError(error: unknown): never {
  if (error instanceof ContentError) throw error;
  let cause = error;
  for (let depth = 0; depth < 6 && cause && typeof cause === 'object'; depth++) {
    const code = 'code' in cause ? cause.code : null;
    if (
      typeof code === 'string' &&
      (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED'))
    )
      throw new ContentError('STORAGE_BUSY', '数据库忙碌，本次未保存。', {
        cause: error,
      });
    if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT'))
      throw new ContentError(
        'INVALID_REFERENCE',
        '保存违反对象归属、引用或修订约束；本批修改已回滚。',
        { cause: error },
      );
    cause = 'cause' in cause ? cause.cause : null;
  }
  throw error;
}

@Injectable()
export class ProjectContentService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  createProject(rawInput: unknown, rawContext: unknown): OperationReceipt {
    const input = parse(createProjectInputSchema, rawInput);
    const context = parse(writeContextSchema, rawContext);
    const hash = digestText(json({ kind: 'create_project', input }));
    try {
      return this.database.db.transaction(
        (tx) => {
          const repository = new SnapshotRepository(tx);
          const existing = operationRow(tx, input.operationId);
          if (existing) {
            ensure(
              existing.request_hash === hash,
              'OPERATION_MISMATCH',
              '操作 ID 已用于不同的请求。',
            );
            return repository.operation(existing.project_id, input.operationId)!;
          }
          const projectId = randomUUID();
          const sourceId = randomUUID();
          const savedAt = Date.now();
          insert(tx, 'projects', {
            id: projectId,
            current_revision_no: 1,
            current_content_version: 0,
            created_at: savedAt,
          });
          insert(tx, 'project_overviews', { project_id: projectId, current_revision_no: null });
          saveSources(tx, projectId, input.operationId, [
            {
              id: sourceId,
              kind: context.entrypoint === 'web' ? 'manual_edit' : 'document',
              rawText: json(input),
              locator: { kind: 'project_creation', operationId: input.operationId },
              occurredAt: null,
            },
          ]);
          const value: StoredRevision = {
            objectType: 'project',
            id: projectId,
            revisionNo: 1,
            operationId: input.operationId,
            projectVersion: 0,
            savedAt,
            createdAt: savedAt,
            isDeleted: false,
            content: { name: input.name, repositoryLocator: input.repositoryLocator },
            citations: [
              {
                sourceId,
                side: 'after',
                path: '',
                explanationMd: '保存本次创建请求中实际提供的项目资料。',
              },
            ],
            links: [],
            inputSourceIds: [],
            statusChange: null,
            captureOrdinal: null,
            captureVersion: null,
          };
          writeRevision(tx, projectId, value);
          writeRevisionChildren(tx, projectId, value);
          insert(tx, 'write_operations', {
            id: input.operationId,
            project_id: projectId,
            base_content_version: null,
            request_hash: hash,
            entrypoint: context.entrypoint,
            actor_kind: context.actorKind,
            actor_label: context.actorLabel,
            client_metadata_json: json(context.clientMetadata),
            note_md: null,
            saved_at: savedAt,
          });
          checkObjectHeads(tx, projectId);
          return repository.operation(projectId, input.operationId)!;
        },
        { behavior: 'immediate' },
      );
    } catch (error) {
      transactionError(error);
    }
  }

  save(rawInput: unknown, rawContext: unknown): OperationReceipt {
    const input = parse(saveProjectInputSchema, rawInput);
    const context = parse(writeContextSchema, rawContext);
    // Sets are canonicalized, while change order (record capture order) and raw material stay intact.
    input.sources.sort((a, b) => compare(a.id, b.id));
    for (const change of input.changes) {
      change.citations.sort((a, b) => compare(json(a), json(b)));
      if (change.action === 'upsert')
        change.content = normalizeContent(
          change.objectType,
          change.content,
        ) as typeof change.content;
      if ('inputSourceIds' in change) change.inputSourceIds?.sort(compare);
      if ('statusChange' in change)
        change.statusChange?.records.sort((a, b) => compare(json(a), json(b)));
    }
    const hash = digestText(json({ kind: 'save_project', input }));
    try {
      return this.database.db.transaction(
        (tx) => {
          const repository = new SnapshotRepository(tx);
          const existing = operationRow(tx, input.operationId);
          if (existing) {
            ensure(
              existing.project_id === input.projectId && existing.request_hash === hash,
              'OPERATION_MISMATCH',
              '操作 ID 已用于不同的请求或项目。',
            );
            return repository.operation(input.projectId, input.operationId)!;
          }
          ensure(
            input.baseVersion < Number.MAX_SAFE_INTEGER,
            'INVALID_INPUT',
            '项目版本已达到可表示上限，不能继续递增。',
          );
          ensure(
            repository.head(input.projectId) === input.baseVersion,
            'CONFLICT',
            '读取基准与项目当前版本不一致。',
          );
          const pending = {
            id: input.operationId,
            version: input.baseVersion + 1,
            savedAt: Date.now(),
          };
          const plans = planChanges(repository, input, pending);
          ensure(plans.length > 0, 'NO_CHANGES', '没有实际内容或来源变化，本次未产生新版本。');
          saveSources(tx, input.projectId, input.operationId, input.sources);
          for (const plan of plans) ensureIdentity(tx, input.projectId, plan.after);
          for (const plan of plans) writeRevision(tx, input.projectId, plan.after);
          for (const plan of plans) {
            validateEvidence(plan);
            writeRevisionChildren(tx, input.projectId, plan.after);
          }
          for (const plan of plans) moveObjectHead(tx, input.projectId, plan.after, plan.before);
          const candidate = repository.snapshot(input.projectId, pending.version, pending, false);
          const ids = new Set<string>();
          for (const value of [
            candidate.project,
            ...candidate.objects,
            ...plans.map((plan) => plan.after),
          ]) {
            for (const citation of value.citations) ids.add(citation.sourceId);
            for (const id of value.inputSourceIds) ids.add(id);
            if (value.objectType === 'entity')
              for (const field of ['primarySourceId', 'typeSourceId'])
                if (typeof value.content[field] === 'string')
                  ids.add(value.content[field] as string);
          }
          const sources = readSources(tx, input.projectId, [...ids], pending.version, pending);
          validateCandidate(repository, candidate, pending, sources);
          if (input.retrospectiveId !== null) {
            ensure(
              candidate.objects.some(
                (value) =>
                  value.objectType === 'retrospective' && value.id === input.retrospectiveId,
              ),
              'INVALID_REFERENCE',
              '操作归属的回顾不存在或已移除。',
            );
            insert(tx, 'retrospective_operations', {
              project_id: input.projectId,
              operation_id: input.operationId,
              retrospective_id: input.retrospectiveId,
            });
          }
          checkObjectHeads(tx, input.projectId);
          // The operation is inserted last: its existence seals every child collection.
          insert(tx, 'write_operations', {
            id: input.operationId,
            project_id: input.projectId,
            base_content_version: input.baseVersion,
            request_hash: hash,
            entrypoint: context.entrypoint,
            actor_kind: context.actorKind,
            actor_label: context.actorLabel,
            client_metadata_json: json(context.clientMetadata),
            note_md: input.noteMd,
            saved_at: pending.savedAt,
          });
          const result = tx.run(
            sql`UPDATE projects SET current_content_version = ${pending.version} WHERE id = ${input.projectId} AND current_content_version = ${input.baseVersion}`,
          );
          ensure(result.changes === 1, 'CONFLICT', '项目版本已变化，本次修改未保存。');
          ensure(
            repository.head(input.projectId) ===
              tx.get<{ version: number }>(
                sql`SELECT max(result_content_version) AS version FROM write_operations WHERE project_id = ${input.projectId}`,
              )?.version,
            'STORAGE_CORRUPT',
            '项目版本指针不一致。',
          );
          return repository.operation(input.projectId, input.operationId)!;
        },
        { behavior: 'immediate' },
      );
    } catch (error) {
      transactionError(error);
    }
  }

  listProjects(options: { name?: string; afterId?: string; limit?: number } = {}) {
    const settings = parse(
      z.strictObject({
        name: z.string().optional(),
        afterId: identifier.optional(),
        limit: z.number().int().min(1).max(101).optional(),
      }),
      options,
    );
    return this.database.db.all<{
      id: string;
      name: string;
      version: number;
      createdAt: number;
    }>(sql`SELECT p.id, r.name, p.current_content_version AS version, p.created_at AS createdAt
      FROM projects p JOIN project_revisions r ON r.project_id = p.id AND r.revision_no = p.current_revision_no
      WHERE 1 = 1 ${settings.name === undefined ? sql`` : sql`AND instr(lower(r.name), lower(${settings.name})) > 0`}
      ${settings.afterId === undefined ? sql`` : sql`AND p.id > ${settings.afterId}`}
      ORDER BY p.id ${settings.limit === undefined ? sql`` : sql`LIMIT ${settings.limit}`}`);
  }

  readProject(projectId: string) {
    parse(identifier, projectId);
    return this.database.db.transaction((tx) => {
      const repository = new SnapshotRepository(tx);
      const version = repository.head(projectId);
      const project = repository.readType('project', { projectId, version, id: projectId })[0]!;
      const operation = tx.get<{ id: string }>(
        sql`SELECT id FROM write_operations WHERE project_id = ${projectId} AND result_content_version = ${version}`,
      )!;
      return { projectId, version, project, operationId: operation.id };
    });
  }

  findOperation(operationId: string): OperationReceipt | null {
    parse(identifier, operationId);
    return this.database.db.transaction((tx) => {
      const row = operationRow(tx, operationId);
      return row ? new SnapshotRepository(tx).operation(row.project_id, operationId) : null;
    });
  }

  readSnapshot(projectId: string, version?: number) {
    parse(identifier, projectId);
    if (version !== undefined) parse(number, version);
    return this.database.db.transaction((tx) =>
      new SnapshotRepository(tx).snapshot(projectId, version),
    );
  }

  readRevision(
    projectId: string,
    type: ObjectType,
    id: string,
    revisionNo: number,
    version?: number,
  ) {
    parse(identifier, projectId);
    parse(objectTypeSchema, type);
    parse(identifier, id);
    parse(revisionNumber, revisionNo);
    if (version !== undefined) parse(number, version);
    return this.database.db.transaction((tx) => {
      const repository = new SnapshotRepository(tx);
      const target = version ?? repository.head(projectId);
      repository.requireVersion(projectId, target);
      return repository.revision(projectId, type, id, revisionNo, target);
    });
  }

  readSources(projectId: string, ids: string[], version?: number) {
    parse(identifier, projectId);
    parse(z.array(identifier), ids);
    if (version !== undefined) parse(number, version);
    return this.database.db.transaction((tx) => {
      const repository = new SnapshotRepository(tx);
      const target = version ?? repository.head(projectId);
      repository.requireVersion(projectId, target);
      return readSources(tx, projectId, ids, target);
    });
  }

  readHistory(
    projectId: string,
    type: ObjectType,
    id: string,
    options: { beforeRevision?: number; limit?: number; version?: number } = {},
  ) {
    parse(identifier, projectId);
    parse(objectTypeSchema, type);
    parse(identifier, id);
    const settings = parse(
      z.strictObject({
        beforeRevision: revisionNumber.optional(),
        limit: z.number().int().min(1).max(200).default(50),
        version: number.optional(),
      }),
      options,
    );
    return this.database.db.transaction((tx) => {
      const repository = new SnapshotRepository(tx);
      const version = settings.version ?? repository.head(projectId);
      repository.requireVersion(projectId, version);
      const d = definitions[type];
      return tx
        .all<{
          revisionNo: number;
          projectVersion: number;
          savedAt: number;
          operationId: string;
          isDeleted: number;
        }>(
          sql`SELECT r.revision_no AS revisionNo,
        o.result_content_version AS projectVersion, o.saved_at AS savedAt, r.operation_id AS operationId, ${d.removable ? sql`r.is_deleted` : sql`0`} AS isDeleted
        FROM ${sql.identifier(d.revisions)} r JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
        WHERE r.project_id = ${projectId} AND r.${sql.identifier(d.key)} = ${id} AND o.result_content_version <= ${version}
        ${settings.beforeRevision === undefined ? sql`` : sql`AND r.revision_no < ${settings.beforeRevision}`}
        ORDER BY r.revision_no DESC LIMIT ${settings.limit}`,
        )
        .map((value) => ({ ...value, isDeleted: value.isDeleted === 1 }));
    });
  }

  getOperation(projectId: string, operationId: string): OperationReceipt {
    parse(identifier, projectId);
    parse(identifier, operationId);
    return this.database.db.transaction((tx) => {
      const receipt = new SnapshotRepository(tx).operation(projectId, operationId);
      ensure(receipt, 'NOT_FOUND', '保存操作不存在或不属于项目。');
      return receipt;
    });
  }
}
