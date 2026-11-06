import { z } from 'zod';
import { projectOverviewContentSchema } from './content/overview.js';
import {
  requirementContentSchema,
  progressRecordContentSchema,
  retrospectiveContentSchema,
} from './content/requirements.js';
import {
  businessEntityContentSchema,
  businessRelationshipContentSchema,
  designDiagramContentSchema,
  technicalNoteContentSchema,
} from './content/business-design.js';

const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'ID 不能包含首尾空白');
const text = z.string().refine((value) => value.trim().length > 0, '内容不能为空');
const revision = z.number().int().positive();
const version = z.number().int().nonnegative();
const jsonObject = z.record(z.string(), z.json());

export const objectTypeSchema = z.enum([
  'project',
  'overview',
  'requirement',
  'record',
  'retrospective',
  'entity',
  'relationship',
  'diagram',
  'note',
]);
export type ObjectType = z.infer<typeof objectTypeSchema>;

export const projectMetadataSchema = z.strictObject({
  name: text,
  repositoryLocator: jsonObject.nullable(),
});
export const sourceInputSchema = z.strictObject({
  id,
  kind: z.enum(['conversation', 'manual_edit', 'code', 'verification', 'document']),
  rawText: text,
  locator: jsonObject.default({}),
  occurredAt: version.nullable().default(null),
});
export const citationSchema = z.strictObject({
  sourceId: id,
  side: z.enum(['before', 'after']),
  path: z
    .string()
    .refine((value) => value === '' || value.startsWith('/'), '使用 JSON Pointer 定位内容'),
  explanationMd: text,
});

export const overviewPartSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('product') }),
  z.strictObject({ kind: z.literal('examples_introduction') }),
  ...(
    ['concept', 'concept_relation', 'actor', 'use_case', 'example', 'example_diagram'] as const
  ).map((kind) => z.strictObject({ kind: z.literal(kind), id })),
]);
export const currentLinkSchema = z.strictObject({
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('overview'), part: overviewPartSchema }),
    ...(['entity', 'relationship', 'diagram', 'note'] as const).map((kind) =>
      z.strictObject({ kind: z.literal(kind), id }),
    ),
  ]),
  explanationMd: text,
});
export const historicalLinkSchema = z.strictObject({
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('overview'), revisionNo: revision, part: overviewPartSchema }),
    z.strictObject({ kind: z.literal('diagram'), id, projectVersion: version }),
    ...(['record', 'entity', 'relationship', 'note'] as const).map((kind) =>
      z.strictObject({ kind: z.literal(kind), id, revisionNo: revision }),
    ),
  ]),
  explanationMd: text,
});
export const statusChangeSchema = z.strictObject({
  kind: z.enum(['progress', 'correction']),
  reasonMd: text,
  records: z.array(z.strictObject({ id, revisionNo: revision })).default([]),
});
const common = {
  id,
  expectedRevision: revision.nullable(),
  citations: z.array(citationSchema).min(1),
};
const upsert = z.discriminatedUnion('objectType', [
  z.strictObject({
    action: z.literal('upsert'),
    objectType: z.literal('project'),
    ...common,
    content: projectMetadataSchema,
  }),
  z.strictObject({
    action: z.literal('upsert'),
    objectType: z.literal('overview'),
    ...common,
    content: projectOverviewContentSchema,
  }),
  z.strictObject({
    action: z.literal('upsert'),
    objectType: z.literal('requirement'),
    ...common,
    content: requirementContentSchema,
    links: z.array(currentLinkSchema).optional(),
    statusChange: statusChangeSchema.nullable().default(null),
  }),
  z.strictObject({
    action: z.literal('upsert'),
    objectType: z.literal('record'),
    ...common,
    content: progressRecordContentSchema,
    links: z.array(historicalLinkSchema).optional(),
  }),
  z.strictObject({
    action: z.literal('upsert'),
    objectType: z.literal('retrospective'),
    ...common,
    content: retrospectiveContentSchema,
    inputSourceIds: z.array(id).min(1).optional(),
  }),
  z.strictObject({
    action: z.literal('upsert'),
    objectType: z.literal('entity'),
    ...common,
    content: businessEntityContentSchema,
  }),
  z.strictObject({
    action: z.literal('upsert'),
    objectType: z.literal('relationship'),
    ...common,
    content: businessRelationshipContentSchema,
  }),
  z.strictObject({
    action: z.literal('upsert'),
    objectType: z.literal('diagram'),
    ...common,
    content: designDiagramContentSchema,
  }),
  z.strictObject({
    action: z.literal('upsert'),
    objectType: z.literal('note'),
    ...common,
    content: technicalNoteContentSchema,
  }),
]);
const removable = objectTypeSchema.exclude(['project']);
export const contentChangeSchema = z.union([
  upsert,
  z.strictObject({
    action: z.literal('remove'),
    objectType: removable,
    id,
    expectedRevision: revision,
    citations: z.array(citationSchema).min(1),
  }),
  z.strictObject({
    action: z.literal('restore'),
    objectType: removable,
    id,
    expectedRevision: revision,
    fromRevisionNo: revision,
    citations: z.array(citationSchema).min(1),
    statusChange: statusChangeSchema.nullable().default(null),
  }),
]);
export const saveProjectInputSchema = z.strictObject({
  projectId: id,
  operationId: id,
  baseVersion: version,
  sources: z.array(sourceInputSchema).default([]),
  changes: z.array(contentChangeSchema).min(1),
  retrospectiveId: id.nullable().default(null),
  noteMd: text.nullable().default(null),
});
export const createProjectInputSchema = z.strictObject({
  operationId: id,
  name: text,
  repositoryLocator: jsonObject.nullable().default(null),
});
export const writeContextSchema = z.strictObject({
  entrypoint: z.enum(['web', 'mcp', 'cli', 'system']),
  actorKind: z.enum(['human', 'agent', 'system']),
  actorLabel: text,
  clientMetadata: jsonObject.default({}),
});

export type SourceInput = z.infer<typeof sourceInputSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type CurrentLink = z.infer<typeof currentLinkSchema>;
export type HistoricalLink = z.infer<typeof historicalLinkSchema>;
export type StatusChange = z.infer<typeof statusChangeSchema>;
export type ContentChange = z.infer<typeof contentChangeSchema>;
export type SaveProjectInput = z.infer<typeof saveProjectInputSchema>;
export type WriteContext = z.infer<typeof writeContextSchema>;
export type OverviewPart = z.infer<typeof overviewPartSchema>;

export interface StoredSource extends SourceInput {
  contentHash: string;
  capturedByOperationId: string;
  capturedAt: number;
  capturedProjectVersion: number;
}

export interface StoredRevision {
  objectType: ObjectType;
  id: string;
  revisionNo: number;
  operationId: string;
  projectVersion: number;
  savedAt: number;
  createdAt: number;
  isDeleted: boolean;
  content: Record<string, unknown>;
  citations: Citation[];
  links: CurrentLink[] | HistoricalLink[];
  inputSourceIds: string[];
  statusChange: {
    kind: 'initial' | 'progress' | 'correction';
    reasonMd: string;
    records: { id: string; revisionNo: number }[];
  } | null;
  captureOrdinal: number | null;
  captureVersion: number | null;
}
export interface ProjectSnapshot {
  projectId: string;
  version: number;
  project: StoredRevision;
  objects: StoredRevision[];
  sources: StoredSource[];
}
export interface OperationReceipt {
  projectId: string;
  operationId: string;
  baseVersion: number | null;
  version: number;
  savedAt: number;
  entrypoint: WriteContext['entrypoint'];
  actorKind: WriteContext['actorKind'];
  actorLabel: string;
  retrospectiveId: string | null;
  changes: { objectType: ObjectType; id: string; revisionNo: number; isDeleted: boolean }[];
}
