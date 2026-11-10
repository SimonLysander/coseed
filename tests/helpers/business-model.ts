import { z } from 'zod';
import { buildBusinessFixture } from './business-fixture.js';
import { businessDiagramResponseSchema } from '../../src/contracts/business-http.js';
import { businessModel, cellId } from '../../src/web/business/graph/model.js';
import type { Size } from '../../src/web/business/graph/layout.js';

export function fixtureModel(internal = true) {
  const fixture = buildBusinessFixture();
  const changes = fixture.changes.map((value) =>
    z.object({ objectType: z.string(), id: z.string(), content: z.unknown() }).parse(value),
  );
  const diagram = changes.find((item) => item.id === (internal ? '$internal' : '$overview'))!;
  const collect = (kind: string) =>
    changes
      .filter((item) => item.objectType === kind)
      .map((item) => ({ id: item.id, revisionNo: 1, content: item.content }));
  const summary = {
    id: diagram.id,
    revisionNo: 1,
    savedAt: 1,
    ...z.object({ title: z.string(), scope: z.unknown() }).parse(diagram.content),
    scopeName: internal ? '账号供给与履约' : '虚构业务全景',
  };
  const scope = z
    .object({ relationshipIds: z.array(z.string()), noteIds: z.array(z.string()) })
    .parse(diagram.content);
  const data = businessDiagramResponseSchema.parse({
    project: { id: 'test', name: '虚构图测试', repositoryLocator: null, version: 1, createdAt: 1 },
    diagram: summary,
    bundle: {
      schemaVersion: 2,
      projectVersion: 1,
      entities: collect('entity'),
      relationships: collect('relationship').filter((item) =>
        scope.relationshipIds.includes(item.id),
      ),
      notes: collect('note').filter((item) => scope.noteIds.includes(item.id)),
      diagrams: [{ id: diagram.id, revisionNo: 1, content: diagram.content }],
    },
    sourcePaths: fixture.sources.flatMap((value) => {
      const source = z
        .object({ id: z.string(), locator: z.object({ path: z.string() }).optional() })
        .parse(value);
      return source.locator ? [{ id: source.id, path: source.locator.path }] : [];
    }),
    moduleDiagrams: internal ? [summary] : [],
    projectDiagrams: internal ? [] : [summary],
  });
  const model = businessModel(data);
  const sizes = new Map<string, Size>([
    ...model.nodes.map(
      (node) =>
        [
          cellId('entity', node.id),
          { width: 288, height: node.entity.content.kind === 'data_object' ? 220 : 120 },
        ] as const,
    ),
    ...model.edges.map((edge) => [cellId('label', edge.id), { width: 280, height: 90 }] as const),
    ...model.notes.map((note) => [cellId('note', note.id), { width: 288, height: 160 }] as const),
  ]);
  return { data, model, sizes };
}
