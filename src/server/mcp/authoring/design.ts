import type { AuthoringGroup } from '../../../contracts/authoring-routes.js';
import type { Citation } from '../../../contracts/project-content.js';
import { objectKey } from '../../modules/project-content/persistence/definitions.js';
import { ContentError } from '../../modules/project-content/errors.js';
import { Batch } from './batch.js';

type DesignGroup = Extract<AuthoringGroup, { route: `design.${string}` }>;
type DiagramDefinition = {
  title: string;
  scope: { kind: 'project' } | { kind: 'module'; moduleId: string };
};
export function diagramDefinitions(groups: AuthoringGroup[]) {
  const definitions = new Map<string, DiagramDefinition>();
  for (const [index, group] of groups.entries()) {
    if (group.route !== 'design.panorama.nodes' && group.route !== 'design.module.nodes') continue;
    const { diagramId, title } = group.input;
    if (!title) continue;
    const scope: DiagramDefinition['scope'] =
      'moduleId' in group.input
        ? { kind: 'module', moduleId: group.input.moduleId }
        : { kind: 'project' };
    const old = definitions.get(diagramId);
    if (old && (old.title !== title || JSON.stringify(old.scope) !== JSON.stringify(scope)))
      throw new ContentError(
        'INVALID_INPUT',
        'changes[' + index + '] 同一张图收到了不同的标题或所属范围。',
      );
    definitions.set(diagramId, { title, scope });
  }
  return definitions;
}
export function writeDesign(
  batch: Batch,
  group: DesignGroup,
  definitions: ReadonlyMap<string, DiagramDefinition>,
) {
  const { diagramId, title, items, attach, detach } = group.input;
  const internal = group.route.startsWith('design.module.');
  const field = group.route.endsWith('.nodes')
    ? 'entityIds'
    : group.route.endsWith('.edges')
      ? 'relationshipIds'
      : 'noteIds';
  const type =
    field === 'entityIds' ? 'entity' : field === 'relationshipIds' ? 'relationship' : 'note';
  const moduleId = 'moduleId' in group.input ? group.input.moduleId : undefined;
  const original = batch.original.get(objectKey('diagram', diagramId));
  const definition = definitions.get(diagramId);
  if (!original && (!definition || field !== 'entityIds'))
    batch.fail('首建一张图需用节点组并提供标题，内部图还需提供所属模块。');
  const graph = batch.draft('diagram', diagramId, {
    title: definition?.title,
    scope: definition?.scope,
    entityIds: [],
    relationshipIds: [],
    noteIds: [],
  });
  const scope = graph.content.scope as { kind: string; moduleId?: string };
  if (scope.kind !== (internal ? 'module' : 'project') || (moduleId && scope.moduleId !== moduleId))
    batch.fail('图的范围与所选路由不一致。');
  if (title && title !== graph.content.title) {
    batch.claim('diagram', diagramId, 'title');
    graph.content.title = title;
    batch.cite(graph, batch.evidence(group.citations), '/title');
  }
  const members = graph.content[field] as string[];
  const update = (
    id: string,
    citations: Citation[],
    where: string,
    remove: boolean,
    explicit: boolean,
  ) => {
    batch.claim('diagram', diagramId, field + '/' + id);
    const at = members.indexOf(id);
    if (remove) {
      if (at < 0) batch.fail('该图未选入 ' + id);
      members.splice(at, 1);
    } else if (at < 0) members.push(id);
    if (explicit || at < 0 || remove) {
      // Membership is evidence for the diagram, independently of the object's content fields.
      const itemEvidence = citations.filter((c) => c.path === '');
      const graphEvidence = batch.evidence(
        itemEvidence.length ? itemEvidence : group.citations?.filter((c) => c.path === ''),
      );
      batch.cite(graph, graphEvidence, original ? '/' + field : '');
    }
    if (explicit) batch.track(where, id, 'diagram', diagramId);
  };
  items.forEach(({ id, citations, ...content }, index) => {
    const evidence = batch.evidence(citations ?? group.citations);
    const path = 'items[' + index + ']';
    batch.full(type, id, content, evidence, path);
    update(id, evidence, path, false, false);
  });
  attach.forEach(({ id, citations }, i) =>
    update(id, batch.evidence(citations ?? group.citations), 'attach[' + i + ']', false, true),
  );
  detach.forEach(({ id, citations }, i) =>
    update(id, batch.evidence(citations ?? group.citations), 'detach[' + i + ']', true, true),
  );
  // Editing an existing node may leave the diagram itself untouched.
  if (!graph.citations.length && original) batch.cite(graph, original.citations);
  if (title && !items.length && !attach.length && !detach.length)
    batch.track('title', diagramId, 'diagram');
}
