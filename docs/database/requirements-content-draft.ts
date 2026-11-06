/** Content-design proposals only; not a persistence model or MCP write contract. */
import { z } from 'zod';

const text = z.string().refine((value) => value.trim().length > 0, '内容不能为空');
const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'ID 不能包含首尾空白');

export const requirementStatusDraftSchema = z.enum([
  'designing',
  'ready_for_implementation',
  'pending_acceptance',
  'completed',
  'on_hold',
  'cancelled',
]);

export type RequirementStatusDraft = z.infer<typeof requirementStatusDraftSchema>;

export const requirementStatusLabels = {
  designing: '设计中',
  ready_for_implementation: '方案已定',
  pending_acceptance: '待验收',
  completed: '已完成',
  on_hold: '暂缓',
  cancelled: '取消',
} as const satisfies Record<RequirementStatusDraft, string>;

export const requirementContentDraftSchema = z.strictObject({
  title: text,
  markdown: text,
  status: requirementStatusDraftSchema,
});

export const progressRecordContentDraftSchema = z.strictObject({
  requirementId: id,
  title: text,
  markdown: text,
  occurredAt: z.number().int().nonnegative().nullable(),
});

export const retrospectiveContentDraftSchema = z.strictObject({
  title: text,
  scopeMd: text,
  summaryMd: text,
});

export type RequirementContentDraft = z.infer<typeof requirementContentDraftSchema>;
export type ProgressRecordContentDraft = z.infer<typeof progressRecordContentDraftSchema>;
export type RetrospectiveContentDraft = z.infer<typeof retrospectiveContentDraftSchema>;
