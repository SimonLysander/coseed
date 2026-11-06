/** Executable content-design proposal. Not registered as an HTTP/MCP contract. */
import { z } from 'zod';

const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'ID 不能包含首尾空白');
const text = z.string().refine((value) => value.trim().length > 0, '内容不能为空');
const conceptEntry = z.strictObject({ id, name: text, descriptionMd: text });
const conceptRelation = z.discriminatedUnion('kind', [
  z.strictObject({ id, kind: z.literal('kind-of'), source: id, target: id }),
  z.strictObject({ id, kind: z.literal('composition'), source: id, target: id }),
  z.strictObject({ id, kind: z.literal('association'), source: id, target: id, label: text }),
]);

function uniqueIds(values: { id: string }[], path: (string | number)[], context: z.RefinementCtx) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.id))
      context.addIssue({ code: 'custom', path: [...path, index, 'id'], message: 'ID 重复' });
    seen.add(value.id);
  });
  return seen;
}

// Kahn's algorithm avoids recursive traversal depth limits on imported graphs.
function checkHierarchy(
  nodes: Set<string>,
  edges: { source: string; target: string }[],
  kind: string,
  context: z.RefinementCtx,
) {
  const successors = new Map([...nodes].map((node) => [node, [] as string[]]));
  const indegree = new Map([...nodes].map((node) => [node, 0]));
  for (const edge of edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    successors.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target)! + 1);
  }
  const queue = [...nodes].filter((node) => indegree.get(node) === 0);
  for (let index = 0; index < queue.length; index++) {
    for (const target of successors.get(queue[index]!)!) {
      const remaining = indegree.get(target)! - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  if (queue.length !== nodes.size)
    context.addIssue({ code: 'custom', path: ['relations'], message: `${kind}关系存在循环` });
}

export const overviewConceptsDraftSchema = z
  .strictObject({
    entries: z.array(conceptEntry),
    relations: z.array(conceptRelation),
  })
  .superRefine((model, context) => {
    const nodes = uniqueIds(model.entries, ['entries'], context);
    uniqueIds(model.relations, ['relations'], context);
    const facts = new Set<string>();
    model.relations.forEach((relation, index) => {
      for (const field of ['source', 'target'] as const) {
        if (!nodes.has(relation[field]))
          context.addIssue({
            code: 'custom',
            path: ['relations', index, field],
            message: '引用了不存在的概念',
          });
      }
      const label = relation.kind === 'association' ? relation.label : '';
      const key = JSON.stringify([relation.kind, relation.source, relation.target, label]);
      if (facts.has(key))
        context.addIssue({ code: 'custom', path: ['relations', index], message: '重复的概念关系' });
      facts.add(key);
    });
    checkHierarchy(
      nodes,
      model.relations.filter((relation) => relation.kind === 'kind-of'),
      '种属',
      context,
    );
    checkHierarchy(
      nodes,
      model.relations.filter((relation) => relation.kind === 'composition'),
      '组成',
      context,
    );
  });

export const overviewExamplesDraftSchema = z
  .strictObject({
    introductionMd: text.nullable(),
    actors: z.array(z.strictObject({ id, name: text })),
    useCases: z.array(z.strictObject({ id, name: text, actorIds: z.array(id).min(1) })),
    sections: z.array(
      z.strictObject({
        id,
        title: text,
        diagram: z.strictObject({ id, useCaseIds: z.array(id).min(1) }),
        markdown: text,
      }),
    ),
  })
  .superRefine((model, context) => {
    if (model.sections.length > 0 && model.introductionMd === null) {
      context.addIssue({
        code: 'custom',
        path: ['introductionMd'],
        message: '已有示例小节时，须提供开篇背景说明',
      });
    }
    const actors = uniqueIds(model.actors, ['actors'], context);
    const useCases = uniqueIds(model.useCases, ['useCases'], context);
    uniqueIds(model.sections, ['sections'], context);
    const diagramIds = new Set<string>();
    const usedActors = new Set<string>();
    const usedCases = new Set<string>();
    model.useCases.forEach((useCase, index) => {
      const seen = new Set<string>();
      useCase.actorIds.forEach((actorId, actorIndex) => {
        const path = ['useCases', index, 'actorIds', actorIndex];
        if (!actors.has(actorId))
          context.addIssue({ code: 'custom', path, message: '引用了不存在的角色' });
        if (seen.has(actorId)) context.addIssue({ code: 'custom', path, message: '角色引用重复' });
        seen.add(actorId);
        usedActors.add(actorId);
      });
    });
    model.sections.forEach((section, index) => {
      if (diagramIds.has(section.diagram.id))
        context.addIssue({
          code: 'custom',
          path: ['sections', index, 'diagram', 'id'],
          message: '图的 ID 重复',
        });
      diagramIds.add(section.diagram.id);
      const seen = new Set<string>();
      section.diagram.useCaseIds.forEach((useCaseId, caseIndex) => {
        const path = ['sections', index, 'diagram', 'useCaseIds', caseIndex];
        if (!useCases.has(useCaseId))
          context.addIssue({ code: 'custom', path, message: '引用了不存在的用例' });
        if (seen.has(useCaseId))
          context.addIssue({ code: 'custom', path, message: '用例引用重复' });
        seen.add(useCaseId);
        usedCases.add(useCaseId);
      });
    });
    model.actors.forEach((actor, index) => {
      if (!usedActors.has(actor.id))
        context.addIssue({
          code: 'custom',
          path: ['actors', index],
          message: '角色未参与任何用例',
        });
    });
    model.useCases.forEach((useCase, index) => {
      if (!usedCases.has(useCase.id))
        context.addIssue({
          code: 'custom',
          path: ['useCases', index],
          message: '用例未被任何小节使用',
        });
    });
  });

export const projectOverviewContentDraftSchema = z.strictObject({
  product: z.strictObject({ markdown: text }),
  concepts: overviewConceptsDraftSchema,
  examples: overviewExamplesDraftSchema,
});

// Storage separates schema_version and content_json; do not repeat the version inside content.
export const projectOverviewDocumentDraftSchema = z.strictObject({
  schemaVersion: z.literal(1),
  content: projectOverviewContentDraftSchema,
});

export type ProjectOverviewContentDraft = z.infer<typeof projectOverviewContentDraftSchema>;
export type ProjectOverviewDocumentDraft = z.infer<typeof projectOverviewDocumentDraftSchema>;
