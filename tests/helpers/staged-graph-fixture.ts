import { z } from 'zod';
import { citationSchema } from '../../src/contracts/project-content.js';
import { designDiagramContentSchema } from '../../src/contracts/content/business-design.js';
import { authoringRouteSchema } from '../../src/contracts/authoring-routes.js';
import { saveRequirementFixture, fixtureCitations } from './requirements-fixture.js';
import { fixtureSystemDiagram } from './system-diagram.js';

const designPart = z.object({
  id: z.string(),
  objectType: z.enum(['diagram', 'entity', 'relationship', 'note']),
  content: z.record(z.string(), z.unknown()),
  citations: z.array(citationSchema),
});

export async function seedGraphChanges(
  base: string,
  projectId: string,
  raw: unknown[],
  note: string,
  sources: unknown[],
) {
  const parts = new Map<string, z.infer<typeof designPart>>();
  const group = (route: string, input: unknown) => ({
    route,
    input,
    citations: fixtureCitations(),
  });
  const stages: unknown[][] = [
    [group('overview.product', { markdown: '虚构测试产品。' })],
    [group('overview.system_diagram', fixtureSystemDiagram)],
    [],
    [],
    [],
  ];
  for (const value of raw) {
    if (value && typeof value === 'object' && 'route' in value) {
      const entry = authoringRouteSchema.parse(value);
      stages[entry.route === 'requirements.items' ? 3 : 4]!.push(entry);
    } else {
      const part = designPart.parse(value);
      parts.set(part.id, part);
    }
  }
  const diagrams = [...parts.values()]
    .filter((p) => p.objectType === 'diagram')
    .map((p) => ({ id: p.id, ...designDiagramContentSchema.parse(p.content) }));
  if (!diagrams.some((g) => g.scope.kind === 'project'))
    diagrams.unshift({
      id: '$panorama',
      scope: { kind: 'project' },
      title: '测试全景',
      entityIds: [...parts.values()]
        .filter((p) => ['module', 'external_system'].includes(String(p.content.kind)))
        .map((p) => p.id),
      relationshipIds: [],
      noteIds: [],
    });
  diagrams.sort((a, b) => Number(b.scope.kind === 'project') - Number(a.scope.kind === 'project'));
  const defined = new Set<string>();
  for (const diagram of diagrams) {
    const panorama = diagram.scope.kind === 'project';
    const prefix = panorama ? 'design.panorama.' : 'design.module.';
    for (const [kind, members] of [
      ['nodes', diagram.entityIds],
      ['edges', diagram.relationshipIds],
      ['notes', diagram.noteIds],
    ] as const) {
      if (kind !== 'nodes' && !members.length) continue;
      const items = [],
        attach = [];
      for (const id of members) {
        if (defined.has(id)) {
          attach.push({ id });
          continue;
        }
        const entry = parts.get(id);
        if (!entry) throw new Error('Missing fixture member ' + id);
        items.push({ id, ...entry.content, citations: entry.citations });
        defined.add(id);
      }
      const input = {
        diagramId: diagram.id,
        items,
        attach,
        ...(kind === 'nodes'
          ? {
              title: diagram.title,
              ...(diagram.scope.kind === 'module' ? { moduleId: diagram.scope.moduleId } : {}),
            }
          : {}),
      };
      stages[kind === 'nodes' ? (panorama ? 2 : 3) : 4]!.push(group(prefix + kind, input));
    }
  }
  const allocations = new Map<string, { localRef: string; id: string }>();
  let receipt = { version: 0, savedAt: 0 };
  for (const [i, stage] of stages.entries()) {
    if (!stage.length) continue;
    const withIds = JSON.parse(JSON.stringify(stage), (_key, value) =>
      typeof value === 'string' ? (allocations.get(value)?.id ?? value) : value,
    );
    const saved = await saveRequirementFixture(
      base,
      projectId,
      receipt.version,
      withIds,
      note,
      i === 0 ? sources : [],
    );
    receipt = saved.receipt;
    for (const entry of saved.allocations) allocations.set(entry.localRef, entry);
  }
  return { receipt, allocations: [...allocations.values()] };
}
