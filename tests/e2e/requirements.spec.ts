import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createFixture } from '../helpers/project-fixture.js';
import {
  change,
  saveRequirementFixture,
  seedRequirementFixture,
} from '../helpers/requirements-fixture.js';
import { chooseAppearance } from '../helpers/appearance.js';
const title = () => `虚构需求测试 ${randomUUID().slice(0, 6)}`;

test('opens the real empty requirements page from the sidebar without loading graph engines', async ({
  page,
  request,
}) => {
  const project = await createFixture(request, title());
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto(`/#/projects/${project.projectId}/overview`);
  await page.locator('.sidebar').getByRole('menuitem', { name: '需求推进', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project.projectId}/requirements$`));
  await expect(page.getByRole('heading', { name: '需求推进', exact: true })).toBeVisible();
  await expect(page.getByText('还没有需求', { exact: true })).toBeVisible();
  expect(urls.some((url) => url.includes('elk-worker'))).toBe(false);
  await page.reload();
  await expect(page.getByText('还没有需求', { exact: true })).toBeVisible();
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
  await expect(links.first()).toContainText('看清需求如何演变');
  await page.getByRole('combobox', { name: '按需求状态筛选' }).click();
  await page.getByRole('option', { name: '暂缓', exact: true }).click();
  await expect(links).toHaveCount(1);
  await expect(links.first()).toContainText('另一个独立需求');
  await page.getByRole('combobox', { name: '按需求状态筛选' }).click();
  await page.getByRole('option', { name: '全部状态', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索需求' }).fill('看清');
  await page.getByRole('searchbox', { name: '搜索需求' }).press('Enter');
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
  await expect(records.nth(2)).toContainText('第 2 版');
  await expect(records.nth(2)).toContainText('发生时间未知');
  await expect(page.getByText('原始决定：由用户发起阶段回顾。', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(records).toHaveCount(3);
});

test('reads fixed status evidence and raw sources through the revision reader', async ({
  page,
  request,
  baseURL,
}) => {
  const project = await createFixture(request, title());
  const { ids } = await seedRequirementFixture(baseURL!, project.projectId);
  await saveRequirementFixture(baseURL!, project.projectId, 3, [
    change(
      'record',
      ids.$decision!,
      {
        requirementId: ids.$first,
        title: '虚构：方案已经明确',
        markdown: '后来改写的记录，不是当时状态变化的原始依据。',
        occurredAt: null,
      },
      1,
    ),
  ]);
  await page.goto(`/#/projects/${project.projectId}/requirements/${ids.$first}`);
  await page.getByRole('button', { name: '需求修订与状态依据', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '需求修订历史', exact: true });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('tab', { name: /^第 2 版/ }).click();
  await expect(drawer.getByText('已经讨论并明确回顾与来源方案。', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: '支撑记录 · 第 1 版', exact: true }).click();
  const exact = page.getByRole('dialog', { name: '记录历史版本', exact: true });
  await expect(
    exact.getByText('当时的方案依据：回顾后记录结论，保留原决定。', { exact: true }),
  ).toBeVisible();
  await expect(
    exact.getByText('后来改写的记录，不是当时状态变化的原始依据。', { exact: true }),
  ).toHaveCount(0);
  await exact.getByRole('button', { name: '原始来源', exact: true }).click();
  await expect(exact.locator('.requirement-source').first()).toContainText('虚构需求测试');
  await exact.getByRole('button', { name: '返回上一级', exact: true }).click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: '关闭', exact: true }).click();
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
  await recordHistory.getByRole('tab', { name: /^第 1 版/ }).click();
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
  const { ids } = await seedRequirementFixture(baseURL!, project.projectId);
  await saveRequirementFixture(
    baseURL!,
    project.projectId,
    3,
    Array.from({ length: 32 }, (_, n) =>
      change('record', `$page${n}`, {
        requirementId: ids.$first,
        title: `虚构分页结论 ${n}`,
        markdown: `第 ${n} 条独立虚构结论。`,
        occurredAt: null,
      }),
    ),
  );
  await page.goto(`/#/projects/${project.projectId}/requirements/${ids.$first}`);
  await expect(page.locator('.progress-record')).toHaveCount(30);
  await saveRequirementFixture(baseURL!, project.projectId, 4, [
    change('record', '$latest', {
      requirementId: ids.$first,
      title: '虚构：新保存的进展',
      markdown: '读取下一页时不应混进旧快照。',
      occurredAt: 1,
    }),
  ]);
  await page.getByRole('button', { name: '更早的记录', exact: true }).click();
  await expect(page.locator('.progress-record')).toHaveCount(35);
  await expect(page.getByRole('article', { name: '虚构：新保存的进展' })).toHaveCount(0);
  await page.getByRole('button', { name: '刷新需求推进', exact: true }).click();
  await expect(page.locator('.progress-record').first()).toContainText('新保存的进展');
  await expect(page.locator('.progress-record')).toHaveCount(30);
  await expect(page.getByText(/项目版本 5/)).toBeVisible();
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
  await page.getByRole('button', { name: '刷新需求推进', exact: true }).click();
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
  await expect(page.getByText('还没有需求', { exact: true })).toBeVisible();
  await expect(page.locator('.progress-record')).toHaveCount(0);
  await page.goto(`/#/projects/${b.projectId}/requirements/${ids.$first}`);
  await expect(page.getByRole('alert')).toContainText('无法读取需求内容');
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
  await page.getByRole('button', { name: '需求修订与状态依据' }).click();
  await expect(page.getByRole('dialog', { name: '需求修订历史' })).toBeInViewport({ ratio: 0.9 });
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
  await saveRequirementFixture(baseURL!, project.projectId, 3, [
    change(
      'requirement',
      fixture.ids.$first!,
      {
        title: '虚构：看清需求如何演变',
        markdown: '# 自由正文的范围\n\n这里是需求正文。\n\n## 约束\n\n这里是正文约束。',
        status: 'ready_for_implementation',
      },
      3,
    ),
    change('record', '$structured', {
      requirementId: fixture.ids.$first,
      title: '虚构：本轮记录',
      markdown: '# 本轮结论\n\n这里是推进记录正文。',
      occurredAt: null,
    }),
  ]);
  await page.goto(`/#/projects/${project.projectId}/requirements/${fixture.ids.$first}`);
  await expect(page.locator('.requirements-reading h1')).toHaveCount(1);
  await expect(page.locator('.requirements-reading > section > h2')).toHaveText(['需求说明']);
  await expect(page.getByRole('heading', { name: '推进记录', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '自由正文的范围', level: 3 })).toBeVisible();
  const record = page.getByRole('article', { name: '虚构：本轮记录', exact: true });
  await expect(record.getByRole('heading', { name: '虚构：本轮记录', level: 3 })).toBeVisible();
  await expect(record.getByRole('heading', { name: '本轮结论', level: 4 })).toBeVisible();
  await record.getByRole('button', { name: '修订历史与来源' }).click();
  const history = page.getByRole('dialog', { name: '记录修订历史', exact: true });
  await expect(history.getByRole('heading', { name: '本轮结论', level: 4 })).toBeVisible();
});
