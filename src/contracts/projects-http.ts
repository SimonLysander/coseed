import { z } from 'zod';
import { createProjectInputSchema, projectMetadataSchema } from './project-content.js';
import { projectOverviewContentSchema } from './content/overview.js';

const id = z.string().min(1).max(512);
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const projectListQuerySchema = z.strictObject({
  name: z.string().max(200).optional().describe('名称子串筛选'),
  afterId: id.optional().describe('上一页 nextAfterId；按稳定 ID 排序的实时发现列表'),
  limit: z
    .string()
    .regex(/^\d+$/)
    .pipe(z.coerce.number<string>().int().min(1).max(100))
    .default(30),
});
export const overviewQuerySchema = z.strictObject({
  version: z
    .string()
    .regex(/^\d+$/)
    .pipe(z.coerce.number<string>().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
    .optional()
    .describe('可选固定项目版本；省略则在一致读事务取得当前版本'),
});
export const projectIdSchema = id;
export const projectSummarySchema = projectMetadataSchema.extend({
  id,
  version,
  createdAt: version,
});
export const projectListResponseSchema = z.strictObject({
  items: z.array(z.strictObject({ id, name: z.string(), version, createdAt: version })),
  nextAfterId: id.nullable(),
});
export const projectResponseSchema = z.strictObject({ project: projectSummarySchema });
export const projectOverviewResponseSchema = z.strictObject({
  project: projectSummarySchema,
  overview: z
    .strictObject({
      revisionNo: z.number().int().positive(),
      savedAt: version,
      content: projectOverviewContentSchema,
    })
    .nullable(),
});
export const createProjectRequestSchema = createProjectInputSchema.extend({
  operationId: z
    .uuid()
    .describe('浏览器为一次创建生成的稳定操作标识；重试复用同一标识和原始内容。'),
});
export const createProjectResponseSchema = z.strictObject({
  projectId: id,
  operationId: id,
  version,
  savedAt: version,
});
export const projectHttpErrorSchema = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string() }),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectOverviewResponse = z.infer<typeof projectOverviewResponseSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
