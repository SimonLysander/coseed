import { expect, test } from '@playwright/test';
import { chooseAppearance } from '../helpers/appearance.js';

test('the old review entry keeps original evidence, while authoring has one reading page', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/agent-guide');
  await page.getByRole('link', { name: '核对历史约定及出处', exact: true }).click();
  await expect(page.getByRole('heading', { name: '历史约定及出处', exact: true })).toBeVisible();
  await expect(
    page.getByText('不对，我觉得整个这里其实是 整个需求？你说的都是形式，', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('文档记录；原始确认待核对', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.writing-page')).toContainText('不在此维护第二份规范');
  await page
    .getByRole('navigation', { name: '规范主题' })
    .getByRole('menuitem', { name: '业务设计', exact: true })
    .click();
  await page
    .getByRole('complementary', { name: '规范章节目录' })
    .getByRole('link', { name: '连线内容', exact: true })
    .click();
  await expect(page).toHaveURL(/writing-guide\/design\/relations$/);
  await page.reload();
  await expect(page.locator('[id="/writing-guide/design/relations"]')).toBeInViewport();
  await expect(page.locator('.writing-article')).toContainText('一张图的节点都必须正交完备');
  await page.getByRole('link', { name: 'Agent 接入', exact: true }).last().click();
  await expect(
    page.getByRole('heading', { name: 'Agent 接入与使用指南', exact: true }),
  ).toBeVisible();
  await page.locator('.guide-toc').getByRole('link', { name: '更新业务设计' }).click();
  await expect(
    page.getByRole('heading', { name: '7. 更新业务设计', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: info.outputPath('unified-guide-design-light.png') });
  await chooseAppearance(page, 'dark');
  await page.screenshot({ path: info.outputPath('unified-guide-design-dark.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '打开阅读目录' }).click();
  await page.getByRole('menuitem', { name: '整理需求推进' }).click();
  await expect(
    page.getByRole('heading', { name: '6. 整理需求推进', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: info.outputPath('unified-guide-requirements-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
