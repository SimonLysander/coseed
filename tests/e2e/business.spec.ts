import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createFixture } from '../helpers/project-fixture.js';
import { seedBusinessFixture } from '../helpers/business-fixture.js';
import { fixtureCitations, saveRequirementFixture } from '../helpers/requirements-fixture.js';
import { chooseAppearance } from '../helpers/appearance.js';

test('reads and renders the full business fixture with module navigation and crossing notes', async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  const project = await createFixture(request, `虚构业务图测试 ${randomUUID().slice(0, 6)}`);
  const { ids } = await seedBusinessFixture(baseURL!, project.projectId);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/#/projects/${project.projectId}/business`);
  await expect(page.getByRole('heading', { name: '虚构业务全景', exact: true })).toBeVisible();
  const canvas = page.getByRole('region', { name: '业务设计画布', exact: true });
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await expect(canvas.locator('.business-card')).toHaveCount(4);
  await canvas.getByRole('button', { name: '查看内部', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/business/diagrams/${ids.$internal}\\?version=1$`));
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await expect(canvas.locator('.business-card')).toHaveCount(13);
  await expect(page.locator('.business-measurement')).toHaveCount(0);
  await expect(canvas.locator('.business-note')).toHaveCount(2);
  await expect(canvas.locator('.business-card-note')).toHaveCount(1);
  await expect(canvas.locator('.business-edge-label')).toHaveCount(13);
  await expect(canvas.getByText('返回待确认', { exact: false })).toBeVisible();
  await expect(canvas.getByText('结束使用（账号标识）：无返回', { exact: true })).toBeVisible();
  await expect(
    canvas.getByText('读取套餐（套餐标识）：套餐席位数量', { exact: true }),
  ).toBeVisible();
  await expect(
    canvas.getByText('建立持有（账号、企业；新增企业持有关系）', { exact: true }),
  ).toBeVisible();
  await expect(
    canvas.getByText('账号分配已变更（账号标识、企业持有标识）', { exact: true }),
  ).toBeVisible();
  // X6 embeds an XHTML body per card; page-level body CSS must not enlarge it.
  const sizing = await canvas
    .locator('.business-card, .business-note, .business-edge-label')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const foreign = node.closest('foreignObject')!;
        return {
          card: node.getBoundingClientRect().width,
          frame: foreign.getBoundingClientRect().width,
        };
      }),
    );
  for (const size of sizing) expect(Math.abs(size.card - size.frame)).toBeLessThan(1);

  await page.screenshot({
    path: testInfo.outputPath('business-reading.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '适应画布', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('business-internal-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const viewport = canvas.locator('.x6-graph-svg-viewport');
  const beforeTheme = await viewport.getAttribute('transform');
  const positions = await canvas
    .locator('.business-card')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.closest('.x6-node')!.getAttribute('transform')),
    );
  await chooseAppearance(page, 'dark');
  expect(await viewport.getAttribute('transform')).toBe(beforeTheme);
  expect(
    await canvas
      .locator('.business-card')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.closest('.x6-node')!.getAttribute('transform')),
      ),
  ).toEqual(positions);
  await page.screenshot({
    path: testInfo.outputPath('business-internal-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const beforeZoom = await page.locator('.business-scale').innerText();
  await page.getByRole('button', { name: '放大业务图', exact: true }).click();
  await expect(page.locator('.business-scale')).not.toHaveText(beforeZoom);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 30);
  const beforePan = await viewport.getAttribute('transform');
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 110, { steps: 5 });
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute('transform', beforePan!);
  await page.setViewportSize({ width: 1000, height: 760 });
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  expect(
    await canvas
      .locator('.business-card')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.closest('.x6-node')!.getAttribute('transform')),
      ),
  ).toEqual(positions);
  for (let i = 0; i < 2; i++) {
    await page.locator('.sidebar').getByRole('menuitem', { name: '项目综述', exact: true }).click();
    await page.goto(
      `/#/projects/${project.projectId}/business/diagrams/${ids.$internal}?version=1`,
    );
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await expect(canvas.locator('.business-card')).toHaveCount(13);
  }
  await page.reload();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(canvas.locator('.business-card button')).toHaveCount(0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('business empty states do not load graph engines or fabricate content', async ({
  page,
  request,
}) => {
  const project = await createFixture(request, `虚构空图 ${randomUUID()}`);
  const urls: string[] = [];
  page.on('request', (req) => urls.push(req.url()));
  await page.goto(`/#/projects/${project.projectId}/business`);
  await expect(page.getByRole('heading', { name: '还没有业务设计图', exact: true })).toBeVisible();
  expect(urls.some((url) => url.includes('elk-worker') || url.includes('BusinessCanvas-'))).toBe(
    false,
  );
  await page.goto(`/#/projects/${project.projectId}/business?version=-1`);
  await expect(page.getByText('项目版本无效', { exact: true })).toBeVisible();
  await page.goto(`/#/projects/${project.projectId}/business/diagrams/missing`);
  await expect(page.getByText('无法打开业务设计图', { exact: true })).toBeVisible();
});

test('module links pin a project version while current graphs reflect shared node revisions', async ({
  page,
  request,
  baseURL,
}) => {
  const project = await createFixture(request, `虚构图版本 ${randomUUID()}`);
  const { ids } = await seedBusinessFixture(baseURL!, project.projectId);
  const endpoint = `${baseURL}/api/projects/${project.projectId}/business/diagrams/${ids.$internal}`;
  const old = await (await request.get(endpoint)).json();
  const entity = old.bundle.entities.find((item: { id: string }) => item.id === ids.$assign);
  await saveRequirementFixture(baseURL!, project.projectId, 1, [
    {
      action: 'upsert',
      objectType: 'entity',
      id: entity.id,
      expectedRevision: 1,
      content: { ...entity.content, summary: '修订后的分配职责，仅作为虚构浏览器测试。' },
      citations: [
        ...fixtureCitations(),
        {
          sourceId: entity.content.primarySourceId,
          side: 'after',
          path: '/primarySourceId',
          explanationMd: '沿用核心实现来源。',
        },
      ],
    },
  ]);
  await page.goto(`/#/projects/${project.projectId}/business/diagrams/${ids.$internal}?version=1`);
  const canvas = page.getByRole('region', { name: '业务设计画布', exact: true });
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(
    canvas.getByText('修订后的分配职责，仅作为虚构浏览器测试。', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '查看当前版本', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(
    canvas.getByText('修订后的分配职责，仅作为虚构浏览器测试。', { exact: true }),
  ).toHaveCount(1);
  await expect(page.locator('.business-meta').first()).toContainText('项目版本 2');
  const other = await createFixture(request, `虚构隔离 ${randomUUID()}`);
  await page.goto(`/#/projects/${other.projectId}/business/diagrams/${ids.$internal}`);
  await expect(page.getByText('无法打开业务设计图', { exact: true })).toBeVisible();
  await expect(page.locator('.business-card')).toHaveCount(0);
});
