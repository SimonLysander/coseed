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

export const requirementConcernLabels = {
  functionality: '功能',
  usability: '易用性',
  performance: '性能',
  reliability: '可靠性',
  security: '安全性',
  compatibility: '兼容性',
  maintainability: '可维护性',
} as const;
export const requirementConcernSchema = z.enum(
  Object.keys(requirementConcernLabels) as [
    keyof typeof requirementConcernLabels,
    ...(keyof typeof requirementConcernLabels)[],
  ],
);
export type RequirementConcern = z.infer<typeof requirementConcernSchema>;
export const requirementScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('project') }),
  z.strictObject({
    kind: z.literal('modules'),
    moduleIds: z
      .array(id)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, '范围中的模块不能重复'),
  }),
]);

export type RequirementScope = z.infer<typeof requirementScopeSchema>;

export const requirementContentSchema = z.strictObject({
  title: text,
  markdown: text.describe(
    '使用自然 Markdown 说明问题、预期结果和完成标准，涉及用户时说明服务对象。正文直接说明业务内容，范围和主要关注点由独立字段保存。',
  ),
  status: requirementStatusSchema,
  // Old revisions retain their original content and snapshot bytes. New writes
  // use the required projection below; migration never invents classifications.
  scope: requirementScopeSchema
    .describe(
      `**涉及范围必须与当前项目业务全景中的业务模块对应。** 按职责选择一个或多个模块 ID；实际覆盖全局的需求使用 project。外部系统及模块内部节点不作为范围。项目尚无模块划分时，先依据已确认业务建立初步全景；无法确认的范围列为待确认，相关需求待归属明确后保存。模块更名沿用身份；拆分、合并或移除时同步修订需求范围，保留历史。`,
    )
    .optional(),
  primaryConcern: requirementConcernSchema
    .describe(
      `按预期结果选择一个主要关注点，需求仍按独立目标划分。

| 值 | 关注点 | 关注什么 |
| --- | --- | --- |
| functionality | 功能 | 业务能力 |
| usability | 易用性 | 理解、学习、阅读和操作 |
| performance | 性能 | 响应、吞吐和资源 |
| reliability | 可靠性 | 稳定运行、故障恢复和数据完整性 |
| security | 安全性 | 认证、权限和数据保护 |
| compatibility | 兼容性 | 系统及协议协作 |
| maintainability | 可维护性 | 定位、修改和扩展 |`,
    )
    .optional(),
});
export const requirementWriteContentSchema = requirementContentSchema.extend({
  scope: requirementContentSchema.shape.scope.unwrap(),
  primaryConcern: requirementContentSchema.shape.primaryConcern.unwrap(),
});
// Human reading/copy uses the same field descriptions exposed by MCP.
export const requirementFieldGuide = [
  requirementWriteContentSchema.shape.markdown.description,
  requirementWriteContentSchema.shape.scope.description,
  requirementWriteContentSchema.shape.primaryConcern.description,
].join('\n\n');

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
