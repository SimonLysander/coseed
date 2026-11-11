import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import example from '../../docs/database/overview-content.example.json' with { type: 'json' };
import { projectOverviewContentSchema } from '../../src/contracts/content/overview.js';
import { createFixture, saveFixtureOverview } from '../helpers/project-fixture.js';
import { chooseAppearance } from '../helpers/appearance.js';

const fixture = projectOverviewContentSchema.parse(example.content);
const name = (topic: string) => `虚构测试 ${topic} ${randomUUID().slice(0, 6)}`;

test('creates a project in the UI and restores its selection without loading a graph', async ({
  page,
  request,
}) => {
  const title = name('创建');
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.goto('/#/overview');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称' }).fill(title);
  await page
    .getByRole('region', { name: '创建项目', exact: true })
    .getByRole('button', { name: '创建项目', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByText('还没有项目综述', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/projects\/[\w-]+\/overview$/);
  const route = page.url();
  await page.goto('/#/overview');
  await expect(page).toHaveURL(route);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  expect(requested.some((url) => url.includes('elk-worker'))).toBe(false);
  const list = await (await request.get(`/api/projects?name=${encodeURIComponent(title)}`)).json();
  expect(list.items).toHaveLength(1);
});

test('a lost creation response retries the original operation even after closing the inline form', async ({
  page,
  request,
}) => {
  const title = name('响应丢失');
  const operations: string[] = [];
  let first = true;
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    operations.push(route.request().postDataJSON().operationId);
    if (first) {
      first = false;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称' }).fill(title);
  const dialog = page.getByRole('region', { name: '创建项目', exact: true });
  await dialog.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(dialog).toContainText('创建结果未确认');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await dialog.getByRole('button', { name: '重试创建', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  expect(operations).toHaveLength(2);
  expect(new Set(operations).size).toBe(1);
  expect(
    (await (await request.get(`/api/projects?name=${encodeURIComponent(title)}`)).json()).items,
  ).toHaveLength(1);
});

test('renders complete overview sections, each example diagram, and fixed canvases in both modes', async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  const project = await createFixture(request, name('完整阅读'));
  await saveFixtureOverview(baseURL!, project.projectId, fixture);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/#/projects/${project.projectId}/overview`);
  await expect(page.getByRole('heading', { name: '产品说明', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '核心概念', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '使用示例', exact: true })).toBeVisible();
  await expect(page.locator('.reading-chapter-number')).toHaveText(['1', '2', '3']);
  await expect(page.locator('.overview-scene-label')).toHaveText(['场景 1', '场景 2']);
  const canvases = page.locator('.overview-diagram-canvas');
  await expect(canvases).toHaveCount(3);
  await expect
    .poll(() =>
      canvases.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-ready'))),
    )
    .toEqual(['true', 'true', 'true']);
  await expect(page.locator('.overview-example')).toHaveCount(2);
  await expect(page.locator('.overview-concepts dt')).toHaveCount(4);
  const connection = await canvases.nth(1).evaluate((canvas) => {
    const source = canvas.querySelector('.x6-node[data-cell-id^="actor:"] path') as SVGPathElement;
    const edge = canvas.querySelector('.x6-edge path') as SVGPathElement;
    const start = edge.getPointAtLength(0);
    const screen = new DOMPoint(start.x, start.y).matrixTransform(edge.getScreenCTM()!);
    const bounds = source.getBoundingClientRect();
    return {
      x: screen.x,
      y: screen.y,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
    };
  });
  expect(connection.x).toBeGreaterThanOrEqual(connection.left - 2);
  expect(connection.x).toBeLessThanOrEqual(connection.right + 2);
  expect(connection.y).toBeGreaterThanOrEqual(connection.top - 2);
  expect(connection.y).toBeLessThanOrEqual(connection.bottom + 2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath('overview-light.png'), fullPage: true });
  const first = canvases.first();
  const transform = await first.locator('.x6-graph-svg-viewport').getAttribute('transform');
  await first.hover();
  await page.mouse.wheel(0, 150);
  expect(await first.locator('.x6-graph-svg-viewport').getAttribute('transform')).toBe(transform);
  await chooseAppearance(page, 'dark');
  await expect(page.getByRole('button', { name: '刷新项目综述', exact: true })).toHaveCSS(
    'color',
    'rgb(241, 240, 255)',
  );
  expect(await first.locator('.x6-graph-svg-viewport').getAttribute('transform')).toBe(transform);
  await expect(page.locator('.page-header')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('overview-dark.png'), fullPage: true });
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const canvas of await canvases.all())
      expect((await canvas.boundingBox())!.width).toBeLessThanOrEqual(660);
  }
  expect(errors).toEqual([]);
});

test('switches explicit projects and refreshes MCP updates without mixing their content', async ({
  page,
  request,
  baseURL,
}) => {
  const a = await createFixture(request, name('项目 A'));
  const bName = name('项目 B');
  const b = await createFixture(request, bName);
  await saveFixtureOverview(baseURL!, a.projectId, {
    ...fixture,
    product: { markdown: '这是虚构项目 A 的独有内容。' },
  });
  await saveFixtureOverview(baseURL!, b.projectId, {
    ...fixture,
    product: { markdown: '这是虚构项目 B 的独有内容。' },
  });
  await page.goto(`/#/projects/${a.projectId}/overview`);
  await expect(page.getByText('这是虚构项目 A 的独有内容。', { exact: true })).toBeVisible();
  await page
    .locator('.sidebar')
    .getByRole('combobox', { name: /^切换项目/ })
    .click();
  const dialog = page.getByRole('region', { name: '选择项目', exact: true });
  await page.locator('.sidebar').getByRole('combobox').fill(bName);
  await dialog.getByRole('option', { name: new RegExp(bName) }).click();
  await expect(page.getByText('这是虚构项目 B 的独有内容。', { exact: true })).toBeVisible();
  await expect(page.getByText('这是虚构项目 A 的独有内容。', { exact: true })).toHaveCount(0);
  await saveFixtureOverview(
    baseURL!,
    b.projectId,
    { ...fixture, product: { markdown: '项目 B 已通过 MCP 更新。' } },
    1,
    1,
  );
  await page.getByRole('button', { name: '刷新项目综述', exact: true }).click();
  await expect(page.getByText('项目 B 已通过 MCP 更新。', { exact: true })).toBeVisible();
  await expect(page.getByText('项目版本 2', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('项目 B 已通过 MCP 更新。', { exact: true })).toBeVisible();
});

test('preserves the last read version on refresh failure and reports it honestly', async ({
  page,
  request,
  baseURL,
}) => {
  const project = await createFixture(request, name('读取失败'));
  await saveFixtureOverview(baseURL!, project.projectId, fixture);
  await page.goto(`/#/projects/${project.projectId}/overview`);
  await expect(page.getByRole('heading', { name: '产品说明', exact: true })).toBeVisible();
  await page.route(`**/api/projects/${project.projectId}/overview`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'STORAGE_BUSY', message: '测试中的临时读取失败' } }),
    }),
  );
  await page.getByRole('button', { name: '刷新项目综述', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('当前显示上次取得的版本 1');
  await expect(page.getByRole('heading', { name: '产品说明', exact: true })).toBeVisible();
  await page.unroute(`**/api/projects/${project.projectId}/overview`);
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('supports reading links, safely renders Markdown, and recovers from a missing project', async ({
  page,
  request,
  baseURL,
}) => {
  const project = await createFixture(request, name('链接与正文'));
  await saveFixtureOverview(baseURL!, project.projectId, {
    ...fixture,
    product: {
      markdown:
        '# 正文自定义标题\n\n正文里的 **重点** 与段落。\n\n## 正文下级标题\n\n<script>window.fakeExecution=true</script>\n\n[非法链接](javascript:alert(1))',
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/#/projects/${project.projectId}/overview`);
  await expect(page.locator('.reading-markdown strong').first()).toHaveText('重点');
  await expect(page.locator('.overview-article h1')).toHaveCount(1);
  await expect(page.locator('.overview-article h2')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: '正文自定义标题', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '正文下级标题', level: 4 })).toBeVisible();
  expect(
    await page
      .getByRole('heading', { name: '正文自定义标题' })
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeLessThan(
    await page
      .getByRole('heading', { name: '产品说明', exact: true })
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  );
  expect(await page.evaluate(() => 'fakeExecution' in window)).toBe(false);
  await expect(page.locator('.reading-markdown a[href^="javascript:"]')).toHaveCount(0);
  await page.locator('.overview-toc').getByRole('link', { name: '使用示例', exact: true }).click();
  await expect(page).toHaveURL(/\/overview\/examples$/);
  await expect(page.getByRole('heading', { name: '使用示例', exact: true })).toBeInViewport();
  await page.reload();
  await expect(page.getByRole('heading', { name: '使用示例', exact: true })).toBeInViewport();
  await page
    .locator('.overview-toc')
    .getByRole('link', { name: fixture.examples.sections[1]!.title, exact: true })
    .click();
  const stableLink = page.url();
  await saveFixtureOverview(
    baseURL!,
    project.projectId,
    {
      ...fixture,
      examples: { ...fixture.examples, sections: [...fixture.examples.sections].reverse() },
    },
    1,
    1,
  );
  await page.getByRole('button', { name: '刷新项目综述' }).click();
  await expect(page.getByText('项目版本 2', { exact: true })).toBeVisible();
  expect(page.url()).toBe(stableLink);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: fixture.examples.sections[1]!.title, exact: true }),
  ).toBeInViewport();
  await page.goto(`/#/projects/${randomUUID()}/overview`);
  await expect(page.getByRole('heading', { name: '暂时无法打开项目' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '产品说明', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '选择其他项目' }).click();
  await expect(page.getByRole('region', { name: '选择项目', exact: true })).toBeVisible();
});

test('project selection searches in its trigger, supports keyboard selection and creates from the dropdown', async ({
  page,
  request,
}, testInfo) => {
  const title = name('下拉选择');
  const project = await createFixture(request, title);
  await page.goto(`/#/projects/${project.projectId}/overview`);
  const card = page.getByRole('region', { name: '选择项目', exact: true });
  const trigger = page.locator('.sidebar').getByRole('combobox', { name: /^切换项目/ });
  await trigger.focus();
  await trigger.press('ArrowDown');
  await expect(card).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.fill(title);
  await expect(card.getByRole('option', { name: new RegExp(title) })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const bounds = await page.locator('.project-picker-popup:visible').boundingBox();
  const anchor = await page.locator('.sidebar .project-slot').boundingBox();
  expect(bounds!.x).toBeCloseTo(anchor!.x, 0);
  expect(bounds!.y).toBeGreaterThanOrEqual(anchor!.y + anchor!.height);
  await expect(card.getByText(/创建于/)).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('project-picker-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await trigger.press('Escape');
  await expect(card).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('heading', { name: title, exact: true }).click();
  await expect(card).not.toBeVisible();
  await chooseAppearance(page, 'dark');
  await trigger.click();
  await page.screenshot({ path: testInfo.outputPath('project-picker-dark.png'), fullPage: true });
  await trigger.fill(title);
  await card.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(card).toBeVisible();
  await expect(card.getByRole('option', { name: new RegExp(title) })).toBeVisible();
  await expect(page.getByRole('region', { name: '创建项目', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '项目名称' })).toHaveValue(title);
  await expect(page.getByRole('textbox', { name: '项目名称' })).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath('project-inline-create-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('textbox', { name: '项目名称' }).press('Escape');
  await expect(page.getByRole('region', { name: '创建项目', exact: true })).not.toBeVisible();
  await expect(card).toBeVisible();
});

test('project select remains searchable in the tablet rail and switches inside the mobile drawer', async ({
  page,
  request,
}, testInfo) => {
  const a = await createFixture(request, name('手机 A'));
  const bTitle = name('手机 B');
  const b = await createFixture(request, bTitle);
  await page.goto(`/#/projects/${a.projectId}/overview`);
  await page.setViewportSize({ width: 900, height: 900 });
  const rail = page.locator('.sidebar').getByRole('combobox', { name: /^切换项目/ });
  await rail.click();
  const card = page.getByRole('region', { name: '选择项目', exact: true });
  await expect(card).toBeVisible();
  await rail.fill(bTitle);
  await expect(rail).toHaveValue(bTitle);
  await expect(page.locator('.sidebar .project-slot')).toHaveCSS('width', '320px');
  await expect(card.getByRole('option', { name: new RegExp(bTitle) })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('project-picker-tablet.png'), fullPage: true });
  await rail.press('Escape');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('button', { name: '打开主导航' }).click();
  const navigation = page.getByRole('dialog', { name: 'CoSeed', exact: true });
  const trigger = navigation.getByRole('combobox', { name: /^切换项目/ });
  await trigger.click();
  await expect(card).toBeVisible();
  await trigger.fill(bTitle);
  await expect(card.getByRole('option', { name: new RegExp(bTitle) })).toBeVisible();
  await card.getByRole('option', { name: new RegExp(bTitle) }).click({ trial: true });
  const bounds = await page.locator('.project-picker-popup:visible').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath('project-picker-mobile.png'), fullPage: true });
  await trigger.press('ArrowDown');
  await trigger.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/projects/${b.projectId}/overview$`));
  await expect(navigation).not.toBeVisible();
  await expect(card).not.toBeVisible();
});

test('creates inline on mobile, validates empty names, and keeps the current project after cancellation', async ({
  page,
  request,
}, testInfo) => {
  const current = await createFixture(request, name('行内创建前'));
  const next = name('手机行内创建');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/#/projects/${current.projectId}/overview`);
  await page.getByRole('button', { name: '打开主导航' }).click();
  const navigation = page.getByRole('dialog', { name: 'CoSeed', exact: true });
  await navigation.getByRole('combobox').click();
  const picker = page.getByRole('region', { name: '选择项目', exact: true });
  await picker.getByRole('button', { name: '创建项目', exact: true }).click();
  const form = page.getByRole('region', { name: '创建项目', exact: true });
  const input = form.getByRole('textbox', { name: '项目名称' });
  await input.fill('   ');
  await input.press('Enter');
  await expect(form).toContainText('请填写项目名称');
  await form.getByRole('button', { name: '取消', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/projects/${current.projectId}/overview$`));
  await picker.getByRole('button', { name: '创建项目', exact: true }).click();
  await input.fill(next);
  await expect(input).toBeFocused();
  await form.getByRole('button', { name: '创建项目', exact: true }).click({ trial: true });
  await page.screenshot({
    path: testInfo.outputPath('project-inline-create-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: next, exact: true })).toBeVisible();
  await expect(navigation).not.toBeVisible();
  await expect(picker).not.toBeVisible();
  expect(
    (await (await request.get(`/api/projects?name=${encodeURIComponent(next)}`)).json()).items,
  ).toHaveLength(1);
});
