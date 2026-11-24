import { seedGraphChanges } from './helpers/staged-graph-fixture.js';
import { buildBusinessFixture } from './helpers/business-fixture.js';
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
  requirementFixture,
  recordFixture,
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

  it('filters all pages by scope and concern, keeps facets stable and validates module identity', async () => {
    const projectId = await create();
    const graph = buildBusinessFixture();
    const saved = await seedGraphChanges(
      base,
      projectId,
      [
        ...graph.changes,
        ...Array.from({ length: 32 }, (_, n) =>
          requirementFixture({
            id: `$req${n}`,
            title: `虚构模块需求 ${n}`,
            markdown: '完整业务说明保留。',
            scope: {
              kind: 'modules',
              moduleIds: n % 2 ? ['$accounts', '$billing'] : ['$accounts'],
            },
            primaryConcern: n % 2 ? 'usability' : 'functionality',
            initialStatus: 'designing',
          }),
        ),
        requirementFixture({
          id: '$global',
          title: '虚构全局需求',
          markdown: '全局能力。',
          primaryConcern: 'security',
          initialStatus: 'on_hold',
        }),
      ],
      '虚构分类筛选测试',
      graph.sources,
    );
    const ids = Object.fromEntries(saved.allocations.map((item) => [item.localRef, item.id]));
    const parseList = async (query: string) =>
      requirementsResponseSchema.parse(
        await (await get(projectId, `requirements?${query}`)).json(),
      );
    const first = await parseList(
      `scope=${ids.$billing}&concern=usability&status=designing&limit=5`,
    );
    expect(first.items).toHaveLength(5);
    expect(
      first.items.every((item) => item.scopeNames.join('、') === '账号供给与履约、计费与资金'),
    ).toBe(true);
    expect(first.filters.scopes).toEqual(
      expect.arrayContaining([
        { value: 'project', label: '整个项目' },
        { value: ids.$billing, label: '计费与资金' },
      ]),
    );
    const global = await parseList('scope=project&concern=security');
    expect(global.items.map((item) => item.id)).toEqual([ids.$global]);
    expect((await parseList(`scope=${ids.$billing}&concern=security`)).items).toEqual([]);
    await saveRequirementFixture(base, projectId, saved.receipt.version, [
      requirementFixture({
        id: '$later',
        title: '新需求',
        markdown: '后来保存。',
        scope: { kind: 'modules', moduleIds: [ids.$billing] },
        primaryConcern: 'usability',
        initialStatus: 'designing',
      }),
    ]);
    const remainder = await parseList(
      `version=${saved.receipt.version}&scope=${ids.$billing}&concern=usability&status=designing&afterId=${first.nextAfterId}&limit=30`,
    );
    expect(remainder.items).toHaveLength(11);
    expect(remainder.filters).toEqual(first.filters);
    const detail = requirementResponseSchema.parse(
      await (await get(projectId, `requirements/${ids.$req1}`)).json(),
    );
    expect(detail.scopeNames).toEqual(['账号供给与履约', '计费与资金']);
    expect(detail.requirement.content.markdown).toBe('完整业务说明保留。');
    for (const moduleId of [ids.$vendor!, ids.$entry!, 'missing-module']) {
      await expect(
        saveRequirementFixture(base, projectId, saved.receipt.version + 1, [
          requirementFixture({
            id: '$invalid',
            title: '非法范围',
            markdown: '虚构。',
            scope: { kind: 'modules', moduleIds: [moduleId] },
            initialStatus: 'designing',
          }),
        ]),
      ).rejects.toThrow(/INVALID_REFERENCE/);
    }
    const missingFields = {
      route: 'requirements.items',
      input: {
        items: [
          { id: '$missing', title: '缺少分类', markdown: '虚构。', initialStatus: 'designing' },
        ],
      },
      citations: fixtureCitations(),
    };
    await expect(
      saveRequirementFixture(base, projectId, saved.receipt.version + 1, [missingFields]),
    ).rejects.toThrow();
    expect((await parseList('')).project.version).toBe(saved.receipt.version + 1);
  });

  it('returns an honest empty list without adding fictional requirements', async () => {
    const projectId = await create();
    const response = await get(projectId, 'requirements');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const value = requirementsResponseSchema.parse(await response.json());
    expect(value.project.version).toBe(0);
    expect(value.items).toEqual([]);
    expect(value.nextAfterId).toBeNull();
  });

  it('keeps creation order and separates status changes from text revisions', async () => {
    const clock = vi.spyOn(Date, 'now');
    let time = 1794268800000;
    clock.mockImplementation(() => time++);
    try {
      const { projectId, ids, settled, corrected } = await seed();
      const list = requirementsResponseSchema.parse(
        await (await get(projectId, 'requirements')).json(),
      );
      expect(list.items.map((r) => r.id)).toEqual([ids.$first!, ids.$second!].sort());
      const primary = list.items.find((r) => r.id === ids.$first)!;
      expect(primary.recentRecords.map((r) => r.id)).toEqual([ids.$decision, ids.$old2]);
      expect(list.items.find((r) => r.id === ids.$second)!.recentRecords).toEqual([]);
      expect(primary).toMatchObject({
        revisionNo: 3,
        recordCount: 3,
        status: 'ready_for_implementation',
        statusChangedAt: settled.receipt.savedAt,
        savedAt: corrected.receipt.savedAt,
      });
      expect(primary.statusChangedAt).toBeLessThan(primary.savedAt);
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
    const { projectId, ids, version } = await seed();
    const first = requirementsResponseSchema.parse(
      await (await get(projectId, 'requirements?limit=1')).json(),
    );
    const order = [ids.$first!, ids.$second!].sort();
    expect(first.items.map((r) => r.id)).toEqual([order[0]]);
    await saveRequirementFixture(base, projectId, version, [
      requirementFixture({
        id: ids.$second!,
        title: '虚构：另一需求已补充设计',
        markdown: '单独修改当前需求说明。',
      }),
    ]);
    const second = requirementsResponseSchema.parse(
      await (
        await get(projectId, `requirements?limit=1&version=${version}&afterId=${first.nextAfterId}`)
      ).json(),
    );
    expect(second.items.map((r) => r.id)).toEqual([order[1]]);
    expect(second.project.version).toBe(version);
    expect(second.nextAfterId).toBeNull();
    expect(
      requirementsResponseSchema.parse(await (await get(projectId, 'requirements')).json())
        .items[0]!.id,
    ).toBe(order[0]);
  });

  it('does not move an older requirement after an update', async () => {
    const { projectId, ids, version } = await seed();
    const added = await saveRequirementFixture(base, projectId, version, [
      requirementFixture({
        id: '$new',
        title: '虚构：后来创建的需求',
        markdown: '新需求的预览。',
        initialStatus: 'designing',
      }),
    ]);
    const newest = added.allocations.find((x) => x.localRef === '$new')!.id;
    const before = requirementsResponseSchema.parse(
      await (await get(projectId, 'requirements')).json(),
    );
    expect(before.items[0]!.id).toBe(newest);
    await saveRequirementFixture(base, projectId, added.receipt.version, [
      requirementFixture({
        id: ids.$first!,
        title: '虚构：看清需求如何演变',
        markdown: '后来更正的预览。',
      }),
    ]);
    const after = requirementsResponseSchema.parse(
      await (await get(projectId, 'requirements')).json(),
    );
    expect(after.items.map((x) => x.id)).toEqual(before.items.map((x) => x.id));
    expect(after.items.find((x) => x.id === ids.$first)!.markdown).toBe('后来更正的预览。');
    const historic = requirementsResponseSchema.parse(
      await (await get(projectId, `requirements?version=${added.receipt.version}`)).json(),
    );
    expect(historic.items.find((x) => x.id === ids.$first)!.markdown).toBe(
      '用户需要理解需求推进的过程、保留原始来源，并能回看旧版本。',
    );
  });

  it('orders each current record once by first capture, including corrections and backfills', async () => {
    const { projectId, ids, version, records, settled } = await seed();
    const current = recordsResponseSchema.parse(
      await (await get(projectId, `requirements/${ids.$first}/records?version=${version}`)).json(),
    );
    expect(current.items.map((r) => r.id)).toEqual([ids.$decision, ids.$old2, ids.$old1]);
    expect(current.items[2]!.revisionNo).toBe(2);
    expect(current.items[2]!.captureVersion).toBe(records.receipt.version);
    expect(current.items[2]!.content.occurredAt).toBeNull();
    expect(current.items[2]!.content.markdown).toContain('更正后的决定');
    const old = recordsResponseSchema.parse(
      await (
        await get(
          projectId,
          `requirements/${ids.$first}/records?version=${settled.receipt.version}`,
        )
      ).json(),
    );
    expect(old.items[2]!.revisionNo).toBe(1);
    expect(old.items[2]!.content.markdown).toContain('原始决定');
    const first = recordsResponseSchema.parse(
      await (
        await get(projectId, `requirements/${ids.$first}/records?version=${version}&limit=1`)
      ).json(),
    );
    const backfill = await saveRequirementFixture(base, projectId, version, [
      recordFixture(ids.$first!, {
        id: '$backfill',
        title: '虚构：补录旧决定',
        markdown: '今天才收录这份更早的决定。',
        occurredAt: 1,
      }),
    ]);
    const page = recordsResponseSchema.parse(
      await (
        await get(
          projectId,
          `requirements/${ids.$first}/records?version=${version}&limit=1&afterId=${first.nextAfterId}`,
        )
      ).json(),
    );
    expect(page.items[0]!.id).toBe(ids.$old2);
    expect(
      recordsResponseSchema.parse(
        await (
          await get(
            projectId,
            `requirements/${ids.$first}/records?version=${backfill.receipt.version}`,
          )
        ).json(),
      ).items[0]!.content.title,
    ).toBe('虚构：补录旧决定');
  });

  it('keeps old state evidence fixed even after the supporting record is revised', async () => {
    const { projectId, ids, version } = await seed();
    const updated = await saveRequirementFixture(base, projectId, version, [
      recordFixture(ids.$first!, {
        id: ids.$decision!,
        title: '虚构：方案已经明确',
        markdown: '后来的更正，不能替换当时那一份依据。',
        occurredAt: null,
      }),
    ]);
    const history = historyResponseSchema.parse(
      await (
        await get(
          projectId,
          `history/requirement/${ids.$first}?version=${updated.receipt.version}&limit=2`,
        )
      ).json(),
    );
    expect(history.items.map((r) => r.revisionNo)).toEqual([3, 2]);
    expect(history.nextBeforeRevision).toBe(2);
    const settled = history.items[1]!;
    expect(settled.objectType === 'requirement' && settled.statusChange?.records).toEqual([
      { id: ids.$decision, revisionNo: 1 },
    ]);
    const source = revisionResponseSchema.parse(
      await (
        await get(
          projectId,
          `history/record/${ids.$decision}/revisions/1?version=${updated.receipt.version}`,
        )
      ).json(),
    );
    expect(source.revision.content.markdown).toContain('当时的方案依据');
    expect(source.revision.actor.entrypoint).toBe('mcp');
    expect(source.revision.actor.actorLabel).toBe('项目 MCP Agent');
    expect(source.sources[0]!.rawText).toContain('虚构需求测试');
    const last = historyResponseSchema.parse(
      await (
        await get(
          projectId,
          `history/requirement/${ids.$first}?version=${updated.receipt.version}&limit=2&beforeRevision=2`,
        )
      ).json(),
    );
    expect(last.items.map((r) => r.revisionNo)).toEqual([1]);
    expect(last.nextBeforeRevision).toBeNull();
  });

  it('removes records from the current timeline while retaining tombstones and reassignment history', async () => {
    const { projectId, ids, version } = await seed();
    const moved = await saveRequirementFixture(base, projectId, version, [
      recordFixture(ids.$second!, {
        id: ids.$old1!,
        title: '虚构：先确定回顾方式',
        markdown: '更正归属，保留旧需求中的版本。',
        occurredAt: null,
      }),
    ]);
    expect(
      recordsResponseSchema.parse(
        await (
          await get(
            projectId,
            `requirements/${ids.$first}/records?version=${moved.receipt.version}`,
          )
        ).json(),
      ).items,
    ).toHaveLength(2);
    expect(
      recordsResponseSchema.parse(
        await (
          await get(
            projectId,
            `requirements/${ids.$second}/records?version=${moved.receipt.version}`,
          )
        ).json(),
      ).items[0]!.id,
    ).toBe(ids.$old1);
    const removed = await saveRequirementFixture(base, projectId, moved.receipt.version, [
      {
        route: 'objects.remove',
        input: { items: [{ objectType: 'record', id: ids.$old1, expectedRevision: 3 }] },
        citations: fixtureCitations('before'),
      },
    ]);
    expect(
      recordsResponseSchema.parse(
        await (
          await get(
            projectId,
            `requirements/${ids.$second}/records?version=${removed.receipt.version}`,
          )
        ).json(),
      ).items,
    ).toHaveLength(0);
    const history = historyResponseSchema.parse(
      await (
        await get(projectId, `history/record/${ids.$old1}?version=${removed.receipt.version}`)
      ).json(),
    );
    expect(history.items.map((r) => r.revisionNo)).toEqual([4, 3, 2, 1]);
    expect(history.items[0]!.isDeleted).toBe(true);
    expect(history.items[3]!.content).toMatchObject({ requirementId: ids.$first });
  });

  it('rejects missing versions, forged filters and foreign project objects without exposing their history', async () => {
    const { projectId, ids, version, records } = await seed();
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
    expect((await get(projectId, `history/entity/${ids.$first}?version=${version}`)).status).toBe(
      400,
    );
    expect(
      (await get(projectId, `history/record/${ids.$old1}/revisions/0?version=${version}`)).status,
    ).toBe(400);
    expect(
      (
        await get(
          projectId,
          `history/record/${ids.$old1}/revisions/2?version=${records.receipt.version}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await get(
          projectId,
          `requirements/${ids.$second}/records?version=${version}&afterId=${ids.$old1}`,
        )
      ).status,
    ).toBe(400);
  });

  it('does not load the whole project snapshot to read a requirement timeline', async () => {
    const { projectId, ids, version } = await seed();
    const spy = vi.spyOn(app.get(ProjectContentService), 'readSnapshot');
    try {
      expect((await get(projectId, 'requirements')).status).toBe(200);
      expect((await get(projectId, `requirements/${ids.$first}`)).status).toBe(200);
      expect(
        (await get(projectId, `requirements/${ids.$first}/records?version=${version}`)).status,
      ).toBe(200);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
