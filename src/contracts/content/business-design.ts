import { z } from 'zod';

const text = z.string().refine((value) => value.trim().length > 0, '内容不能为空');
const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'ID 不能包含首尾空白');
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
    z.strictObject({ kind: z.literal('module'), moduleId: id }),
  ]),
  entityIds: z.array(id).min(1),
  relationshipIds: z.array(id),
  noteIds: z.array(id),
});

export const businessEntityContentSchema = entity;
export const businessRelationshipContentSchema = relationship;
export const technicalNoteContentSchema = note;
export const designDiagramContentSchema = diagram;

const snapshot = <T extends z.ZodType>(content: T) =>
  z.strictObject({ id, revisionNo: z.number().int().positive(), content });

// A bundle is one resolved project snapshot, never a collection of all revisions.
// The database resolver must prove each selected row is the latest at projectVersion.
export const businessDesignBundleSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    projectVersion: z.number().int().nonnegative(),
    entities: z.array(snapshot(entity)),
    relationships: z.array(snapshot(relationship)),
    notes: z.array(snapshot(note)),
    diagrams: z.array(snapshot(diagram)),
  })
  .superRefine((model, context) => {
    const error = (path: (string | number)[], message: string) =>
      context.addIssue({ code: 'custom', path, message });
    const index = <T extends { id: string }>(values: T[], collection: string) => {
      const map = new Map<string, T>();
      values.forEach((value, i) => {
        if (map.has(value.id)) error([collection, i], '同一项目快照内对象重复');
        map.set(value.id, value);
      });
      return map;
    };
    const entities = index(model.entities, 'entities');
    const relationships = index(model.relationships, 'relationships');
    const notes = index(model.notes, 'notes');
    index(model.diagrams, 'diagrams');
    const kinds = new Map(model.entities.map((value) => [value.id, value.content.kind]));
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
      view.entityIds.forEach((entityId, j) => {
        if (selected.has(entityId))
          error(['diagrams', i, 'content', 'entityIds', j], '同图中对象重复');
        selected.add(entityId);
        const resolved = entities.get(entityId);
        if (!resolved) {
          error(['diagrams', i, 'content', 'entityIds', j], '图引用了快照中不存在的对象');
          return;
        }
        const allowed =
          view.scope.kind === 'project'
            ? ['module', 'external_system']
            : ['component', 'data_object'];
        if (!allowed.includes(resolved.content.kind))
          error(['diagrams', i, 'content', 'entityIds', j], '对象不符合当前图的层次');
      });
      if (
        view.scope.kind === 'module' &&
        entities.get(view.scope.moduleId)?.content.kind !== 'module'
      )
        error(['diagrams', i, 'content', 'scope'], '内部图的模块范围无效');
      const selectedRelationships = new Set<string>();
      view.relationshipIds.forEach((relationshipId, j) => {
        if (selectedRelationships.has(relationshipId))
          error(['diagrams', i, 'content', 'relationshipIds', j], '同图关系重复');
        selectedRelationships.add(relationshipId);
        const resolved = relationships.get(relationshipId);
        if (!resolved) {
          error(['diagrams', i, 'content', 'relationshipIds', j], '图引用了快照中不存在的关系');
          return;
        }
        const edge = resolved.content;
        if (!selected.has(edge.sourceId) || !selected.has(edge.targetId))
          error(['diagrams', i, 'content', 'relationshipIds', j], '关系端点未包含在本图');
        const isOverview =
          edge.kind === 'functional_dependency' || edge.kind === 'module_association';
        if (isOverview !== (view.scope.kind === 'project'))
          error(['diagrams', i, 'content', 'relationshipIds', j], '关系不符合当前图的层次');
      });
      const selectedNotes = new Set<string>();
      view.noteIds.forEach((noteId, j) => {
        if (selectedNotes.has(noteId))
          error(['diagrams', i, 'content', 'noteIds', j], '同图说明重复');
        selectedNotes.add(noteId);
        const resolved = notes.get(noteId);
        if (!resolved) {
          error(['diagrams', i, 'content', 'noteIds', j], '图引用了快照中不存在的说明');
          return;
        }
        if (resolved.content.entityIds.some((entityId) => !selected.has(entityId)))
          error(['diagrams', i, 'content', 'noteIds', j], '说明范围超出了本图');
      });
    });
  });

export type BusinessDesignBundle = z.infer<typeof businessDesignBundleSchema>;
