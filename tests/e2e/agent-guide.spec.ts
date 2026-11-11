import { chooseAppearance } from '../helpers/appearance.js';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const guideTitle = 'Agent 接入与使用指南';

test('guide navigation, section links and bundled reference work in the built application', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Agent 接入', exact: true }).click();
  await expect(page.getByRole('heading', { name: guideTitle, exact: true })).toBeVisible();
  await expect(page.locator('.guide-lead')).toContainText('read_guide(topic="usage")');
  await expect(page.getByRole('link', { name: '核对历史约定及出处' })).toHaveCount(0);
  await expect(page.locator('.guide-section')).toHaveCount(7);
  await expect(page.locator('.sidebar-guide-link')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.guide-toc')).toBeVisible();
  await expect(page.locator('.guide-article')).toContainText('一张图的所有节点必须正交完备');
  await expect(page.locator('.guide-article')).toContainText('虚构预约项目');
  await expect(page.locator('.guide-article')).not.toContainText('不对，我觉得整个这里其实是');
  await expect(page.locator('.guide-article')).not.toContainText('业务设计页面仍在开发');
  await page.locator('.guide-toc').getByRole('link', { name: '整理需求推进' }).click();
  await expect(page).toHaveURL(/#\/agent-guide\/guide-section-4$/);
  await expect(
    page.getByRole('heading', { name: '4. 整理需求推进', exact: true }),
  ).toBeInViewport();
  await expect(page.locator('.guide-toc a[aria-current="location"]')).toContainText('整理需求推进');
  await chooseAppearance(page, 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('heading', { name: '4. 整理需求推进', exact: true }),
  ).toBeInViewport();
  const reference = await page
    .getByRole('link', { name: '本地开发和运行', exact: true })
    .getAttribute('href');
  expect(reference).toMatch(/^\/assets\/local-development-.*\.md$/);
  const response = await page.request.get(reference!);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('# 本地开发和运行');
  await page.locator('.sidebar').getByRole('menuitem', { name: '项目综述' }).click();
  await expect(page.getByRole('heading', { name: '先从一个项目开始' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('guide remains readable with working contents and navigation on narrow screens', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/agent-guide');
  await expect(page.getByRole('heading', { name: guideTitle })).toBeVisible();
  for (const width of [1440, 1280, 1279, 1024, 900, 768, 767, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const article = await page.locator('.guide-article').boundingBox();
    expect(article!.width).toBeLessThanOrEqual(660);
    expect(article!.x).toBeGreaterThanOrEqual(20);
    if (width >= 1280) {
      await expect(page.getByRole('button', { name: '打开阅读目录' })).not.toBeVisible();
      const toc = await page.locator('.guide-toc').boundingBox();
      expect(toc!.x - article!.x - article!.width).toBe(48);
    } else {
      await expect(page.getByRole('button', { name: '打开阅读目录' })).toBeVisible();
      await expect(page.locator('.guide-toc')).not.toBeVisible();
    }
  }
  await page.getByRole('button', { name: '打开阅读目录' }).click();
  await page.getByRole('menuitem', { name: '连接并读取项目' }).click();
  const heading = page.getByRole('heading', { name: '2. 连接并读取项目', exact: true });
  await expect(heading).toBeInViewport();
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(60);
  await page.getByRole('button', { name: '打开主导航' }).click();
  await page.getByRole('dialog').getByRole('menuitem', { name: '项目综述' }).click();
  await expect(page.getByRole('heading', { name: '先从一个项目开始' })).toBeVisible();
});

test('copy exports the source guide, while clipboard failure produces explicit feedback', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/agent-guide');
  await page.getByRole('button', { name: '复制说明', exact: true }).click();
  await expect(
    page.getByRole('status', { name: '' }).filter({ hasText: '已复制接入说明全文' }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    readFileSync(new URL('../../docs/operations/agent-integration.md', import.meta.url), 'utf8'),
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Fixture clipboard denied');
        },
      },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: '复制说明', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('复制失败');
  await expect(page.getByRole('button', { name: '复制说明', exact: true })).toBeVisible();
});
