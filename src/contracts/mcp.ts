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
    '一次逻辑保存的稳定名称，例如 theme-review-2026-11-06；创建项目时在服务实例内唯一，保存内容时在项目内唯一。成功请求以原 key 和原内容重试返回原回执；已成功 key 携带不同内容返回 OPERATION_MISMATCH。结果不明时可按原 key 查询成功回执或原样重试，新逻辑保存使用新 key。',
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
  version: version.describe('来自已读项目的固定资料版本；同一轮清单及文件分块请求保持此版本。'),
  part: z
    .discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('manifest'),
        afterPath: z
          .string()
          .max(512)
          .optional()
          .describe('上一页返回的 nextAfterPath；返回 null 表示清单结束。'),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      z.strictObject({
        kind: z.literal('file'),
        path: z.string().min(1).max(512).describe('来自本版本清单的文件路径。'),
        offset: version
          .default(0)
          .describe('按字节定位，后续位置来自 nextOffset；返回 null 表示本文件结束。'),
        maxBytes: z.number().int().min(1).max(65536).default(65536),
      }),
    ])
    .default({ kind: 'manifest', limit: 50 })
    .describe(
      'manifest 返回 files（path、bytes、sha256）和 nextAfterPath；file 返回 encoding=base64 的 content、nextOffset 及文件大小和摘要。Base64 解码后按字节拼接并核对 bytes、SHA-256。各页 serviceId、version、manifestSha256 一致。清单摘要为 {formatVersion,serviceId,projectId,version,files} 经 RFC 8785 规范化后的 SHA-256；files 按路径升序，每项仅含 path、bytes、sha256，排除清单自身。formatVersion=1 为文件协议版本；文件是 UTF-8 规范 JSON，以换行结束。',
    ),
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
  baseVersion: saveProjectInputSchema.shape.baseVersion.describe(
    '实际读取的项目版本；版本或对象修订不符时整批未保存。冲突需重新读取并核对内容，不能仅调整版本值。',
  ),
  changes: saveProjectInputSchema.shape.changes.describe(
    '完整对象变更。已有对象沿用已读 id 和 expectedRevision；project/overview 的 id 固定为 projectId，初次 overview 的 expectedRevision=null。其他新增对象用 $临时名称、expectedRevision=null，同批引用沿用该名称。临时名称全批唯一，$ 后为 1～100 个字母、数字、下划线、点或短横线。服务仅解析已定义引用字段，正文、TS 类型、locator 和综述局部 ID 原样保留；allocations 返回 localRef 到正式 id 的映射。',
  ),
  sources: saveProjectInputSchema.shape.sources.describe(
    '新增材料 id 使用 $临时名称；原文保留换行。已有材料可直接通过读到的 sourceId 引用。',
  ),
});

// Domain payloads reuse the same runtime schemas as storage. The envelope is shared
// across tools; operation semantics live in tool and field descriptions.
export const mcpResultSchema = z
  .strictObject({
    summary: z.string().describe('本次工具结果的简要说明。'),
    data: z
      .record(z.string(), z.json())
      .optional()
      .describe('成功业务数据，具体含义由对应工具描述；与 error 二选一。'),
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
  )
  .describe(
    '业务成功包含 data，业务失败包含 error 且 MCP isError=true；HTTP 和协议错误按相应协议返回。',
  );

export type SaveChangesInput = z.infer<typeof saveChangesInputSchema>;
export type McpResult = z.infer<typeof mcpResultSchema>;
