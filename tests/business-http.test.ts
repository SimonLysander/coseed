import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../dist/server/application.js';
import { ProjectContentService } from '../dist/server/modules/project-content/project-content.service.js';
import {
  businessIndexResponseSchema,
  businessDiagramResponseSchema,
} from '../src/contracts/business-http.js';
import { seedBusinessFixture } from './helpers/business-fixture.js';
import { fixtureCitations, saveRequirementFixture } from './helpers/requirements-fixture.js';
describe('business diagrams over real MCP saves and SQLite', () => {
  let app: Awaited<ReturnType<typeof createApplication>>, base: string, directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coseed-business-'));
    app = await createApplication(
      { host: '127.0.0.1', port: 0, dataDir: directory, logLevel: 'silent' },
      { serveWeb: false },
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const create = async () =>
    (
      await (
        await fetch(`${base}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationId: randomUUID(), name: 'Fictional business HTTP test' }),
        })
      ).json()
    ).projectId as string;
  const get = (projectId: string, path = '') =>
    fetch(`${base}/api/projects/${projectId}/business${path}`);
  it('returns an empty index rather than generating a fictional business diagram', async () => {
    const id = await create();
    const response = await get(id);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(businessIndexResponseSchema.parse(await response.json())).toMatchObject({
      diagrams: [],
      landingDiagramId: null,
    });
  });
  it('resolves a selected diagram with owners, code paths and crossing design notes from the same version', async () => {
    const projectId = await create(),
      { ids } = await seedBusinessFixture(base, projectId);
    const index = businessIndexResponseSchema.parse(await (await get(projectId)).json());
    expect(index.diagrams).toHaveLength(2);
    expect(index.landingDiagramId).toBe(ids.$overview);
    const graph = businessDiagramResponseSchema.parse(
      await (await get(projectId, `/diagrams/${ids.$internal}`)).json(),
    );
    expect(graph.project.version).toBe(1);
    expect(graph.bundle.projectVersion).toBe(1);
    expect(graph.bundle.relationships).toHaveLength(13);
    expect(graph.bundle.entities).toHaveLength(17);
    expect(graph.bundle.notes).toHaveLength(3);
    expect(graph.sourcePaths.every((source) => source.path.startsWith('src/modules/'))).toBe(true);
    expect(graph.moduleDiagrams.map((d) => d.id)).toContain(ids.$internal);
    expect(JSON.stringify(graph)).not.toContain('Explicitly fictional fixture');
  });
  it('uses revised shared nodes in the current graph without changing the diagram revision and preserves the old graph', async () => {
    const projectId = await create(),
      { ids } = await seedBusinessFixture(base, projectId);
    const service = app.get(ProjectContentService);
    const original = service.readRevision(projectId, 'entity', ids.$assign!, 1);
    const source = original.content.primarySourceId as string;
    await saveRequirementFixture(base, projectId, 1, [
      {
        action: 'upsert',
        objectType: 'entity',
        id: ids.$assign,
        expectedRevision: 1,
        content: { ...original.content, summary: '已经更正的分配职责。' },
        citations: [
          ...fixtureCitations(),
          {
            sourceId: source,
            side: 'after',
            path: '/primarySourceId',
            explanationMd: '沿用原核心实现来源。',
          },
        ],
      },
    ]);
    const current = businessDiagramResponseSchema.parse(
      await (await get(projectId, `/diagrams/${ids.$internal}`)).json(),
    );
    const old = businessDiagramResponseSchema.parse(
      await (await get(projectId, `/diagrams/${ids.$internal}?version=1`)).json(),
    );
    expect(current.diagram.revisionNo).toBe(1);
    expect(current.project.version).toBe(2);
    expect(current.bundle.entities.find((item) => item.id === ids.$assign)!.content.summary).toBe(
      '已经更正的分配职责。',
    );
    expect(old.project.version).toBe(1);
    expect(old.bundle.entities.find((item) => item.id === ids.$assign)!.content.summary).toBe(
      original.content.summary,
    );
  });
  it('does not load requirement history or the full project snapshot for a diagram read and isolates projects', async () => {
    const projectId = await create(),
      { ids } = await seedBusinessFixture(base, projectId),
      other = await create();
    const spy = vi.spyOn(app.get(ProjectContentService), 'readSnapshot');
    try {
      expect((await get(projectId, `/diagrams/${ids.$internal}`)).status).toBe(200);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect((await get(other, `/diagrams/${ids.$internal}`)).status).toBe(404);
    expect((await get(projectId, '/diagrams/not-a-diagram')).status).toBe(404);
    expect((await get(projectId, `?version=99`)).status).toBe(404);
    expect((await get(projectId, '?version=')).status).toBe(400);
    expect((await get(projectId, '?unknown=true')).status).toBe(400);
  });
});
