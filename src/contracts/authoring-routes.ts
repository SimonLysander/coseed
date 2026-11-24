import { z } from 'zod';
import {
  projectOverviewContentSchema as overview,
  systemDiagramWriteSchema,
} from './content/overview.js';
import {
  businessEntityContentSchema as entities,
  businessRelationshipContentSchema as edges,
  technicalNoteContentSchema as note,
} from './content/business-design.js';
import {
  requirementWriteContentSchema,
  progressRecordContentSchema,
  retrospectiveContentSchema,
} from './content/requirements.js';
import {
  citationSchema,
  currentLinkSchema,
  historicalLinkSchema,
  objectTypeSchema,
  projectMetadataSchema,
  statusChangeSchema,
} from './project-content.js';

const id = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value === value.trim(), 'ID 不能包含首尾空白');
const revision = z.number().int().positive();
const citations = z
  .array(citationSchema)
  .min(1)
  .optional()
  .describe('本项来源，省略时沿用所在组的 citations。局部综述条目的 path 相对于该条目。');
const item = { id, citations };
const ref = z.strictObject(item);
const group = <T extends string, S extends z.ZodType>(route: T, input: S) =>
  z.strictObject({ route: z.literal(route), input, citations });
const members = <T extends z.ZodType>(values: T) => ({
  diagramId: id,
  title: z.string().trim().min(1).optional(),
  items: z.array(values).default([]),
  attach: z.array(ref).default([]),
  detach: z.array(ref).default([]),
});
const localRemoval = <T extends string>(kinds: readonly [T, ...T[]]) =>
  z.array(z.strictObject({ ...item, kind: z.enum(kinds) })).default([]);
const concepts = overview.shape.concepts.shape;
const examples = overview.shape.examples.shape;
const edge = systemDiagramWriteSchema.shape.edges.element;
const previousLabel = edge.shape.label
  .optional()
  .describe('已读版本中，同一起点和终点有多条连线时，用旧标签选定其中一条。');
const edgeEdit = z.discriminatedUnion('op', [
  edge.extend({ op: z.literal('add'), citations }),
  edge.extend({ op: z.literal('update'), previousLabel, citations }),
  edge.omit({ label: true }).extend({ op: z.literal('remove'), previousLabel, citations }),
]);
const selectedCases = examples.sections.element.shape.diagram.shape.useCaseIds;
const selection = z.strictObject({
  sectionId: examples.sections.element.shape.id,
  attach: z.array(selectedCases.element).default([]),
  detach: z.array(selectedCases.element).default([]),
  citations,
});
const [module, external, component, object] = entities.options;
const [dependency, association, call, read, write, objectAssociation, event] = edges.options;
const target = z.strictObject({
  ...item,
  objectType: objectTypeSchema.exclude(['project']),
  expectedRevision: revision,
});
const status = statusChangeSchema.shape;
const recordEvidence = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('saved'), id, revisionNo: revision }),
  z.strictObject({ kind: z.literal('in_batch'), id }),
]);
const changeStatus = z.strictObject({
  kind: status.kind,
  to: requirementWriteContentSchema.shape.status,
  reasonMd: status.reasonMd,
  records: z.array(recordEvidence).default([]),
  citations,
});
export const authoringRouteSchema = z.discriminatedUnion('route', [
  group('overview.product', overview.shape.product),
  group(
    'overview.system_diagram',
    z.union([
      systemDiagramWriteSchema,
      z.strictObject({
        edits: z
          .array(edgeEdit)
          .min(1)
          .describe(
            '已有完整概览图时只提交变动的连线。add 和 update 的 label 是新标签，remove 使用 before 来源。来源路径相对于单条连线。',
          ),
      }),
    ]),
  ),
  group(
    'overview.concepts',
    z.strictObject({
      items: z
        .array(concepts.entries.element.extend({ citations }))
        .default([])
        .describe('部分词条保留原位置；调整顺序时提交全部词条及组级 after 来源，按提交顺序呈现。'),
      remove: localRemoval(['concept']),
    }),
  ),
  group(
    'overview.concept_relations',
    z.strictObject({
      items: z
        .array(
          z.union([
            concepts.relations.element.options[0].extend({ citations }),
            concepts.relations.element.options[1].extend({ citations }),
            concepts.relations.element.options[2].extend({ citations }),
          ]),
        )
        .default([]),
      remove: localRemoval(['concept_relation']),
    }),
  ),
  group('overview.example_context', z.strictObject({ introductionMd: examples.introductionMd })),
  group(
    'overview.examples',
    z.strictObject({
      actors: z.array(examples.actors.element.extend({ citations })).default([]),
      useCases: z.array(examples.useCases.element.extend({ citations })).default([]),
      sections: z
        .array(examples.sections.element.extend({ citations }))
        .default([])
        .describe('部分小节保留原位置；调整顺序时提交全部小节及组级 after 来源，按提交顺序阅读。'),
      selections: z
        .array(selection)
        .min(1)
        .optional()
        .describe(
          '调整已有小节选用的用例，每个小节提交一项。attach 加入用例，detach 移出用例，来源路径相对于该节的 useCaseIds 列表。',
        ),
      remove: localRemoval(['actor', 'use_case', 'example']),
    }),
  ),
  group(
    'design.panorama.nodes',
    z.strictObject(members(z.union([module.extend(item), external.extend(item)]))),
  ),
  group(
    'design.panorama.edges',
    z.strictObject(members(z.union([dependency.extend(item), association.extend(item)]))),
  ),
  group(
    'design.module.nodes',
    z.strictObject({
      ...members(z.union([component.extend(item), object.extend(item)])),
      moduleId: id,
    }),
  ),
  group(
    'design.module.edges',
    z.strictObject(
      members(
        z.union([
          call.extend(item),
          read.extend(item),
          write.extend(item),
          objectAssociation.extend(item),
          event.extend(item),
        ]),
      ),
    ),
  ),
  group('design.module.notes', z.strictObject(members(note.extend(item)))),
  group(
    'requirements.items',
    z.strictObject({
      items: z
        .array(
          requirementWriteContentSchema.omit({ status: true }).extend({
            ...item,
            initialStatus: requirementWriteContentSchema.shape.status
              .optional()
              .describe('新建需求时提供初始状态；已有需求由 requirements.progress 变更状态。'),
            links: z
              .array(currentLinkSchema)
              .optional()
              .describe('当前资料引用。省略沿用已有引用，空数组清空。'),
          }),
        )
        .min(1),
    }),
  ),
  group(
    'requirements.progress',
    z.strictObject({
      items: z
        .array(
          z.strictObject({
            requirementId: id,
            records: z
              .array(
                progressRecordContentSchema.omit({ requirementId: true }).extend({
                  ...item,
                  links: z
                    .array(historicalLinkSchema)
                    .optional()
                    .describe('引用当时的资料版本。省略沿用已有引用，空数组清空。'),
                }),
              )
              .default([]),
            statusChange: changeStatus.optional(),
            citations,
          }),
        )
        .min(1),
    }),
  ),
  group(
    'review.summary',
    retrospectiveContentSchema.extend({ id, inputSourceIds: z.array(id).min(1) }),
  ),
  group('project.settings', projectMetadataSchema.partial()),
  group('objects.remove', z.strictObject({ items: z.array(target).min(1) })),
  group(
    'objects.restore',
    z.strictObject({
      items: z
        .array(
          target.extend({ fromRevisionNo: revision, statusChange: statusChangeSchema.optional() }),
        )
        .min(1),
    }),
  ),
]);
export type AuthoringGroup = z.infer<typeof authoringRouteSchema>;
