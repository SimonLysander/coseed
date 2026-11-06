import { businessDesignBundleSchema } from '../../../../contracts/content/business-design.js';
import type {
  CurrentLink,
  HistoricalLink,
  OverviewPart,
  ProjectSnapshot,
  StoredRevision,
  StoredSource,
} from '../../../../contracts/project-content.js';
import { ensure } from '../errors.js';
import { objectKey } from '../persistence/definitions.js';
import type { SnapshotRepository } from '../persistence/snapshots.js';
import type { PendingOperation } from '../persistence/sources.js';
import { json } from '../persistence/sql.js';

function overviewPartExists(revision: StoredRevision, part: OverviewPart): boolean {
  const content = revision.content;
  const concepts = content.concepts as { entries: { id: string }[]; relations: { id: string }[] };
  const examples = content.examples as {
    introductionMd: string | null;
    actors: { id: string }[];
    useCases: { id: string }[];
    sections: { id: string; diagram: { id: string } }[];
  };
  switch (part.kind) {
    case 'product':
      return true;
    case 'examples_introduction':
      return examples.introductionMd !== null;
    case 'concept':
      return concepts.entries.some((value) => value.id === part.id);
    case 'concept_relation':
      return concepts.relations.some((value) => value.id === part.id);
    case 'actor':
      return examples.actors.some((value) => value.id === part.id);
    case 'use_case':
      return examples.useCases.some((value) => value.id === part.id);
    case 'example':
      return examples.sections.some((value) => value.id === part.id);
    case 'example_diagram':
      return examples.sections.some((value) => value.diagram.id === part.id);
  }
}

export function validateCandidate(
  repository: SnapshotRepository,
  snapshot: ProjectSnapshot,
  pending: PendingOperation,
  sources: StoredSource[],
): void {
  const index = new Map(
    snapshot.objects.map((value) => [objectKey(value.objectType, value.id), value]),
  );
  const materials = new Map(sources.map((value) => [value.id, value]));
  const bundle = (type: StoredRevision['objectType']) =>
    snapshot.objects
      .filter((value) => value.objectType === type)
      .map((value) => ({ id: value.id, revisionNo: value.revisionNo, content: value.content }));
  const result = businessDesignBundleSchema.safeParse({
    schemaVersion: 2,
    projectVersion: snapshot.version,
    entities: bundle('entity'),
    relationships: bundle('relationship'),
    notes: bundle('note'),
    diagrams: bundle('diagram'),
  });
  ensure(
    result.success,
    'INVALID_REFERENCE',
    result.success
      ? ''
      : `业务设计不完整：${result.error.issues.map((issue) => issue.message).join('；')}`,
  );
  const historical = new Map<string, StoredRevision>();
  const revision = (type: StoredRevision['objectType'], id: string, revisionNo: number) => {
    const key = json([type, id, revisionNo]);
    let value = historical.get(key);
    if (!value) {
      value = repository.revision(
        snapshot.projectId,
        type,
        id,
        revisionNo,
        snapshot.version,
        pending,
      );
      historical.set(key, value);
    }
    ensure(!value.isDeleted, 'INVALID_REFERENCE', '历史引用不能指向移除标记。');
    return value;
  };
  const diagrams = new Map<number, ProjectSnapshot>([[snapshot.version, snapshot]]);
  for (const value of snapshot.objects) {
    if (value.objectType === 'record')
      ensure(
        index.has(objectKey('requirement', value.content.requirementId as string)),
        'INVALID_REFERENCE',
        '推进记录必须归属当前有效的需求。',
      );
    if (value.objectType === 'retrospective') {
      ensure(
        value.inputSourceIds.length > 0 &&
          new Set(value.inputSourceIds).size === value.inputSourceIds.length,
        'INVALID_REFERENCE',
        '回顾需要明确且不重复的原始材料。',
      );
      for (const id of value.inputSourceIds)
        ensure(materials.has(id), 'INVALID_REFERENCE', '回顾材料不存在。');
    }
    if (value.objectType === 'entity') {
      for (const field of ['primarySourceId', 'typeSourceId']) {
        const id = value.content[field];
        if (typeof id !== 'string') continue;
        const source = materials.get(id);
        ensure(
          source && value.citations.some((citation) => citation.sourceId === id),
          'INVALID_REFERENCE',
          '目录或类型来源须同时是该修订的已引用材料。',
        );
        if (field === 'primarySourceId') {
          const path = source.locator.path;
          ensure(
            source.kind === 'code' &&
              typeof path === 'string' &&
              path.length > 0 &&
              !path.startsWith('/') &&
              !/^[a-zA-Z]:/.test(path) &&
              !path.includes('\\') &&
              !path.split('/').some((part) => part === '..' || part === '.' || part === ''),
            'INVALID_REFERENCE',
            '核心目录来源使用代码材料及仓库相对路径。',
          );
        }
      }
    }
    const seen = new Set<string>();
    for (const link of value.links) {
      const key = json(link.target);
      ensure(!seen.has(key), 'INVALID_REFERENCE', '同一对象的关联目标重复。');
      seen.add(key);
      if (value.objectType === 'requirement') {
        const target = (link as CurrentLink).target;
        const resolved = index.get(
          objectKey(target.kind, target.kind === 'overview' ? snapshot.projectId : target.id),
        );
        ensure(
          resolved && (target.kind !== 'overview' || overviewPartExists(resolved, target.part)),
          'INVALID_REFERENCE',
          '需求关联的当前内容不存在。',
        );
      } else if (value.objectType === 'record') {
        const target = (link as HistoricalLink).target;
        if (target.kind === 'diagram') {
          ensure(
            target.projectVersion <= snapshot.version,
            'INVALID_REFERENCE',
            '不能关联未来的图快照。',
          );
          let view = diagrams.get(target.projectVersion);
          if (!view) {
            view = repository.snapshot(snapshot.projectId, target.projectVersion, undefined, false);
            diagrams.set(target.projectVersion, view);
          }
          ensure(
            view.objects.some(
              (object) => object.objectType === 'diagram' && object.id === target.id,
            ),
            'INVALID_REFERENCE',
            '历史项目快照中不存在所引用的图。',
          );
        } else {
          const resolved = revision(
            target.kind,
            target.kind === 'overview' ? snapshot.projectId : target.id,
            target.revisionNo,
          );
          ensure(
            target.kind !== 'overview' || overviewPartExists(resolved, target.part),
            'INVALID_REFERENCE',
            '历史综述中的关联部分不存在。',
          );
        }
      }
    }
    if (value.objectType === 'requirement' && value.statusChange) {
      const basis = value.statusChange.records;
      ensure(
        value.statusChange.kind !== 'progress' || basis.length > 0,
        'MISSING_EVIDENCE',
        '需求因推进而变更状态，须关联具体推进记录。',
      );
      ensure(
        new Set(basis.map((record) => json(record))).size === basis.length,
        'INVALID_REFERENCE',
        '状态变化的记录依据重复。',
      );
      for (const record of basis)
        ensure(
          revision('record', record.id, record.revisionNo).content.requirementId === value.id,
          'INVALID_REFERENCE',
          '状态依据必须是该需求的历史推进记录。',
        );
    }
  }
}
