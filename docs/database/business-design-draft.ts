/** Executable business-design proposal. The bundle is a validation fixture, not a write API. */
import { z } from 'zod';

const text = z.string().refine((value) => value.trim().length > 0, '内容不能为空');
const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'ID 不能包含首尾空白');
const ref = z.strictObject({ id, revisionNo: z.number().int().positive() });
const owner = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('module'), id }),
  z.strictObject({ kind: z.literal('external_system'), id }),
]);
const base = { name: text, summary: text };
const entity = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('module'), ...base, role: z.enum(['core', 'support']) }),
  z.strictObject({ kind: z.literal('external_system'), ...base }),
  z.strictObject({ kind: z.literal('component'), ...base, owner, primarySourceId: id.nullable() }),
  z.strictObject({
    kind: z.literal('data_object'),
    ...base,
    owner,
    primarySourceId: id.nullable(),
    typeSourceId: id.nullable(),
    typeName: text,
    typeScript: text,
  }),
]);
const multiplicity = z
  .string()
  .regex(/^(?:\*|\d+|\d+\.\.(?:\d+|\*))$/)
  .refine((value) => {
    if (value === '*') return true;
    const [minimum, maximum] = value.split('..');
    if (!Number.isSafeInteger(Number(minimum))) return false;
    return (
      maximum === undefined ||
      maximum === '*' ||
      (Number.isSafeInteger(Number(maximum)) && Number(minimum) <= Number(maximum))
    );
  }, '数量范围无效');
const ends = { sourceId: id, targetId: id, summary: text };
const returned = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('data'), summary: text }),
  z.strictObject({ kind: z.literal('none') }),
]);
const relationship = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('functional_dependency'), ...ends }),
  z.strictObject({ kind: z.literal('module_association'), ...ends }),
  z.strictObject({
    kind: z.literal('call'),
    ...ends,
    operations: z
      .array(
        z.strictObject({
          name: text,
          interfaceSignature: text.nullable(),
          input: z.string(),
          returns: returned.nullable(),
        }),
      )
      .min(1),
  }),
  z.strictObject({
    kind: z.literal('read'),
    ...ends,
    operations: z.array(z.strictObject({ name: text, selector: z.string(), result: text })).min(1),
  }),
  z.strictObject({
    kind: z.literal('write'),
    ...ends,
    operations: z.array(z.strictObject({ name: text, selector: z.string(), changes: text })).min(1),
  }),
  z.strictObject({
    kind: z.literal('object_association'),
    ...ends,
    associationKey: text.nullable(),
    sourceMultiplicity: multiplicity.nullable(),
    targetMultiplicity: multiplicity.nullable(),
  }),
  z.strictObject({
    kind: z.literal('event'),
    ...ends,
    events: z.array(z.strictObject({ name: text, eventName: text, payload: text })).min(1),
  }),
]);
const note = z.strictObject({ title: text, problemMd: text, entityIds: z.array(id).min(1) });
const diagram = z.strictObject({
  title: text,
  scope: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('project') }),
    z.strictObject({ kind: z.literal('module'), moduleRef: ref }),
  ]),
  entityRefs: z.array(ref).min(1),
  relationshipRefs: z.array(ref),
  noteRefs: z.array(ref),
});

export const businessEntityContentDraftSchema = entity;
export const businessRelationshipContentDraftSchema = relationship;
export const technicalNoteContentDraftSchema = note;
export const designDiagramContentDraftSchema = diagram;

const snapshot = <T extends z.ZodType>(content: T) =>
  z.strictObject({ id, revisionNo: z.number().int().positive(), content });
const key = (value: { id: string; revisionNo: number }) =>
  JSON.stringify([value.id, value.revisionNo]);

export const businessDesignBundleDraftSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    entities: z.array(snapshot(entity)),
    relationships: z.array(snapshot(relationship)),
    notes: z.array(snapshot(note)),
    diagrams: z.array(snapshot(diagram)),
  })
  .superRefine((model, context) => {
    const error = (path: (string | number)[], message: string) =>
      context.addIssue({ code: 'custom', path, message });
    const index = <T extends { id: string; revisionNo: number }>(
      values: T[],
      collection: string,
    ) => {
      const map = new Map<string, T>();
      values.forEach((value, i) => {
        if (map.has(key(value))) error([collection, i], '对象版本重复');
        map.set(key(value), value);
      });
      return map;
    };
    const entities = index(model.entities, 'entities');
    const relationships = index(model.relationships, 'relationships');
    const notes = index(model.notes, 'notes');
    index(model.diagrams, 'diagrams');
    const kinds = new Map<string, string>();
    model.entities.forEach((value, i) => {
      const previous = kinds.get(value.id);
      if (previous && previous !== value.content.kind)
        error(['entities', i], '同一对象身份的种类不一致');
      kinds.set(value.id, value.content.kind);
    });
    model.entities.forEach((value, i) => {
      if (
        'owner' in value.content &&
        kinds.get(value.content.owner.id) !== value.content.owner.kind
      )
        error(['entities', i, 'content', 'owner'], '对象归属不存在或种类不匹配');
    });
    model.relationships.forEach((value, i) => {
      const edge = value.content;
      const source = kinds.get(edge.sourceId);
      const target = kinds.get(edge.targetId);
      if (!source || !target) {
        error(['relationships', i], '关系引用了不存在的对象');
        return;
      }
      if (edge.sourceId === edge.targetId && edge.kind !== 'object_association')
        error(['relationships', i], '这种关系不支持自关联');
      let valid = false;
      if (edge.kind === 'functional_dependency' || edge.kind === 'module_association') {
        valid =
          ['module', 'external_system'].includes(source) &&
          ['module', 'external_system'].includes(target) &&
          (source === 'module' || target === 'module');
      } else if (edge.kind === 'call' || edge.kind === 'event') {
        valid = source === 'component' && target === 'component';
      } else if (edge.kind === 'read' || edge.kind === 'write') {
        valid = source === 'component' && target === 'data_object';
      } else if (edge.kind === 'object_association') {
        valid = source === 'data_object' && target === 'data_object';
      }
      if (!valid) error(['relationships', i], '关系类型与两端对象种类不匹配');
      if (
        edge.kind === 'event' &&
        new Set(edge.events.map((event) => event.eventName)).size !== edge.events.length
      )
        error(['relationships', i, 'content', 'events'], '同一关系中的事件标识重复');
    });
    model.notes.forEach((value, i) => {
      if (new Set(value.content.entityIds).size !== value.content.entityIds.length)
        error(['notes', i, 'content', 'entityIds'], '说明范围重复');
      if (value.content.entityIds.some((entityId) => !kinds.has(entityId)))
        error(['notes', i, 'content', 'entityIds'], '说明引用了不存在的对象');
    });
    model.diagrams.forEach((value, i) => {
      const view = value.content;
      const selected = new Set<string>();
      view.entityRefs.forEach((reference, j) => {
        if (selected.has(reference.id))
          error(['diagrams', i, 'content', 'entityRefs', j], '同图中对象重复或混用了多个版本');
        selected.add(reference.id);
        const resolved = entities.get(key(reference));
        if (!resolved) {
          error(['diagrams', i, 'content', 'entityRefs', j], '图引用了不存在的对象版本');
          return;
        }
        const allowed =
          view.scope.kind === 'project'
            ? ['module', 'external_system']
            : ['component', 'data_object'];
        if (!allowed.includes(resolved.content.kind))
          error(['diagrams', i, 'content', 'entityRefs', j], '对象不符合当前图的层次');
      });
      if (
        view.scope.kind === 'module' &&
        entities.get(key(view.scope.moduleRef))?.content.kind !== 'module'
      )
        error(['diagrams', i, 'content', 'scope'], '内部图的模块范围无效');
      const selectedRelationships = new Set<string>();
      view.relationshipRefs.forEach((reference, j) => {
        if (selectedRelationships.has(reference.id))
          error(['diagrams', i, 'content', 'relationshipRefs', j], '同图关系重复');
        selectedRelationships.add(reference.id);
        const resolved = relationships.get(key(reference));
        if (!resolved) {
          error(['diagrams', i, 'content', 'relationshipRefs', j], '图引用了不存在的关系版本');
          return;
        }
        const edge = resolved.content;
        if (!selected.has(edge.sourceId) || !selected.has(edge.targetId))
          error(['diagrams', i, 'content', 'relationshipRefs', j], '关系端点未包含在本图');
        const isOverview =
          edge.kind === 'functional_dependency' || edge.kind === 'module_association';
        if (isOverview !== (view.scope.kind === 'project'))
          error(['diagrams', i, 'content', 'relationshipRefs', j], '关系不符合当前图的层次');
      });
      const selectedNotes = new Set<string>();
      view.noteRefs.forEach((reference, j) => {
        if (selectedNotes.has(reference.id))
          error(['diagrams', i, 'content', 'noteRefs', j], '同图说明重复');
        selectedNotes.add(reference.id);
        const resolved = notes.get(key(reference));
        if (!resolved) {
          error(['diagrams', i, 'content', 'noteRefs', j], '图引用了不存在的说明版本');
          return;
        }
        if (resolved.content.entityIds.some((entityId) => !selected.has(entityId)))
          error(['diagrams', i, 'content', 'noteRefs', j], '说明范围超出了本图');
      });
    });
  });

export type BusinessDesignBundleDraft = z.infer<typeof businessDesignBundleDraftSchema>;
