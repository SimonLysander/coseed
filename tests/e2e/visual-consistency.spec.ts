import { seedGraphChanges } from '../helpers/staged-graph-fixture.js';
import { expect, test, type Locator } from '@playwright/test';
import { createFixture, saveFixtureOverview } from '../helpers/project-fixture.js';
import { buildBusinessFixture } from '../helpers/business-fixture.js';
import {
  requirementFixture,
  recordFixture,
  saveRequirementFixture,
} from '../helpers/requirements-fixture.js';
import { chooseAppearance } from '../helpers/appearance.js';
import { projectOverviewContentSchema } from '../../src/contracts/content/overview.js';
import example from '../../docs/database/overview-content.example.json' with { type: 'json' };

async function alignedTitle(row: Locator) {
  const heading = await row.locator('h1').boundingBox();
  const action = await row.getByRole('button').last().boundingBox();
  expect(heading).not.toBeNull();
  expect(action).not.toBeNull();
  expect(
    Math.abs(heading!.y + heading!.height / 2 - action!.y - action!.height / 2),
  ).toBeLessThanOrEqual(2);
}

test('keeps timeline metadata readable and page title actions aligned', async ({
  page,
  request,
  baseURL,
}, info) => {
  const project = await createFixture(request, '虚构视觉协调测试');
  const graph = buildBusinessFixture();
  const module = graph.changes.find((item) => (item as { id: string }).id === '$accounts') as {
    content: { name: string };
  };
  module.content.name = 'Agent 接入与同步';
  const saved = await seedGraphChanges(
    baseURL!,
    project.projectId,
    [
      ...graph.changes,
      requirementFixture({
        id: '$req',
        title: '虚构需求阅读',
        markdown: '读者可以理解当前目标以及最近形成的重要结论。',
        scope: { kind: 'modules', moduleIds: ['$accounts'] },
        primaryConcern: 'usability',
        initialStatus: 'designing',
      }),
      recordFixture('$req', {
        id: '$record',
        title: '虚构推进结论',
        markdown: '保留完整业务描述。',
        occurredAt: 1794268800000,
      }),
    ],
    '虚构视觉测试材料',
    graph.sources,
  );
  const req = saved.allocations.find((item) => item.localRef === '$req')!.id;
  const path = `/#/projects/${project.projectId}`;
  await saveFixtureOverview(
    baseURL!,
    project.projectId,
    projectOverviewContentSchema.parse(example.content),
  );
  for (const width of [1440, 1200, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path + '/requirements');
    await expect(page.locator('.requirement-scope')).toHaveText('Agent 接入与同步');
    await alignedTitle(page.locator('.requirements-title-row'));
    const scope = page.locator('.requirement-scope');
    const size = await scope.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
      width: el.getBoundingClientRect().width,
      overflow: el.scrollWidth > el.clientWidth,
    }));
    expect(size.height).toBeLessThanOrEqual(size.lineHeight + 1);
    expect(size.overflow).toBe(false);
    const listWidth = (await page.locator('.ant-timeline-item-title').first().boundingBox())!.width;
    await page.goto(path + '/requirements/' + req);
    await expect(page.locator('.progress-record')).toBeVisible();
    const recordWidth = (await page.locator('.ant-timeline-item-title').first().boundingBox())!
      .width;
    expect(recordWidth).toBeCloseTo(listWidth, 0);
    for (const value of await page.locator('.ant-timeline-item-title .timeline-time-value').all()) {
      const date = await value.locator('span').first().boundingBox();
      const clock = await value.locator('span').last().boundingBox();
      expect(clock!.y).toBeCloseTo(date!.y, 0);
    }
  }
  for (const [route, selector] of [
    ['/overview', '.overview-title-row'],
    ['/business', '.business-title-row'],
    ['/agent-guide', '.guide-title-row'],
  ] as const) {
    await page.goto(route === '/agent-guide' ? '/#' + route : path + route);
    await expect(page.locator(selector)).toBeVisible();
    await alignedTitle(page.locator(selector));
  }
  for (const mode of ['light', 'dark'] as const) {
    await chooseAppearance(page, mode);
    await page.goto(path + '/requirements');
    await expect(page.locator('.requirement-list-row')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`timeline-${mode}.png`), fullPage: true });
    for (const width of [767, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('.requirement-subject > .progress-time')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(page.getByRole('combobox', { name: '按涉及范围筛选' })).toBeVisible();
    }
    await page.setViewportSize({ width: 1200, height: 900 });
  }
});
