import { isDeepStrictEqual } from 'node:util';
import type { z } from 'zod';
import type { ProjectOverviewContent } from '../../../../contracts/content/overview.js';
import type { designDiagramContentSchema } from '../../../../contracts/content/business-design.js';
import type { ObjectType, ProjectSnapshot } from '../../../../contracts/project-content.js';
import type { PlannedRevision } from '../persistence/revisions.js';
import { objectKey } from '../persistence/definitions.js';
import { ObjectValidationError, type ContentIssue } from '../errors.js';

type Diagram = z.infer<typeof designDiagramContentSchema>;
function diagrams(snapshot: ProjectSnapshot) {
  return new Map(
    snapshot.objects
      .filter((row) => row.objectType === 'diagram')
      .map((row) => [row.id, row.content as Diagram]),
  );
}
export function authoringState(snapshot: ProjectSnapshot) {
  const overview = snapshot.objects.find((row) => row.objectType === 'overview')?.content as
    ProjectOverviewContent | undefined;
  const allModules = new Set(
    snapshot.objects
      .filter((row) => row.objectType === 'entity' && row.content.kind === 'module')
      .map((row) => row.id),
  );
  const graphs = diagrams(snapshot);
  const moduleIds = new Set(
    [...graphs.values()]
      .filter((g) => g.scope.kind === 'project')
      .flatMap((g) => g.entityIds.filter((id) => allModules.has(id))),
  );
  return {
    overview,
    graphs,
    moduleIds,
    conditions: {
      product: !!overview,
      systemDiagram: !!overview?.systemDiagram?.introductionMd,
      panorama: moduleIds.size > 0,
    },
  };
}

export function validateAuthoringOrder(
  base: ProjectSnapshot,
  candidate: ProjectSnapshot,
  plans: PlannedRevision[],
) {
  const { overview, graphs, moduleIds, conditions } = authoringState(base);
  const nextState = authoringState(candidate);
  const nextGraphs = nextState.graphs;
  const active = new Map(candidate.objects.map((row) => [objectKey(row.objectType, row.id), row]));
  const original = new Map(base.objects.map((row) => [objectKey(row.objectType, row.id), row]));
  const issues: ContentIssue[] = [];
  const issue = (objectType: ObjectType, id: string, field: string, requires: string) =>
    issues.push({ objectType, id, field, requires });
  const missingOverview = conditions.product
    ? '先一起保存工作方式导读与系统架构概览图。'
    : '先单独保存产品说明正文。';
  if (conditions.product && !nextState.conditions.product && candidate.objects.length)
    issue(
      'overview',
      base.projectId,
      'product',
      '移除产品说明时须一并处理仍依赖该说明的项目资料。',
    );
  if (
    conditions.panorama &&
    !nextState.conditions.panorama &&
    candidate.objects.some((row) => row.objectType === 'requirement')
  ) {
    const removed = [...graphs].find(
      ([id, g]) => g.scope.kind === 'project' && !nextGraphs.has(id),
    );
    const changed = plans.find((p) => p.after.objectType === 'diagram');
    issue(
      'diagram',
      removed?.[0] ?? changed?.after.id ?? base.projectId,
      'entityIds',
      '仍有需求使用当前全景，须保留至少一个已保存的业务模块。',
    );
  }
  for (const { before, after } of plans) {
    const { objectType: type, id, content } = after;
    if (after.isDeleted || type === 'project') continue;
    const added = !before || before.isDeleted;
    if (type === 'overview') {
      const next = content as ProjectOverviewContent;
      if (overview?.systemDiagram && !next.systemDiagram)
        issue(
          type,
          id,
          'systemDiagram',
          '产品说明已有必备的系统架构概览图，保存的综述须保留该图。',
        );
      if (
        next.systemDiagram &&
        !next.systemDiagram.introductionMd &&
        !isDeepStrictEqual(next.systemDiagram, overview?.systemDiagram)
      )
        issue(type, id, 'systemDiagram.introductionMd', '保存概览图时须同时提供工作方式导读。');
      if (!conditions.systemDiagram) {
        if (
          next.systemDiagram?.introductionMd &&
          next.product.markdown !== overview?.product.markdown
        )
          issue(type, id, 'systemDiagram', '首次提交概览图须以单独保存的产品说明正文为依据。');
        if (next.concepts.entries.length && !isDeepStrictEqual(next.concepts, overview?.concepts))
          issue(type, id, 'concepts', missingOverview);
        if (next.examples.introductionMd && !isDeepStrictEqual(next.examples, overview?.examples))
          issue(type, id, 'examples', missingOverview);
      }
      const concepts = new Set(overview?.concepts.entries.map((entry) => entry.id));
      for (const rel of next.concepts.relations) {
        const old = overview?.concepts.relations.find((item) => item.id === rel.id);
        if (
          (old?.source !== rel.source || old.target !== rel.target) &&
          !(concepts.has(rel.source) && concepts.has(rel.target))
        )
          issue(type, id, 'concepts.relations.' + rel.id, '先保存该关系两端的核心概念。');
      }
      if (
        next.examples.sections.some(
          (section) => !overview?.examples.sections.some((old) => old.id === section.id),
        ) &&
        !overview?.examples.introductionMd
      )
        issue(type, id, 'examples.sections', '先保存使用示例的开篇背景。');
      continue;
    }
    if (!conditions.systemDiagram) issue(type, id, '', missingOverview);
    if (type === 'requirement') {
      const scope = content.scope as { kind: string; moduleIds?: string[] } | undefined;
      if (added && !conditions.panorama)
        issue(type, id, 'scope', '先保存至少包含一个业务模块的全景图。');
      if (
        scope?.kind === 'modules' &&
        (added || JSON.stringify(scope) !== JSON.stringify(before?.content.scope)) &&
        scope.moduleIds?.some((module) => !moduleIds.has(module))
      )
        issue(type, id, 'scope.moduleIds', '先将涉及范围中的模块保存到全景图。');
    }
    if (
      type === 'record' &&
      (added || before?.content.requirementId !== content.requirementId) &&
      !original.has(objectKey('requirement', String(content.requirementId)))
    )
      issue(type, id, 'requirementId', '先保存这条记录所属的需求。');
    if (!added) continue;
    if (type === 'entity' || type === 'relationship' || type === 'note') {
      const memberKey =
        type === 'entity' ? 'entityIds' : type === 'relationship' ? 'relationshipIds' : 'noteIds';
      if (![...nextGraphs.values()].some((graph) => graph[memberKey].includes(id)))
        issue(type, id, '', '将新增对象选入对应的业务图。');
    }
  }
  for (const [diagramId, next] of nextGraphs) {
    const old = graphs.get(diagramId);
    if (
      next.scope.kind === 'module' &&
      moduleIds.has(next.scope.moduleId) &&
      !nextState.moduleIds.has(next.scope.moduleId)
    )
      issue(
        'diagram',
        diagramId,
        'scope.moduleId',
        '模块内部图仍属于该模块，须保留该模块的全景归属。',
      );
    if (
      next.scope.kind === 'project' &&
      !old &&
      !next.entityIds.some((id) => active.get(objectKey('entity', id))?.content.kind === 'module')
    )
      issue('diagram', diagramId, 'entityIds', '首版全景图至少需要一个业务模块。');
    if (
      next.scope.kind === 'module' &&
      (old?.scope.kind !== 'module' || old.scope.moduleId !== next.scope.moduleId) &&
      !moduleIds.has(next.scope.moduleId)
    )
      issue('diagram', diagramId, 'scope.moduleId', '先在全景图中保存这个模块。');
    const priorNodes = new Set(old?.entityIds);
    const check = (
      type: 'note' | 'relationship',
      id: string,
      ids: string[],
      field: string,
      wasMember: boolean,
    ) => {
      const previous = original.get(objectKey(type, id))?.content;
      const previousIds =
        type === 'note' ? previous?.entityIds : [previous?.sourceId, previous?.targetId];
      if (wasMember && JSON.stringify(ids) === JSON.stringify(previousIds)) return;
      if (ids.some((node) => !priorNodes.has(node)))
        issue(type, id, field, '先将此关系或说明涉及的节点保存到目标图 ' + diagramId + '。');
    };
    for (const id of next.relationshipIds) {
      const edge = active.get(objectKey('relationship', id));
      if (edge)
        check(
          'relationship',
          id,
          [String(edge.content.sourceId), String(edge.content.targetId)],
          'endpoints',
          old?.relationshipIds.includes(id) ?? false,
        );
    }
    for (const id of next.noteIds) {
      const note = active.get(objectKey('note', id));
      if (note)
        check(
          'note',
          id,
          note.content.entityIds as string[],
          'entityIds',
          old?.noteIds.includes(id) ?? false,
        );
    }
  }
  if (issues.length)
    throw new ObjectValidationError('PREREQUISITE_MISSING', issues[0]!.requires, issues);
}
