import { expect, test } from '@playwright/test';
import { chooseAppearance } from '../helpers/appearance.js';

test('human writing review is readable, navigable and honest about provenance', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/agent-guide');
  await page.getByRole('link', { name: '阅读内容编写规范（审阅稿）', exact: true }).click();
  await expect(page.getByRole('heading', { name: '内容编写规范', exact: true })).toBeVisible();
  await expect(page.getByText('审阅稿', { exact: true })).toBeVisible();
  await expect(page.locator('.writing-article')).toContainText(
    '按产品表述、核心概念、使用示例组织综述',
  );
  await expect(page.locator('.writing-article')).not.toContainText('不对，我觉得整个这里其实是');
  await expect(
    page.getByText('不对，我觉得整个这里其实是 整个需求？你说的都是形式，', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('含用户原话；文档细节待核对', { exact: true }).first()).toBeVisible();
  await page.getByText('核对出处', { exact: true }).first().click();
  await expect(
    page.getByText('本次会话可见的用户原话；未取得平台消息编号', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('不对，我觉得整个这里其实是 整个需求？你说的都是形式，', { exact: true }),
  ).toBeVisible();
  await page.getByText('核对出处', { exact: true }).first().click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath('writing-overview-light.png'), fullPage: true });
  await page
    .getByRole('navigation', { name: '规范主题' })
    .getByRole('menuitem', { name: '业务设计', exact: true })
    .click();
  await expect(page.locator('.writing-article')).toContainText('一张图的所有节点必须正交完备');
  await page
    .getByRole('complementary', { name: '规范章节目录' })
    .getByRole('link', { name: '连线内容', exact: true })
    .click();
  await expect(page).toHaveURL(/writing-guide\/design\/relations$/);
  await page.reload();
  await expect(page.locator('[id="/writing-guide/design/relations"]')).toBeInViewport();
  await expect(page.locator('.writing-article')).toContainText('至少一端为本项目模块');
  await expect(
    page.getByRole('note', { name: '虚构写法示例：连线写法示例', exact: true }),
  ).toContainText('Booking.customerId');
  await page.getByText('核对约定', { exact: true }).click();
  await expect(page.locator('.writing-review-table')).toBeVisible();
  await expect(page.locator('.writing-review-table')).toContainText('一张图的节点都必须正交完备');
  await page.getByText('阅读', { exact: true }).click();
  await chooseAppearance(page, 'dark');
  await page.screenshot({ path: info.outputPath('writing-design-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.writing-mobile-topics').click();
  await page.getByRole('menuitem', { name: '需求推进', exact: true }).last().click();
  await expect(page.locator('.writing-article')).toContainText('一条记录说明一项结论或结果');
  await expect(page.locator('.writing-article')).toContainText('每条推进记录有且只有一个主需求');
  await expect(
    page.getByRole('note', { name: '虚构写法示例：完整需求示例', exact: true }),
  ).toContainText('顾客自主取消尚未开始的预约');
  await expect(page.locator('.writing-article')).toContainText('无法核实时填 null');
  await page.locator('.writing-mobile-toc').click();
  await page.getByRole('menuitem', { name: '待核对', exact: true }).last().click();
  await expect(page.locator('.writing-questions')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
