import { seedGraphChanges } from '../helpers/staged-graph-fixture.js';
import { buildBusinessFixture } from '../helpers/business-fixture.js';
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createFixture } from '../helpers/project-fixture.js';
import {
  requirementFixture,
  recordFixture,
  saveRequirementFixture,
  seedRequirementFixture,
} from '../helpers/requirements-fixture.js';
import { chooseAppearance } from '../helpers/appearance.js';
const title = () => `虚构需求测试 ${randomUUID().slice(0, 6)}`;

test('combines scope and concern filters, clears selections and keeps the summary readable', async ({
  page,
  request,
  baseURL,
}) => {
  const project = await createFixture(request, title());
  const graph = buildBusinessFixture();
  await seedGraphChanges(
    baseURL!,
    project.projectId,
    [
      ...graph.changes,
      requirementFixture({
        id: '$scoped',
        title: '虚构：按模块阅读',
        markdown: '读者能看清模块的完整业务目标。',
        scope: { kind: 'modules', moduleIds: ['$accounts'] },
        primaryConcern: 'usability',
        initialStatus: 'designing',
      }),
      requirementFixture({
        id: '$global',
        title: '虚构：全局访问控制',
        markdown: '限制项目访问。',
        primaryConcern: 'security',
        initialStatus: 'on_hold',
      }),
    ],
    '虚构筛选测试',
    graph.sources,
  );
  await page.goto(`/#/projects/${project.projectId}/requirements`);
  const rows = page.locator('.requirement-list-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: '按模块阅读' }).locator('.requirement-preview')).toHaveText(
    '读者能看清模块的完整业务目标。',
  );
  await expect(
    page.locator('.requirement-scope').filter({ hasText: '账号供给与履约' }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: '按涉及范围筛选' }).click();
  await page.getByRole('option', { name: '账号供给与履约', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('.requirement-concern')).toHaveText('易用性');
  await page.getByRole('combobox', { name: '按主要关注点筛选' }).click();
  await page.getByRole('option', { name: '安全性', exact: true }).click();
  await expect(page.getByText('没有匹配的目标', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: '按模块阅读' }).click();
  await expect(page.locator('.requirement-current-status')).toContainText('账号供给与履约');
  await expect(page.locator('.requirement-current-status')).toContainText('易用性');
});

test('uses requirements as the first timeline nodes and opens only their own record timeline', async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  const project = await createFixture(request, title());
  const { ids, version } = await seedRequirementFixture(baseURL!, project.projectId);
  await saveRequirementFixture(baseURL!, project.projectId, version, [
    {
      route: 'overview.product',
      input: { markdown: '虚构测试项目。' },
      citations: [
        { sourceId: '$material', side: 'after', path: '', explanationMd: '虚构测试综述。' },
      ],
    },
    requirementFixture({
      id: ids.$first!,
      title: '虚构：看清需求如何演变',
      markdown: '保留需求说明及时间线。',
      links: [
        {
          target: { kind: 'overview', part: { kind: 'product' } },
          explanationMd: '不应出现在需求阅读页的关联说明。',
        },
      ],
    }),
    recordFixture(ids.$second!, {
      id: '$second-progress',
      title: '虚构：另一需求的记录',
      markdown: '单独属于另一项需求。',
      occurredAt: null,
      links: [
        {
          target: { kind: 'record', id: ids.$old1, revisionNo: 1 },
          explanationMd: '不应展示的承接入口。',
        },
      ],
    }),
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const route = `/#/projects/${project.projectId}/requirements`;
  await page.goto(route);
  await expect(page.locator('.requirement-list-row')).toHaveCount(2);
  await expect(page.locator('.progress-record')).toHaveCount(0);
  await expect(page.locator('.ant-collapse')).toHaveCount(0);
  const primary = page
    .locator('.requirement-subject')
    .filter({ hasText: '保留需求说明及时间线。' });
  await expect(primary.locator('.requirement-preview')).toBeVisible();
  await expect(primary.locator('.requirement-record-previews li')).toHaveCount(2);
  await expect(primary.locator('.requirement-record-previews')).toContainText('方案已经明确');
  await expect(primary.locator('.requirement-record-previews')).toContainText('保留原始来源');
  await expect(primary.locator('.requirement-preview-more')).toContainText('查看全部 3 条记录');
  await expect(primary.locator('.requirement-list-times')).toContainText('更新于');
  await expect(page.locator('.ant-timeline-item-title').first()).toContainText('创建于');
  await page.screenshot({
    path: testInfo.outputPath('requirements-preview-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await chooseAppearance(page, 'dark');
  await page.screenshot({
    path: testInfo.outputPath('requirements-preview-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect(page.locator('.requirement-subject > .progress-time')).toHaveCount(2);
    const summaryHeight = await primary
      .locator('.requirement-record-previews p')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(summaryHeight).toBeLessThanOrEqual(20);
  }
  await page.screenshot({
    path: testInfo.outputPath('requirements-preview-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: /虚构：看清需求如何演变/ }).click();
  await expect(page).toHaveURL(new RegExp(`/requirements/${ids.$first}$`));
  await expect(page.locator('.progress-record')).toHaveCount(3);
  await expect(
    page.getByRole('article', { name: '虚构：另一需求的记录', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('不应出现在需求阅读页的关联说明。', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '查看对应综述', exact: true })).toHaveCount(0);
  await page.goto(`/#/projects/${project.projectId}/requirements/${ids.$second}`);
  await expect(page.locator('.progress-record')).toHaveCount(1);
  await expect(page.getByText('不应展示的承接入口。', { exact: true })).toHaveCount(0);
});

test('opens the real empty requirements page from the sidebar without loading graph engines', async ({
  page,
  request,
}) => {
  const project = await createFixture(request, title());
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto(`/#/projects/${project.projectId}/overview`);
  await page.locator('.sidebar').getByRole('menuitem', { name: '时间线', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.projectId}/requirements$`));
  await expect(page.getByRole('heading', { name: '时间线', exact: true })).toBeVisible();
  await expect(page.getByText('还没有目标', { exact: true })).toBeVisible();
  expect(urls.some((url) => url.includes('elk-worker'))).toBe(false);
  await page.reload();
  await expect(page.getByText('还没有目标', { exact: true })).toBeVisible();
});

test('reads current requirements and records once, with latest progress before corrected older records', async ({
  page,
  request,
  baseURL,
}) => {
  const project = await createFixture(request, title());
  const fixture = await seedRequirementFixture(baseURL!, project.projectId);
  await page.goto(`/#/projects/${project.projectId}/requirements`);
  const links = page.locator('.requirement-list-row');
  await expect(links).toHaveCount(2);
  await expect(links.filter({ hasText: '看清需求如何演变' })).toHaveCount(1);
  await page.getByRole('combobox', { name: '按目标状态筛选' }).click();
  await page.getByRole('option', { name: '暂缓', exact: true }).click();
  await expect(links).toHaveCount(1);
  await expect(links.first()).toContainText('另一个独立需求');
  await page.getByRole('combobox', { name: '按目标状态筛选' }).click();
  await page.getByRole('option', { name: '全部状态', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索目标' }).fill('看清');
  await page.getByRole('searchbox', { name: '搜索目标' }).press('Enter');
  await expect(links).toHaveCount(1);
  await links.first().click();
  await expect(page).toHaveURL(new RegExp(`/requirements/${fixture.ids.$first}$`));
  await expect(
    page.getByRole('heading', { name: '虚构：看清需求如何演变', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('方案已定', { exact: true })).toBeVisible();
  const records = page.locator('.progress-record');
  await expect(records).toHaveCount(3);
  await expect(records.nth(0)).toContainText('方案已经明确');
  await expect(records.nth(1)).toContainText('保留原始来源');
  await expect(records.nth(2)).toContainText('更正后的决定');
  await expect(records.nth(2)).toContainText('更新于');
  await expect(page.locator('.requirements-reading')).not.toContainText(/项目版本|第\s*\d+\s*版/);
  await expect(page.getByText('发生时间未知', { exact: true })).toHaveCount(2);
  await expect(page.getByText('原始决定：由用户发起阶段回顾。', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(records).toHaveCount(3);
});

test('keeps requirement reading simple while record history and sources remain accessible', async ({
  page,
  request,
  baseURL,
}) => {
  const project = await createFixture(request, title());
  const { ids, version } = await seedRequirementFixture(baseURL!, project.projectId);
  await saveRequirementFixture(baseURL!, project.projectId, version, [
    recordFixture(ids.$first!, {
      id: ids.$decision!,
      title: '虚构：方案已经明确',
      markdown: '后来改写的记录，不是当时状态变化的原始依据。',
      occurredAt: null,
    }),
  ]);
  await page.goto(`/#/projects/${project.projectId}/requirements/${ids.$first}`);
  await expect(page.getByRole('button', { name: '需求修订与状态依据', exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole('article', { name: '虚构：方案已经明确', exact: true })
    .getByRole('button', { name: '修订历史与来源' })
    .click();
  const exact = page.getByRole('dialog', { name: '记录修订历史', exact: true });
  await expect(exact.getByRole('tab')).toHaveCount(2);
  await exact.getByRole('tab').last().click();
  await expect(
    exact.getByText('当时的方案依据：回顾后记录结论，保留原决定。', { exact: true }),
  ).toBeVisible();
  await expect(
    exact.getByText('后来改写的记录，不是当时状态变化的原始依据。', { exact: true }),
  ).not.toBeVisible();
  await exact.getByRole('button', { name: '原始来源', exact: true }).click();
  await expect(exact.locator('.requirement-source').first()).toContainText('虚构需求测试');
  await exact.getByRole('button', { name: '关闭', exact: true }).click();
  await page
    .getByRole('article', { name: '虚构：先确定回顾方式', exact: true })
    .getByRole('button', { name: '修订历史与来源' })
    .click();
  const recordHistory = page.getByRole('dialog', { name: '记录修订历史', exact: true });
  await expect(
    recordHistory.getByText('更正后的决定：用户主动发起回顾，Agent 根据材料一次补齐。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(recordHistory.getByRole('tab')).toHaveCount(2);
  await expect(recordHistory.getByRole('tab').first().locator('time')).toBeVisible();
  await recordHistory.getByRole('tab').last().click();
  await expect(
    recordHistory.getByText('原始决定：由用户发起阶段回顾。', { exact: true }),
  ).toBeVisible();
});

test('paginates at the read version, then refreshes actual MCP updates', async ({
  page,
  request,
  baseURL,
}) => {
  const project = await createFixture(request, title());
  const { ids, version } = await seedRequirementFixture(baseURL!, project.projectId);
  const pageRecords = await saveRequirementFixture(
    baseURL!,
    project.projectId,
    version,
    Array.from({ length: 32 }, (_, n) =>
      recordFixture(ids.$first!, {
        id: `$page${n}`,
        title: `虚构分页结论 ${n}`,
        markdown: `第 ${n} 条独立虚构结论。`,
        occurredAt: null,
      }),
    ),
  );
  await page.goto(`/#/projects/${project.projectId}/requirements/${ids.$first}`);
  await expect(page.locator('.progress-record')).toHaveCount(30);
  await saveRequirementFixture(baseURL!, project.projectId, pageRecords.receipt.version, [
    recordFixture(ids.$first!, {
      id: '$latest',
      title: '虚构：新保存的进展',
      markdown: '读取下一页时不应混进旧快照。',
      occurredAt: 1,
    }),
  ]);
  await page.getByRole('button', { name: '更早的记录', exact: true }).click();
  await expect(page.locator('.progress-record')).toHaveCount(35);
  await expect(page.getByRole('article', { name: '虚构：新保存的进展' })).toHaveCount(0);
  await page.getByRole('button', { name: '刷新时间线', exact: true }).click();
  await expect(page.locator('.progress-record').first()).toContainText('新保存的进展');
  await expect(page.locator('.progress-record')).toHaveCount(30);
  await expect(page.getByText(/项目版本 \d+/)).toHaveCount(0);
});

test('keeps project selection on requirements and reports refresh and missing-object failures honestly', async ({
  page,
  request,
  baseURL,
}) => {
  const a = await createFixture(request, title());
  const bName = title();
  const b = await createFixture(request, bName);
  const { ids } = await seedRequirementFixture(baseURL!, a.projectId);
  await page.goto(`/#/projects/${a.projectId}/requirements/${ids.$first}`);
  await expect(page.locator('.progress-record')).toHaveCount(3);
  const pattern = `**/api/projects/${a.projectId}/requirements/${ids.$first}`;
  await page.route(pattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'STORAGE_BUSY', message: '明确的虚构临时读取错误。' },
      }),
    }),
  );
  await page.getByRole('button', { name: '刷新时间线', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('当前显示上次取得的内容');
  await expect(page.locator('.progress-record')).toHaveCount(3);
  await page.unroute(pattern);
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page
    .locator('.sidebar')
    .getByRole('combobox', { name: /^切换项目/ })
    .fill(bName);
  await page.getByRole('option', { name: new RegExp(bName) }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${b.projectId}/requirements$`));
  await expect(page.getByText('还没有目标', { exact: true })).toBeVisible();
  await expect(page.locator('.progress-record')).toHaveCount(0);
  await page.goto(`/#/projects/${b.projectId}/requirements/${ids.$first}`);
  await expect(page.getByRole('alert')).toContainText('无法读取时间线内容');
  await expect(page.getByRole('alert')).toContainText('当前项目中找不到这个目标。');
});

test('stays readable in both themes and small viewports, including revision history', async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  const project = await createFixture(request, title());
  const { ids } = await seedRequirementFixture(baseURL!, project.projectId);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/#/projects/${project.projectId}/requirements/${ids.$first}`);
  await expect(page.locator('.progress-record')).toHaveCount(3);
  await page.screenshot({
    path: testInfo.outputPath('requirements-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await chooseAppearance(page, 'dark');
  await page.screenshot({
    path: testInfo.outputPath('requirements-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  for (const width of [900, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page
    .locator('.progress-record')
    .first()
    .getByRole('button', { name: '修订历史与来源' })
    .click();
  await expect(page.getByRole('dialog', { name: '记录修订历史' })).toBeInViewport({ ratio: 0.9 });
  await page.screenshot({
    path: testInfo.outputPath('requirements-history-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(errors).toEqual([]);
});

test('distinguishes fixed sections from headings in requirement, record and history content', async ({
  page,
  request,
  baseURL,
}) => {
  const project = await createFixture(request, title());
  const fixture = await seedRequirementFixture(baseURL!, project.projectId);
  await saveRequirementFixture(baseURL!, project.projectId, fixture.version, [
    requirementFixture({
      id: fixture.ids.$first!,
      title: '虚构：看清需求如何演变',
      markdown: '# 自由正文的范围\n\n这里是需求正文。\n\n## 约束\n\n这里是正文约束。',
    }),
    recordFixture(fixture.ids.$first!, {
      id: '$structured',
      title: '虚构：本轮记录',
      markdown: '# 本轮结论\n\n这里是推进记录正文。',
      occurredAt: null,
    }),
  ]);
  await page.goto(`/#/projects/${project.projectId}/requirements/${fixture.ids.$first}`);
  await expect(page.locator('.requirements-reading h1')).toHaveCount(1);
  await expect(page.locator('.requirements-reading > section > h2')).toHaveText(['目标说明']);
  await expect(page.getByRole('heading', { name: '进展记录', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '自由正文的范围', level: 3 })).toBeVisible();
  const record = page.getByRole('article', { name: '虚构：本轮记录', exact: true });
  await expect(record.getByRole('heading', { name: '虚构：本轮记录', level: 3 })).toBeVisible();
  await expect(record.getByRole('heading', { name: '本轮结论', level: 4 })).toBeVisible();
  await record.getByRole('button', { name: '修订历史与来源' }).click();
  const history = page.getByRole('dialog', { name: '记录修订历史', exact: true });
  await expect(history.getByRole('heading', { name: '本轮结论', level: 4 })).toBeVisible();
});
