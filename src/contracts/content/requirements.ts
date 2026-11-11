import { z } from 'zod';

const text = z.string().refine((value) => value.trim().length > 0, '内容不能为空');
const id = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, 'ID 不能包含首尾空白');

export const requirementStatusSchema = z.enum([
  'designing',
  'ready_for_implementation',
  'pending_acceptance',
  'completed',
  'on_hold',
  'cancelled',
]);

export type RequirementStatus = z.infer<typeof requirementStatusSchema>;

export const requirementStatusLabels = {
  designing: '设计中',
  ready_for_implementation: '方案已定',
  pending_acceptance: '待验收',
  completed: '已完成',
  on_hold: '暂缓',
  cancelled: '取消',
} as const satisfies Record<RequirementStatus, string>;

export const requirementContentSchema = z.strictObject({
  title: text,
  markdown: text,
  status: requirementStatusSchema,
});

export const progressRecordContentSchema = z.strictObject({
  requirementId: id,
  title: text,
  markdown: text,
  occurredAt: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe(
      '结论或事件实际发生时间，Unix 毫秒；无法核实时为 null，更正也须有依据。收录和修订保存时间由系统记录。',
    ),
});

export const retrospectiveContentSchema = z.strictObject({
  title: text,
  scopeMd: text,
  summaryMd: text,
});

export type RequirementContent = z.infer<typeof requirementContentSchema>;
export type ProgressRecordContent = z.infer<typeof progressRecordContentSchema>;
export type RetrospectiveContent = z.infer<typeof retrospectiveContentSchema>;
