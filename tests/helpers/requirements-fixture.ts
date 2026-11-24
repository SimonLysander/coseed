import { issueTestKey, projectTransport } from '../../scripts/testing/project-mcp.js';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { mcpResultSchema } from '../../src/contracts/mcp.js';
import { fixtureSystemDiagram } from './system-diagram.js';

export const fixtureCitations = (side: 'before' | 'after' = 'after') => [
  {
    sourceId: '$material',
    side,
    path: '',
    explanationMd: '明确标记为虚构的测试材料，支持本版完整内容。',
  },
];
export const requirementFixture = (item: Record<string, unknown>) => ({
  route: 'requirements.items',
  input: { items: [{ scope: { kind: 'project' }, primaryConcern: 'functionality', ...item }] },
  citations: fixtureCitations(),
});
export const recordFixture = (requirementId: string, record: Record<string, unknown>) => ({
  route: 'requirements.progress',
  input: { items: [{ requirementId, records: [record] }] },
  citations: fixtureCitations(),
});
const progressFixture = (requirementId: string, statusChange: Record<string, unknown>) => ({
  route: 'requirements.progress',
  input: { items: [{ requirementId, statusChange }] },
  citations: fixtureCitations(),
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
    await client.connect(projectTransport(base, (await issueTestKey(base, projectId)).key));
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
  await saveRequirementFixture(base, projectId, 0, [
    {
      route: 'overview.product',
      input: { markdown: '虚构需求测试项目。' },
      citations: fixtureCitations(),
    },
  ]);
  await saveRequirementFixture(base, projectId, 1, [
    {
      route: 'overview.system_diagram',
      input: fixtureSystemDiagram,
      citations: fixtureCitations(),
    },
  ]);
  await saveRequirementFixture(base, projectId, 2, [
    {
      route: 'design.panorama.nodes',
      input: {
        diagramId: '$panorama',
        title: '测试业务全景',
        items: [
          {
            id: '$module',
            kind: 'module',
            name: '需求推进',
            summary: '维护需求和推进记录。',
            role: 'core',
          },
        ],
      },
      citations: fixtureCitations(),
    },
  ]);
  const initial = await saveRequirementFixture(base, projectId, 3, [
    requirementFixture({
      id: '$first',
      title: '虚构：看清需求如何演变',
      markdown: '让读者在继续开发前理解已有决定，能够查看需求的推进和更正。',
      initialStatus: 'designing',
    }),
    requirementFixture({
      id: '$second',
      title: '虚构：另一个独立需求',
      markdown: '这项需求尚未产生推进记录。',
      initialStatus: 'on_hold',
    }),
  ]);
  const ids = Object.fromEntries(initial.allocations.map((v) => [v.localRef, v.id])) as Record<
    string,
    string
  >;
  const records = await saveRequirementFixture(base, projectId, initial.receipt.version, [
    recordFixture(ids.$first!, {
      id: '$old1',
      title: '虚构：先确定回顾方式',
      markdown: '原始决定：由用户发起阶段回顾。',
      occurredAt: null,
    }),
    recordFixture(ids.$first!, {
      id: '$old2',
      title: '虚构：保留原始来源',
      markdown: '每个版本都保留来源，方便之后核对。',
      occurredAt: 1794182400000,
    }),
  ]);
  for (const item of records.allocations) ids[item.localRef] = item.id;
  const settled = await saveRequirementFixture(base, projectId, records.receipt.version, [
    recordFixture(ids.$first!, {
      id: '$decision',
      title: '虚构：方案已经明确',
      markdown: '当时的方案依据：回顾后记录结论，保留原决定。',
      occurredAt: null,
    }),
    progressFixture(ids.$first!, {
      to: 'ready_for_implementation',
      ...{
        kind: 'progress',
        reasonMd: '已经讨论并明确回顾与来源方案。',
        records: [{ kind: 'in_batch', id: '$decision' }],
      },
    }),
  ]);
  for (const value of settled.allocations) ids[value.localRef] = value.id;
  const corrected = await saveRequirementFixture(base, projectId, settled.receipt.version, [
    recordFixture(ids.$first!, {
      id: ids.$old1!,
      title: '虚构：先确定回顾方式',
      markdown: '更正后的决定：用户主动发起回顾，Agent 根据材料一次补齐。',
      occurredAt: null,
    }),
    requirementFixture({
      id: ids.$first!,
      title: '虚构：看清需求如何演变',
      markdown: '用户需要理解需求推进的过程、保留原始来源，并能回看旧版本。',
    }),
  ]);
  return { ids, initial, records, settled, corrected, version: corrected.receipt.version };
}
