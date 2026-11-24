import type { ProjectContentService } from '../../modules/project-content/project-content.service.js';
import { ContentError } from '../../modules/project-content/errors.js';
import type { HistoryTarget, RevisionTarget } from '../../../contracts/mcp.js';
import type { StoredSource, StoredRevision } from '../../../contracts/project-content.js';
import { resolveDiagram } from '../snapshots/export.service.js';
import { textChunk } from './chunks.js';

export function historyPage(
  projects: ProjectContentService,
  projectId: string,
  version: number,
  target: HistoryTarget,
  requireExists = false,
) {
  const { objectType, id, beforeRevision, limit } = target;
  const rows = projects.readHistory(projectId, objectType, id, {
    version,
    limit: limit + 1,
    ...(beforeRevision === undefined ? {} : { beforeRevision }),
  });
  if (
    requireExists &&
    !rows.length &&
    (beforeRevision === undefined ||
      projects.readHistory(projectId, objectType, id, { version, limit: 1 }).length === 0)
  )
    throw new ContentError('NOT_FOUND', '该版本没有此对象的修订。');
  const items = rows.slice(0, limit);
  return {
    projectId,
    version,
    objectType,
    id,
    items,
    nextBeforeRevision: rows.length > limit ? items.at(-1)!.revisionNo : null,
  };
}
export function historicalContent(
  projects: ProjectContentService,
  projectId: string,
  version: number,
  target: RevisionTarget,
) {
  let values: StoredRevision[];
  let result: Record<string, unknown>;
  if (target.kind === 'diagram') {
    const graph = resolveDiagram(projects.readSnapshot(projectId, version), target.id);
    result = graph;
    values = [graph.diagram, ...graph.objects];
  } else {
    const revision = projects.readRevision(
      projectId,
      target.objectType,
      target.id,
      target.revisionNo,
      version,
    );
    result = { projectId, version, revision };
    values = [revision];
  }
  const ids = new Set<string>();
  for (const row of values) {
    for (const citation of row.citations) ids.add(citation.sourceId);
    for (const id of row.inputSourceIds) ids.add(id);
    if (row.objectType === 'entity')
      for (const key of ['primarySourceId', 'typeSourceId'])
        if (typeof row.content[key] === 'string') ids.add(row.content[key] as string);
  }
  return { ...result, sources: projects.readSources(projectId, [...ids], version) };
}

export function historyBatch<T extends { offset: number }>(
  targets: T[],
  budget: number,
  read: (target: T) => Record<string, unknown>,
) {
  let remaining = budget;
  const materials = new Map<string, StoredSource>();
  const items = targets.map((target) => {
    try {
      const value = read(target);
      if (target.offset === 0 && Array.isArray(value.sources)) {
        const { sources, ...rest } = value;
        const refs = sources as StoredSource[];
        const missing = refs.filter((item) => !materials.has(item.id));
        const compact = { ...rest, sourceIds: refs.map((item) => item.id) };
        const size =
          Buffer.byteLength(JSON.stringify(compact)) +
          missing.reduce((total, source) => total + Buffer.byteLength(JSON.stringify(source)), 0);
        if (size <= remaining) {
          remaining -= size;
          for (const source of missing) materials.set(source.id, source);
          return { target, value: compact, nextOffset: null };
        }
      }
      const chunk = textChunk(JSON.stringify(value), target.offset, remaining);
      remaining -= chunk.chunkBytes;
      return target.offset === 0 && chunk.nextOffset === null
        ? { target, value, nextOffset: null }
        : { target, ...chunk };
    } catch (error) {
      if (error instanceof ContentError)
        return { target, error: { code: error.code, message: error.message } };
      throw error;
    }
  });
  return { items, ...(materials.size ? { sources: [...materials.values()] } : {}) };
}
