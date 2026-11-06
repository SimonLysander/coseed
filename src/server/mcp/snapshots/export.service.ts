import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import canonicalize from 'canonicalize';
import { z } from 'zod';
import { LRUCache } from 'lru-cache';
import type {
  HistoricalLink,
  ObjectType,
  ProjectSnapshot,
  StoredRevision,
} from '../../../contracts/project-content.js';
import { exportSnapshotInputSchema } from '../../../contracts/mcp.js';
import type { RuntimeConfig } from '../../config/schema.js';
import { ProjectContentService } from '../../modules/project-content/project-content.service.js';
import { ContentError } from '../../modules/project-content/errors.js';
import { fingerprint } from '../identity.js';

const identitySchema = z.strictObject({ id: z.uuid() });
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const directory = {
  project: 'project',
  overview: 'overview',
  requirement: 'requirements',
  record: 'records',
  retrospective: 'retrospectives',
  entity: 'design/entities',
  relationship: 'design/relationships',
  diagram: 'design/diagrams',
  note: 'design/notes',
} as const;
interface ExportFile {
  path: string;
  bytes: number;
  sha256: string;
  content: Buffer;
}
interface ExportBundle {
  files: ExportFile[];
  indexes: Map<string, number>;
  manifestSha256: string;
  totalBytes: number;
}

export function resolveDiagram(snapshot: ProjectSnapshot, id: string) {
  const diagram = snapshot.objects.find(
    (value) => value.objectType === 'diagram' && value.id === id,
  );
  if (!diagram) throw new ContentError('NOT_FOUND', '所读项目版本中没有此图。');
  const content = diagram.content as {
    scope: { kind: string; moduleId?: string };
    entityIds: string[];
    relationshipIds: string[];
    noteIds: string[];
  };
  const entityIds = new Set(content.entityIds);
  const relationshipIds = new Set(content.relationshipIds);
  const noteIds = new Set(content.noteIds);
  if (content.scope.moduleId) entityIds.add(content.scope.moduleId);
  const selected = snapshot.objects.filter(
    (value) =>
      (value.objectType === 'entity' && entityIds.has(value.id)) ||
      (value.objectType === 'relationship' && relationshipIds.has(value.id)) ||
      (value.objectType === 'note' && noteIds.has(value.id)),
  );
  return { projectId: snapshot.projectId, version: snapshot.version, diagram, objects: selected };
}

@Injectable()
export class SnapshotExportService implements OnModuleInit {
  private serviceId = '';
  private readonly cache = new LRUCache<string, ExportBundle>({
    max: 4,
    maxSize: 32 * 1024 * 1024,
    ttl: 15 * 60_000,
    sizeCalculation: (bundle) => Math.max(1, bundle.totalBytes),
  });

  constructor(
    @Inject(ProjectContentService) private readonly projects: ProjectContentService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const { dataDir } = this.config.getOrThrow<RuntimeConfig>('runtime');
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const target = join(dataDir, 'instance.json');
    const temporary = join(dataDir, `.instance-${randomUUID()}.tmp`);
    // A complete file is linked atomically: another process never reads a half-written identity.
    writeFileSync(temporary, JSON.stringify({ id: randomUUID() }), { flag: 'wx', mode: 0o600 });
    try {
      try {
        linkSync(temporary, target);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      }
    } finally {
      unlinkSync(temporary);
    }
    this.serviceId = identitySchema.parse(JSON.parse(readFileSync(target, 'utf8'))).id;
  }

  read(input: z.infer<typeof exportSnapshotInputSchema>) {
    const bundle = this.bundle(input.projectId, input.version);
    const base = {
      formatVersion: 1,
      serviceId: this.serviceId,
      projectId: input.projectId,
      version: input.version,
      manifestSha256: bundle.manifestSha256,
      totalFiles: bundle.files.length,
      totalBytes: bundle.totalBytes,
    };
    if (input.part.kind === 'manifest') {
      const { afterPath, limit } = input.part;
      if (afterPath !== undefined && !bundle.indexes.has(afterPath))
        throw new ContentError('INVALID_INPUT', '清单分页位置不属于此快照。');
      const offset = afterPath === undefined ? 0 : bundle.indexes.get(afterPath)! + 1;
      const files = bundle.files
        .slice(offset, offset + limit)
        .map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
      return {
        ...base,
        files,
        nextAfterPath: offset + limit < bundle.files.length ? files.at(-1)!.path : null,
      };
    }
    const { path, offset, maxBytes } = input.part;
    const position = bundle.indexes.get(path);
    const file = position === undefined ? undefined : bundle.files[position];
    if (!file) throw new ContentError('NOT_FOUND', '此快照清单中没有该文件。');
    if (offset > file.bytes) throw new ContentError('INVALID_INPUT', '文件偏移超过总字节数。');
    const bytes = file.content.subarray(offset, offset + maxBytes);
    const end = offset + bytes.byteLength;
    return {
      ...base,
      path,
      bytes: file.bytes,
      sha256: file.sha256,
      encoding: 'base64',
      offset,
      chunkBytes: bytes.byteLength,
      content: bytes.toString('base64'),
      nextOffset: end < file.bytes ? end : null,
    };
  }

  private bundle(projectId: string, version: number): ExportBundle {
    const key = fingerprint({ projectId, version });
    const found = this.cache.get(key);
    if (found) return found;
    const files = new Map<string, ExportFile>();
    const sourceIds = new Set<string>();
    const seenRevisions = new Set<string>();
    const seenContexts = new Set<string>();
    const seenDiagrams = new Set<string>();
    const queue: { value: StoredRevision; at: number }[] = [];
    const snapshots = new Map<number, ProjectSnapshot>();
    const snapshot = (at: number) => {
      if (!snapshots.has(at)) snapshots.set(at, this.projects.readSnapshot(projectId, at));
      return snapshots.get(at)!;
    };
    const put = (path: string, value: unknown) => {
      const content = Buffer.from(canonicalize(value)! + '\n');
      files.set(path, { path, bytes: content.byteLength, sha256: sha(content), content });
    };
    const enqueue = (value: StoredRevision, at = value.projectVersion) => {
      const identity = `${value.objectType}:${value.id}:${value.revisionNo}`;
      const context = `${identity}:${at}`;
      if (seenContexts.has(context)) return;
      seenContexts.add(context);
      queue.push({ value, at });
      if (!seenRevisions.has(identity)) {
        seenRevisions.add(identity);
        put(
          `history/${directory[value.objectType]}/${fingerprint(value.id)}/${value.revisionNo}.json`,
          value,
        );
      }
    };
    const current = snapshot(version);
    const atVersion = new Map<string, StoredRevision>();
    const atKey = (type: ObjectType, id: string, at: number) => fingerprint({ type, id, at });
    // Current reading files are complete revisions, including provenance and ordering metadata.
    for (const value of [current.project, ...current.objects]) {
      put(`current/${directory[value.objectType]}/${fingerprint(value.id)}.json`, value);
      seenRevisions.add(`${value.objectType}:${value.id}:${value.revisionNo}`);
      seenContexts.add(`${value.objectType}:${value.id}:${value.revisionNo}:${version}`);
      atVersion.set(atKey(value.objectType, value.id, version), value);
      queue.push({ value, at: version });
    }
    const referenced = (type: ObjectType, id: string, at: number) => {
      const key = atKey(type, id, at);
      if (!atVersion.has(key)) {
        const revision = this.projects.readHistory(projectId, type, id, {
          version: at,
          limit: 1,
        })[0];
        if (!revision) throw new ContentError('STORAGE_CORRUPT', '快照引用缺少可解析的对象。');
        atVersion.set(
          key,
          this.projects.readRevision(projectId, type, id, revision.revisionNo, at),
        );
      }
      enqueue(atVersion.get(key)!, at);
    };
    for (let index = 0; index < queue.length; index++) {
      const { value, at } = queue[index]!;
      for (const citation of value.citations) sourceIds.add(citation.sourceId);
      for (const id of value.inputSourceIds) sourceIds.add(id);
      for (const property of ['primarySourceId', 'typeSourceId']) {
        if (value.objectType === 'entity' && typeof value.content[property] === 'string')
          sourceIds.add(value.content[property] as string);
      }
      for (const record of value.statusChange?.records ?? [])
        enqueue(
          this.projects.readRevision(projectId, 'record', record.id, record.revisionNo, version),
        );
      const body = value.content;
      if (value.objectType === 'entity' && body.owner)
        referenced('entity', (body.owner as { id: string }).id, at);
      if (value.objectType === 'relationship') {
        referenced('entity', body.sourceId as string, at);
        referenced('entity', body.targetId as string, at);
      }
      if (value.objectType === 'note' || value.objectType === 'diagram') {
        for (const id of body.entityIds as string[]) referenced('entity', id, at);
      }
      if (value.objectType === 'diagram') {
        const scope = body.scope as { moduleId?: string };
        if (scope.moduleId) referenced('entity', scope.moduleId, at);
        for (const id of body.relationshipIds as string[]) referenced('relationship', id, at);
        for (const id of body.noteIds as string[]) referenced('note', id, at);
      }
      if (value.objectType === 'requirement') {
        for (const link of value.links)
          referenced(
            link.target.kind === 'overview' ? 'overview' : link.target.kind,
            'id' in link.target ? link.target.id : projectId,
            at,
          );
      }
      if (value.objectType !== 'record') continue;
      referenced('requirement', body.requirementId as string, at);
      for (const { target } of value.links as HistoricalLink[]) {
        if (target.kind !== 'diagram') {
          enqueue(
            this.projects.readRevision(
              projectId,
              target.kind,
              'id' in target ? target.id : projectId,
              target.revisionNo,
              version,
            ),
          );
          continue;
        }
        const identity = `${target.id}:${target.projectVersion}`;
        if (seenDiagrams.has(identity)) continue;
        seenDiagrams.add(identity);
        const resolved = resolveDiagram(snapshot(target.projectVersion), target.id);
        put(
          `history/diagram-views/${fingerprint(target.id)}/${target.projectVersion}.json`,
          resolved,
        );
        for (const member of [resolved.diagram, ...resolved.objects])
          enqueue(member, target.projectVersion);
      }
    }
    for (const source of this.projects.readSources(projectId, [...sourceIds], version))
      put(`sources/${fingerprint(source.id)}.json`, source);
    const ordered = [...files.values()].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
    const totalBytes = ordered.reduce((sum, file) => sum + file.bytes, 0);
    const manifestSha256 = fingerprint({
      formatVersion: 1,
      serviceId: this.serviceId,
      projectId,
      version,
      files: ordered.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    });
    const bundle = {
      files: ordered,
      indexes: new Map(ordered.map((file, index) => [file.path, index])),
      totalBytes,
      manifestSha256,
    };
    this.cache.set(key, bundle);
    return bundle;
  }
}
