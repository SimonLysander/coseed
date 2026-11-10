import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../dist/server/application.js';
import { ProjectContentService } from '../dist/server/modules/project-content/project-content.service.js';
import {
  requirementsResponseSchema,
  requirementResponseSchema,
  recordsResponseSchema,
  historyResponseSchema,
  revisionResponseSchema,
} from '../src/contracts/requirements-http.js';
import {
  change,
  fixtureCitations,
  saveRequirementFixture,
  seedRequirementFixture,
} from './helpers/requirements-fixture.js';

describe('requirement HTTP read models over real MCP writes and SQLite', () => {
  let app: Awaited<ReturnType<typeof createApplication>>;
  let directory: string;
  let base: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coseed-requirements-http-'));
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
  const create = async () => {
    const response = await fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationId: randomUUID(),
        name: 'Fictional requirement HTTP fixture',
      }),
    });
    expect(response.status).toBe(201);
    return (await response.json()).projectId as string;
  };
  const seed = async () => {
    const projectId = await create();
    return { projectId, ...(await seedRequirementFixture(base, projectId)) };
  };
  const get = (projectId: string, path: string) =>
    fetch(`${base}/api/projects/${projectId}/${path}`);

  it('returns an honest empty list without adding fictional requirements', async () => {
    const projectId = await create();
    const response = await get(projectId, 'requirements');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const value = requirementsResponseSchema.parse(await response.json());
    expect(value.project.version).toBe(0);
    expect(value.items).toEqual([]);
    expect(value.nextAfterId).toBeNull();
  });

  it('lists recently updated requirements first and separates status changes from text revisions', async () => {
    const clock = vi.spyOn(Date, 'now');
    let time = 1794268800000;
    clock.mockImplementation(() => time++);
    try {
      const { projectId, ids, settled, corrected } = await seed();
      const list = requirementsResponseSchema.parse(
        await (await get(projectId, 'requirements')).json(),
      );
      expect(list.items.map((r) => r.id)).toEqual([ids.$first, ids.$second]);
      expect(list.items[0]).toMatchObject({
        revisionNo: 3,
        recordCount: 3,
        status: 'ready_for_implementation',
        statusChangedAt: settled.receipt.savedAt,
        savedAt: corrected.receipt.savedAt,
      });
      expect(list.items[0]!.statusChangedAt).toBeLessThan(list.items[0]!.savedAt);
      const detail = requirementResponseSchema.parse(
        await (await get(projectId, `requirements/${ids.$first}`)).json(),
      );
      expect(detail.requirement.statusChange).toBeNull();
      const filtered = requirementsResponseSchema.parse(
        await (await get(projectId, 'requirements?status=on_hold')).json(),
      );
      expect(filtered.items.map((r) => r.id)).toEqual([ids.$second]);
      expect(
        requirementsResponseSchema.parse(
          await (await get(projectId, 'requirements?name=%25%27%20OR%201%3D1')).json(),
        ).items,
      ).toEqual([]);
    } finally {
      clock.mockRestore();
    }
  });

  it('paginates requirements at a fixed project version despite later updates', async () => {
    const { projectId, ids } = await seed();
    const first = requirementsResponseSchema.parse(
      await (await get(projectId, 'requirements?limit=1')).json(),
    );
    expect(first.items.map((r) => r.id)).toEqual([ids.$first]);
    await saveRequirementFixture(base, projectId, 3, [
      change(
        'requirement',
        ids.$second!,
        {
          title: '虚构：另一需求已补充设计',
          markdown: '单独修改当前需求说明。',
          status: 'on_hold',
        },
        1,
      ),
    ]);
    const second = requirementsResponseSchema.parse(
      await (
        await get(projectId, `requirements?limit=1&version=3&afterId=${first.nextAfterId}`)
      ).json(),
    );
    expect(second.items.map((r) => r.id)).toEqual([ids.$second]);
    expect(second.project.version).toBe(3);
    expect(second.nextAfterId).toBeNull();
    expect(
      requirementsResponseSchema.parse(await (await get(projectId, 'requirements')).json())
        .items[0]!.id,
    ).toBe(ids.$second);
  });

  it('orders each current record once by first capture, including corrections and backfills', async () => {
    const { projectId, ids } = await seed();
    const current = recordsResponseSchema.parse(
      await (await get(projectId, `requirements/${ids.$first}/records?version=3`)).json(),
    );
    expect(current.items.map((r) => r.id)).toEqual([ids.$decision, ids.$old2, ids.$old1]);
    expect(current.items[2]!.revisionNo).toBe(2);
    expect(current.items[2]!.captureVersion).toBe(1);
    expect(current.items[2]!.content.occurredAt).toBeNull();
    expect(current.items[2]!.content.markdown).toContain('更正后的决定');
    const old = recordsResponseSchema.parse(
      await (await get(projectId, `requirements/${ids.$first}/records?version=2`)).json(),
    );
    expect(old.items[2]!.revisionNo).toBe(1);
    expect(old.items[2]!.content.markdown).toContain('原始决定');
    const first = recordsResponseSchema.parse(
      await (await get(projectId, `requirements/${ids.$first}/records?version=3&limit=1`)).json(),
    );
    await saveRequirementFixture(base, projectId, 3, [
      change('record', '$backfill', {
        requirementId: ids.$first,
        title: '虚构：补录旧决定',
        markdown: '今天才收录这份更早的决定。',
        occurredAt: 1,
      }),
    ]);
    const page = recordsResponseSchema.parse(
      await (
        await get(
          projectId,
          `requirements/${ids.$first}/records?version=3&limit=1&afterId=${first.nextAfterId}`,
        )
      ).json(),
    );
    expect(page.items[0]!.id).toBe(ids.$old2);
    expect(
      recordsResponseSchema.parse(
        await (await get(projectId, `requirements/${ids.$first}/records?version=4`)).json(),
      ).items[0]!.content.title,
    ).toBe('虚构：补录旧决定');
  });

  it('keeps old state evidence fixed even after the supporting record is revised', async () => {
    const { projectId, ids } = await seed();
    await saveRequirementFixture(base, projectId, 3, [
      change(
        'record',
        ids.$decision!,
        {
          requirementId: ids.$first,
          title: '虚构：方案已经明确',
          markdown: '后来的更正，不能替换当时那一份依据。',
          occurredAt: null,
        },
        1,
      ),
    ]);
    const history = historyResponseSchema.parse(
      await (await get(projectId, `history/requirement/${ids.$first}?version=4&limit=2`)).json(),
    );
    expect(history.items.map((r) => r.revisionNo)).toEqual([3, 2]);
    expect(history.nextBeforeRevision).toBe(2);
    const settled = history.items[1]!;
    expect(settled.objectType === 'requirement' && settled.statusChange?.records).toEqual([
      { id: ids.$decision, revisionNo: 1 },
    ]);
    const source = revisionResponseSchema.parse(
      await (await get(projectId, `history/record/${ids.$decision}/revisions/1?version=4`)).json(),
    );
    expect(source.revision.content.markdown).toContain('当时的方案依据');
    expect(source.revision.actor.entrypoint).toBe('mcp');
    expect(source.revision.actor.actorLabel).toContain('未认证');
    expect(source.sources[0]!.rawText).toContain('虚构需求测试');
    const last = historyResponseSchema.parse(
      await (
        await get(projectId, `history/requirement/${ids.$first}?version=4&limit=2&beforeRevision=2`)
      ).json(),
    );
    expect(last.items.map((r) => r.revisionNo)).toEqual([1]);
    expect(last.nextBeforeRevision).toBeNull();
  });

  it('removes records from the current timeline while retaining tombstones and reassignment history', async () => {
    const { projectId, ids } = await seed();
    await saveRequirementFixture(base, projectId, 3, [
      change(
        'record',
        ids.$old1!,
        {
          requirementId: ids.$second,
          title: '虚构：先确定回顾方式',
          markdown: '更正归属，保留旧需求中的版本。',
          occurredAt: null,
        },
        2,
      ),
    ]);
    expect(
      recordsResponseSchema.parse(
        await (await get(projectId, `requirements/${ids.$first}/records?version=4`)).json(),
      ).items,
    ).toHaveLength(2);
    expect(
      recordsResponseSchema.parse(
        await (await get(projectId, `requirements/${ids.$second}/records?version=4`)).json(),
      ).items[0]!.id,
    ).toBe(ids.$old1);
    await saveRequirementFixture(base, projectId, 4, [
      {
        action: 'remove',
        objectType: 'record',
        id: ids.$old1,
        expectedRevision: 3,
        citations: fixtureCitations('before'),
      },
    ]);
    expect(
      recordsResponseSchema.parse(
        await (await get(projectId, `requirements/${ids.$second}/records?version=5`)).json(),
      ).items,
    ).toHaveLength(0);
    const history = historyResponseSchema.parse(
      await (await get(projectId, `history/record/${ids.$old1}?version=5`)).json(),
    );
    expect(history.items.map((r) => r.revisionNo)).toEqual([4, 3, 2, 1]);
    expect(history.items[0]!.isDeleted).toBe(true);
    expect(history.items[3]!.content).toMatchObject({ requirementId: ids.$first });
  });

  it('rejects missing versions, forged filters and foreign project objects without exposing their history', async () => {
    const { projectId, ids } = await seed();
    const other = await create();
    expect((await get(other, `requirements/${ids.$first}`)).status).toBe(404);
    expect((await get(other, `history/record/${ids.$old1}?version=0`)).status).toBe(404);
    expect((await get(other, `history/record/${ids.$old1}/revisions/1?version=0`)).status).toBe(
      404,
    );
    expect((await get(projectId, `requirements/${ids.$first}/records`)).status).toBe(400);
    expect((await get(projectId, 'requirements?version=')).status).toBe(400);
    expect((await get(projectId, 'requirements?limit=101')).status).toBe(400);
    expect((await get(projectId, 'requirements?status=made_up')).status).toBe(400);
    expect((await get(projectId, 'requirements?actorKind=human')).status).toBe(400);
    expect((await get(projectId, `history/entity/${ids.$first}?version=3`)).status).toBe(400);
    expect((await get(projectId, `history/record/${ids.$old1}/revisions/0?version=3`)).status).toBe(
      400,
    );
    expect((await get(projectId, `history/record/${ids.$old1}/revisions/2?version=1`)).status).toBe(
      404,
    );
    expect(
      (await get(projectId, `requirements/${ids.$second}/records?version=3&afterId=${ids.$old1}`))
        .status,
    ).toBe(400);
  });

  it('does not load the whole project snapshot to read a requirement timeline', async () => {
    const { projectId, ids } = await seed();
    const spy = vi.spyOn(app.get(ProjectContentService), 'readSnapshot');
    try {
      expect((await get(projectId, 'requirements')).status).toBe(200);
      expect((await get(projectId, `requirements/${ids.$first}`)).status).toBe(200);
      expect((await get(projectId, `requirements/${ids.$first}/records?version=3`)).status).toBe(
        200,
      );
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
