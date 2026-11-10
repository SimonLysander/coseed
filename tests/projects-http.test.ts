import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApplication } from '../dist/server/application.js';
import { ProjectContentService } from '../dist/server/modules/project-content/project-content.service.js';
import {
  createProjectResponseSchema,
  projectListResponseSchema,
  projectOverviewResponseSchema,
  projectResponseSchema,
} from '../src/contracts/projects-http.js';
import example from '../docs/database/overview-content.example.json' with { type: 'json' };

describe('project HTTP reading and creation over real SQLite', () => {
  let app: Awaited<ReturnType<typeof createApplication>>;
  let directory: string;
  let base: string;
  let client: Client;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coseed-projects-http-'));
    app = await createApplication(
      { host: '127.0.0.1', port: 0, dataDir: directory, logLevel: 'silent' },
      { serveWeb: false },
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    client = new Client({ name: 'fictional-project-http-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  });
  afterAll(async () => {
    await client?.close();
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const post = (body: unknown, headers = {}) =>
    fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const create = async (name: string) => {
    const input = { operationId: randomUUID(), name };
    const response = await post(input);
    expect(response.status).toBe(201);
    return { input, result: createProjectResponseSchema.parse(await response.json()) };
  };

  it('creates an empty project with a genuine web provenance and retries without duplicates', async () => {
    const { input, result } = await create('Fictional HTTP creation');
    expect(result.version).toBe(0);
    expect(createProjectResponseSchema.parse(await (await post(input)).json())).toEqual(result);
    const changed = await post({ ...input, name: 'Different creation intent' });
    expect(changed.status).toBe(409);
    const project = projectResponseSchema.parse(
      await (await fetch(`${base}/api/projects/${result.projectId}`)).json(),
    );
    expect(project.project).toMatchObject({
      id: result.projectId,
      name: input.name,
      version: 0,
      repositoryLocator: null,
    });
    const read = await fetch(`${base}/api/projects/${result.projectId}/overview`);
    expect(read.headers.get('cache-control')).toBe('no-store');
    expect(projectOverviewResponseSchema.parse(await read.json()).overview).toBeNull();
    const receipt = app
      .get(ProjectContentService)
      .getOperation(result.projectId, result.operationId);
    expect(receipt).toMatchObject({ entrypoint: 'web', actorKind: 'human', version: 0 });
    expect(receipt.actorLabel).toContain('未认证');
  });

  it('paginates explicit project discovery and uses literal substring search', async () => {
    await create('Fictional page 1');
    await create('Fictional page 2');
    const first = projectListResponseSchema.parse(
      await (await fetch(`${base}/api/projects?name=Fictional%20page&limit=1`)).json(),
    );
    expect(first.items).toHaveLength(1);
    expect(first.nextAfterId).toBeTruthy();
    const next = projectListResponseSchema.parse(
      await (
        await fetch(
          `${base}/api/projects?name=Fictional%20page&limit=1&afterId=${first.nextAfterId}`,
        )
      ).json(),
    );
    expect(next.items).toHaveLength(1);
    expect(next.nextAfterId).toBeNull();
    expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
    const symbols = projectListResponseSchema.parse(
      await (await fetch(`${base}/api/projects?name=%25%27%20OR%201%3D1`)).json(),
    );
    expect(symbols.items).toHaveLength(0);
  });

  it('reads MCP-saved content and project metadata from the same fixed version', async () => {
    const { result, input } = await create('Fictional original name');
    const save = async (requestKey: string, baseVersion: number, changes: unknown[]) => {
      const response = await client.callTool({
        name: 'save_changes',
        arguments: {
          projectId: result.projectId,
          requestKey,
          baseVersion,
          sources: [
            { id: '$evidence', kind: 'document', rawText: 'Explicitly fictional test material.' },
          ],
          changes,
        },
      });
      expect(response.isError).toBe(false);
    };
    const citations = [
      {
        sourceId: '$evidence',
        side: 'after',
        path: '',
        explanationMd: 'Fictional fixture supports the entire stated content.',
      },
    ];
    await save('overview', 0, [
      {
        action: 'upsert',
        objectType: 'overview',
        id: result.projectId,
        expectedRevision: null,
        content: example.content,
        citations,
      },
    ]);
    await save('rename-and-revise', 1, [
      {
        action: 'upsert',
        objectType: 'project',
        id: result.projectId,
        expectedRevision: 1,
        content: { name: 'Fictional new name', repositoryLocator: null },
        citations,
      },
      {
        action: 'upsert',
        objectType: 'overview',
        id: result.projectId,
        expectedRevision: 1,
        content: {
          ...example.content,
          product: { markdown: 'A newer fictional product description.' },
        },
        citations,
      },
    ]);
    const current = projectOverviewResponseSchema.parse(
      await (await fetch(`${base}/api/projects/${result.projectId}/overview`)).json(),
    );
    const old = projectOverviewResponseSchema.parse(
      await (await fetch(`${base}/api/projects/${result.projectId}/overview?version=1`)).json(),
    );
    expect(current.project).toMatchObject({ name: 'Fictional new name', version: 2 });
    expect(current.overview?.content.product.markdown).toBe(
      'A newer fictional product description.',
    );
    expect(old.project).toMatchObject({ name: 'Fictional original name', version: 1 });
    expect(old.overview?.content).toEqual(example.content);
    expect(old.overview?.savedAt).toEqual(expect.any(Number));
    expect(createProjectResponseSchema.parse(await (await post(input)).json())).toEqual(result);
  });

  it('does not load all design content for project metadata and overview reads', async () => {
    const { result } = await create('Fictional lightweight read');
    const spy = vi.spyOn(app.get(ProjectContentService), 'readSnapshot');
    try {
      expect((await fetch(`${base}/api/projects/${result.projectId}`)).status).toBe(200);
      expect((await fetch(`${base}/api/projects/${result.projectId}/overview`)).status).toBe(200);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects invalid input, forged metadata and foreign web origins before creating content', async () => {
    expect((await post({ operationId: randomUUID(), name: '   ' })).status).toBe(400);
    expect((await post({ operationId: 'made-up', name: 'Fictional' })).status).toBe(400);
    expect(
      (await post({ operationId: randomUUID(), name: 'Fictional', actorKind: 'system' })).status,
    ).toBe(400);
    expect(
      (
        await post(
          { operationId: randomUUID(), name: 'Fictional' },
          { Origin: 'https://example.com' },
        )
      ).status,
    ).toBe(403);
    expect((await fetch(`${base}/api/projects?limit=101`)).status).toBe(400);
    expect((await fetch(`${base}/api/projects?unknown=true`)).status).toBe(400);
    const id = (await create('Fictional bad versions')).result.projectId;
    expect((await fetch(`${base}/api/projects/${id}/overview?version=not-a-number`)).status).toBe(
      400,
    );
    expect((await fetch(`${base}/api/projects/${id}/overview?version=`)).status).toBe(400);
    expect((await fetch(`${base}/api/projects/${id}/overview?version=99`)).status).toBe(404);
    expect((await fetch(`${base}/api/projects/${randomUUID()}`)).status).toBe(404);
  });
});
