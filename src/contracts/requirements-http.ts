import { z } from 'zod';
import { overviewQuerySchema, projectIdSchema, projectSummarySchema } from './projects-http.js';
import {
  citationSchema,
  currentLinkSchema,
  historicalLinkSchema,
  sourceInputSchema,
  writeContextSchema,
} from './project-content.js';
import {
  requirementContentSchema,
  progressRecordContentSchema,
  requirementStatusSchema,
} from './content/requirements.js';

const id = projectIdSchema;
const number = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const queryNumber = z.string().regex(/^\d+$/).pipe(z.coerce.number<string>().int().min(1).max(100));
export const requirementsQuerySchema = overviewQuerySchema.extend({
  afterId: id.optional(),
  limit: queryNumber.default(30),
  name: z.string().max(200).optional(),
  status: requirementStatusSchema.optional(),
});
export const recordsQuerySchema = overviewQuerySchema.extend({
  version: overviewQuerySchema.shape.version.unwrap(),
  afterId: id.optional(),
  limit: queryNumber.default(30),
});
export const historyTypeSchema = z.enum(['requirement', 'record']);
export const revisionParamSchema = z
  .string()
  .regex(/^\d+$/)
  .pipe(z.coerce.number<string>().int().positive().max(Number.MAX_SAFE_INTEGER));
export const historyQuerySchema = recordsQuerySchema.omit({ afterId: true }).extend({
  beforeRevision: revisionParamSchema.optional(),
});
export const fixedVersionQuerySchema = recordsQuerySchema.pick({ version: true });
const statusChange = z
  .strictObject({
    kind: z.enum(['initial', 'progress', 'correction']),
    reasonMd: z.string(),
    records: z.array(z.strictObject({ id, revisionNo: revision })),
  })
  .nullable();
const meta = {
  id,
  revisionNo: revision,
  projectVersion: number,
  savedAt: number,
  createdAt: number,
  operationId: id,
  isDeleted: z.boolean(),
};
const evidence = {
  citations: z.array(citationSchema),
  actor: writeContextSchema
    .omit({ clientMetadata: true })
    .extend({ noteMd: z.string().nullable() }),
};
export const requirementViewSchema = z.strictObject({
  ...meta,
  ...evidence,
  content: requirementContentSchema,
  links: z.array(currentLinkSchema),
  statusChange,
});
export const recordViewSchema = z.strictObject({
  ...meta,
  ...evidence,
  content: progressRecordContentSchema,
  links: z.array(historicalLinkSchema),
  captureVersion: number,
  captureOrdinal: number,
});
export const requirementSummarySchema = z.strictObject({
  ...meta,
  title: z.string(),
  status: requirementStatusSchema,
  recordCount: number,
  statusChangedAt: number,
});
export const requirementsResponseSchema = z.strictObject({
  project: projectSummarySchema,
  items: z.array(requirementSummarySchema),
  nextAfterId: id.nullable(),
});
export const requirementResponseSchema = z.strictObject({
  project: projectSummarySchema,
  requirement: requirementViewSchema,
  recordCount: number,
  statusChangedAt: number,
});
export const recordsResponseSchema = z.strictObject({
  version: number,
  items: z.array(recordViewSchema),
  nextAfterId: id.nullable(),
});
export const historyResponseSchema = z.strictObject({
  version: number,
  items: z.array(
    z.discriminatedUnion('objectType', [
      requirementViewSchema.extend({ objectType: z.literal('requirement') }),
      recordViewSchema.extend({ objectType: z.literal('record') }),
    ]),
  ),
  nextBeforeRevision: revision.nullable(),
});
export const revisionResponseSchema = z.strictObject({
  version: number,
  revision: z.discriminatedUnion('objectType', [
    requirementViewSchema.extend({ objectType: z.literal('requirement') }),
    recordViewSchema.extend({ objectType: z.literal('record') }),
  ]),
  sources: z.array(
    sourceInputSchema.extend({
      contentHash: z.string(),
      capturedByOperationId: id,
      capturedAt: number,
      capturedProjectVersion: number,
    }),
  ),
});
export type RequirementsResponse = z.infer<typeof requirementsResponseSchema>;
export type RequirementResponse = z.infer<typeof requirementResponseSchema>;
export type RequirementView = z.infer<typeof requirementViewSchema>;
export type RecordView = z.infer<typeof recordViewSchema>;
export type HistoryResponse = z.infer<typeof historyResponseSchema>;
export type RevisionResponse = z.infer<typeof revisionResponseSchema>;
