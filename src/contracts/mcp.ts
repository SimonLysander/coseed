import { z } from 'zod';
import {
  createProjectInputSchema,
  objectTypeSchema,
  saveProjectInputSchema,
} from './project-content.js';

const id = z.string().min(1).max(512);
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const requestKey = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .describe(
    '本次逻辑保存的稳定名称，来自当前任务，例如 theme-review-2026-11-06。重试保持原值及原内容；不同保存使用不同名称。不是已有对象 ID。',
  );

export const guideTopicSchema = z.enum([
  'usage',
  'overview',
  'requirements',
  'design',
  'sources',
  'export',
]);
export const readGuideInputSchema = z.strictObject({ topic: guideTopicSchema });
export const listProjectsInputSchema = z.strictObject({
  name: z.string().max(200).optional(),
  afterId: id
    .optional()
    .describe('上一页 nextAfterId；按稳定 ID 排序。列表是实时发现，不是历史快照。'),
  limit: z.number().int().min(1).max(100).default(30),
});
export const getProjectInputSchema = z.strictObject({ projectId: id });
export const exportSnapshotInputSchema = z.strictObject({
  projectId: id,
  version,
  part: z
    .discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('manifest'),
        afterPath: z.string().max(512).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      z.strictObject({
        kind: z.literal('file'),
        path: z.string().min(1).max(512),
        offset: version.default(0),
        maxBytes: z.number().int().min(1).max(65536).default(65536),
      }),
    ])
    .default({ kind: 'manifest', limit: 50 }),
});
export const listRevisionsInputSchema = z.strictObject({
  projectId: id,
  objectType: objectTypeSchema,
  id,
  version,
  beforeRevision: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
export const readRevisionInputSchema = z.strictObject({
  projectId: id,
  version,
  target: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('revision'),
      objectType: objectTypeSchema,
      id,
      revisionNo: z.number().int().positive(),
    }),
    z.strictObject({ kind: z.literal('diagram'), id }),
  ]),
});
export const getOperationInputSchema = z.strictObject({
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('create_project'), requestKey }),
    z.strictObject({ kind: z.literal('save_changes'), projectId: id, requestKey }),
    z.strictObject({ kind: z.literal('operation'), projectId: id, operationId: id }),
  ]),
});
export const createProjectToolInputSchema = createProjectInputSchema
  .omit({ operationId: true })
  .extend({ requestKey });
export const saveChangesInputSchema = saveProjectInputSchema.omit({ operationId: true }).extend({
  requestKey,
  changes: saveProjectInputSchema.shape.changes.describe(
    '完整对象变更。已有对象沿用读取的 id 和 expectedRevision；新增对象 id 使用 $临时名称，expectedRevision=null。同批引用使用相同 $名称。project/overview 的 id 固定为 projectId。',
  ),
  sources: saveProjectInputSchema.shape.sources.describe(
    '新增材料 id 使用 $临时名称；原文保留换行。已有材料可直接通过读到的 sourceId 引用。',
  ),
});

// Domain payloads reuse the same runtime schemas as storage. The envelope is shared
// across tools; individual result semantics are described in the versioned guide.
export const mcpResultSchema = z
  .strictObject({
    summary: z.string(),
    data: z.record(z.string(), z.json()).optional(),
    meta: z
      .strictObject({ total: z.number().int().nonnegative(), list: z.array(z.string()).max(5) })
      .optional(),
    error: z
      .strictObject({
        code: z.string(),
        message: z.string(),
        details: z.record(z.string(), z.json()).optional(),
      })
      .optional(),
  })
  .refine(
    (value) => (value.data === undefined) !== (value.error === undefined),
    '结果必须包含 data 或 error 之一',
  );

export type SaveChangesInput = z.infer<typeof saveChangesInputSchema>;
export type McpResult = z.infer<typeof mcpResultSchema>;
