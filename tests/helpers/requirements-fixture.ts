import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { mcpResultSchema } from '../../src/contracts/mcp.js';

export const fixtureCitations = (side: 'before' | 'after' = 'after') => [
  {
    sourceId: '$material',
    side,
    path: '',
    explanationMd: '明确标记为虚构的测试材料，支持本版完整内容。',
  },
];
export const change = (
  objectType: 'requirement' | 'record',
  id: string,
  content: Record<string, unknown>,
  expectedRevision: number | null = null,
  extra = {},
) => ({
  action: 'upsert' as const,
  objectType,
  id,
  expectedRevision,
  content,
  citations: fixtureCitations(),
  ...extra,
});
const resultSchema = z.object({
  receipt: z.object({ version: z.number(), savedAt: z.number() }),
  allocations: z.array(z.object({ localRef: z.string(), id: z.string() })),
});
export async function saveRequirementFixture(
  base: string,
  projectId: string,
  baseVersion: number,
  changes: unknown[],
  note = '虚构测试回顾',
  materials?: unknown[],
) {
  const client = new Client({ name: 'fictional-requirements-fixture', version: '0.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base)));
    const response = await client.callTool({
      name: 'save_changes',
      arguments: {
        projectId,
        requestKey: `fixture-${randomUUID()}`,
        baseVersion,
        sources: materials ?? [
          {
            id: '$material',
            kind: 'document',
            rawText: JSON.stringify({
              exampleOnly: true,
              note: '虚构需求测试，不是用户资料。',
              changes,
            }),
          },
        ],
        changes,
        noteMd: note,
      },
    });
    const result = mcpResultSchema.parse(response.structuredContent);
    if (response.isError || result.error) throw new Error(JSON.stringify(result));
    return resultSchema.parse(result.data);
  } finally {
    await client.close();
  }
}
export async function seedRequirementFixture(base: string, projectId: string) {
  const initial = await saveRequirementFixture(base, projectId, 0, [
    change('requirement', '$first', {
      title: '虚构：看清需求如何演变',
      markdown: '让读者在继续开发前理解已有决定，能够查看需求的推进和更正。',
      status: 'designing',
    }),
    change('requirement', '$second', {
      title: '虚构：另一个独立需求',
      markdown: '这项需求尚未产生推进记录。',
      status: 'on_hold',
    }),
    change('record', '$old1', {
      requirementId: '$first',
      title: '虚构：先确定回顾方式',
      markdown: '原始决定：由用户发起阶段回顾。',
      occurredAt: null,
    }),
    change('record', '$old2', {
      requirementId: '$first',
      title: '虚构：保留原始来源',
      markdown: '每个版本都保留来源，方便之后核对。',
      occurredAt: 1794182400000,
    }),
  ]);
  const ids = Object.fromEntries(
    initial.allocations.map((value) => [value.localRef, value.id]),
  ) as Record<string, string>;
  const settled = await saveRequirementFixture(base, projectId, 1, [
    change('record', '$decision', {
      requirementId: ids.$first,
      title: '虚构：方案已经明确',
      markdown: '当时的方案依据：回顾后记录结论，保留原决定。',
      occurredAt: null,
    }),
    change(
      'requirement',
      ids.$first!,
      {
        title: '虚构：看清需求如何演变',
        markdown: '让读者在继续开发前理解已有决定，能够查看需求的推进和更正。',
        status: 'ready_for_implementation',
      },
      1,
      {
        statusChange: {
          kind: 'progress',
          reasonMd: '已经讨论并明确回顾与来源方案。',
          records: [{ id: '$decision', revisionNo: 1 }],
        },
      },
    ),
  ]);
  for (const value of settled.allocations) ids[value.localRef] = value.id;
  const corrected = await saveRequirementFixture(base, projectId, 2, [
    change(
      'record',
      ids.$old1!,
      {
        requirementId: ids.$first,
        title: '虚构：先确定回顾方式',
        markdown: '更正后的决定：用户主动发起回顾，Agent 根据材料一次补齐。',
        occurredAt: null,
      },
      1,
    ),
    change(
      'requirement',
      ids.$first!,
      {
        title: '虚构：看清需求如何演变',
        markdown: '用户需要理解需求推进的过程、保留原始来源，并能回看旧版本。',
        status: 'ready_for_implementation',
      },
      2,
    ),
  ]);
  return { ids, initial, settled, corrected, version: 3 };
}
