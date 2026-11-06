import type { ContentChange, SaveProjectInput } from '../../contracts/project-content.js';
import type { SaveChangesInput } from '../../contracts/mcp.js';
import { ContentError } from '../modules/project-content/errors.js';
import { fingerprint, operationId } from './identity.js';

export function resolveChanges(input: SaveChangesInput): {
  input: SaveProjectInput;
  allocations: { localRef: string; id: string; kind: string }[];
} {
  const result = structuredClone(input);
  const op = operationId('save_changes', input.requestKey, input.projectId);
  const allocated = new Map<string, { id: string; kind: string }>();
  const allocate = (ref: string, kind: string) => {
    if (!/^\$[\p{L}\p{N}_.-]{1,100}$/u.test(ref) || allocated.has(ref))
      throw new ContentError('INVALID_INPUT', '新增对象和来源的 $临时名称必须合法且在本批唯一。');
    allocated.set(ref, { id: `ref-${fingerprint({ op, ref, kind })}`, kind });
  };
  for (const source of result.sources) {
    allocate(source.id, 'source');
  }
  for (const change of result.changes) {
    if (
      change.action === 'upsert' &&
      change.expectedRevision === null &&
      !['project', 'overview'].includes(change.objectType)
    ) {
      allocate(change.id, change.objectType);
    } else if (change.id.startsWith('$')) {
      throw new ContentError(
        'INVALID_INPUT',
        '已有对象必须使用读取到的正式 ID；综述 ID 是项目 ID。',
      );
    }
  }
  const ref = (value: string, kind: string): string => {
    if (!value.startsWith('$')) return value;
    const found = allocated.get(value);
    if (!found || found.kind !== kind)
      throw new ContentError('INVALID_REFERENCE', `本批引用 ${value} 未定义或对象类型不匹配。`);
    return found.id;
  };
  for (const source of result.sources) source.id = ref(source.id, 'source');
  for (const change of result.changes) {
    change.id = ref(change.id, change.objectType);
    for (const citation of change.citations) citation.sourceId = ref(citation.sourceId, 'source');
    if ('statusChange' in change)
      for (const record of change.statusChange?.records ?? []) record.id = ref(record.id, 'record');
    if (change.action !== 'upsert') continue;
    if (change.objectType === 'record')
      change.content.requirementId = ref(change.content.requirementId, 'requirement');
    if (change.objectType === 'entity') {
      const value = change.content;
      if ('owner' in value) value.owner.id = ref(value.owner.id, 'entity');
      if ('primarySourceId' in value && value.primarySourceId)
        value.primarySourceId = ref(value.primarySourceId, 'source');
      if ('typeSourceId' in value && value.typeSourceId)
        value.typeSourceId = ref(value.typeSourceId, 'source');
    }
    if (change.objectType === 'relationship') {
      change.content.sourceId = ref(change.content.sourceId, 'entity');
      change.content.targetId = ref(change.content.targetId, 'entity');
    }
    if (change.objectType === 'diagram') {
      if (change.content.scope.kind === 'module')
        change.content.scope.moduleId = ref(change.content.scope.moduleId, 'entity');
      change.content.entityIds = change.content.entityIds.map((id) => ref(id, 'entity'));
      change.content.relationshipIds = change.content.relationshipIds.map((id) =>
        ref(id, 'relationship'),
      );
      change.content.noteIds = change.content.noteIds.map((id) => ref(id, 'note'));
    }
    if (change.objectType === 'note')
      change.content.entityIds = change.content.entityIds.map((id) => ref(id, 'entity'));
    if (change.objectType === 'retrospective')
      change.inputSourceIds = change.inputSourceIds?.map((id) => ref(id, 'source'));
    if (change.objectType === 'requirement' || change.objectType === 'record') {
      for (const link of change.links ?? []) {
        if ('id' in link.target) link.target.id = ref(link.target.id, link.target.kind);
      }
    }
  }
  return {
    input: {
      projectId: input.projectId,
      operationId: op,
      baseVersion: input.baseVersion,
      sources: result.sources,
      changes: result.changes as ContentChange[],
      retrospectiveId: result.retrospectiveId ? ref(result.retrospectiveId, 'retrospective') : null,
      noteMd: result.noteMd,
    },
    allocations: [...allocated].map(([localRef, value]) => ({ localRef, ...value })),
  };
}
