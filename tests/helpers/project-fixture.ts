import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { APIRequestContext } from '@playwright/test';
import { createProjectResponseSchema } from '../../src/contracts/projects-http.js';
import type { ProjectOverviewContent } from '../../src/contracts/content/overview.js';
import { mcpResultSchema } from '../../src/contracts/mcp.js';

export async function createFixture(request: APIRequestContext, name: string) {
  const response = await request.post('/api/projects', {
    data: { operationId: randomUUID(), name },
  });
  if (!response.ok()) throw new Error(`测试项目创建失败：${response.status()}`);
  return createProjectResponseSchema.parse(await response.json());
}

export async function saveFixtureOverview(
  base: string,
  projectId: string,
  content: ProjectOverviewContent,
  baseVersion = 0,
  expectedRevision: number | null = null,
) {
  const before =
    expectedRevision === null
      ? null
      : await (
          await fetch(
            new URL(
              `/api/projects/${encodeURIComponent(projectId)}/overview?version=${baseVersion}`,
              base,
            ),
          )
        ).json();
  const client = new Client({ name: 'fictional-browser-fixture', version: '0.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base)));
    const raw = await client.callTool({
      name: 'save_changes',
      arguments: {
        projectId,
        requestKey: `browser-fixture-${randomUUID()}`,
        baseVersion,
        sources: [
          {
            id: '$material',
            kind: 'document',
            rawText: JSON.stringify({
              fixture: 'Fictional browser test, not user history',
              before,
              after: content,
            }),
          },
        ],
        changes: [
          {
            action: 'upsert',
            objectType: 'overview',
            id: projectId,
            expectedRevision,
            content,
            citations: [
              ...(expectedRevision === null
                ? []
                : [
                    {
                      sourceId: '$material',
                      side: 'before',
                      path: '',
                      explanationMd: 'The fixture explicitly includes the preceding content.',
                    },
                  ]),
              {
                sourceId: '$material',
                side: 'after',
                path: '',
                explanationMd: 'Fictional test source supports this complete fixture.',
              },
            ],
          },
        ],
      },
    });
    const result = mcpResultSchema.parse(raw.structuredContent);
    if (raw.isError || result.error) throw new Error(JSON.stringify(result));
  } finally {
    await client.close();
  }
}
