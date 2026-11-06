import { expect, test } from '@playwright/test';
import themes from '../../src/web/design-system/themes.json' with { type: 'json' };
import { expectNavigationAlignment } from '../helpers/navigation-layout.js';

test('workbench navigation aligns icons and labels without baseline space', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.page-header')).toHaveCSS('height', '48px');
  const rows = page.locator('.sidebar nav .ds-nav-item');
  await expectNavigationAlignment(rows, { count: 3, height: 36 });
  await page.setViewportSize({ width: 900, height: 1000 });
  await expectNavigationAlignment(rows, { count: 3, height: 36, rail: true });
});

test('workbench shows real readiness and connection details', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '先从一个项目开始' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('本地服务已就绪');
  await page.getByRole('button', { name: '服务连接' }).click();
  await expect(page.getByRole('dialog')).toContainText('数据库');
  await expect(page.getByRole('dialog')).toContainText('已就绪');
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('narrow reading layout does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('本地服务已就绪');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('heading', { name: '先从一个项目开始' })).toBeVisible();
  await page.getByRole('button', { name: '打开主导航' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '服务连接' }).click();
  await expect(page.getByRole('dialog', { name: '本地服务' })).toContainText('数据库');
});

test('failed connection can be retried', async ({ page }) => {
  await page.route('**/api/status', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/status');
  await page.getByRole('button', { name: '重新连接' }).click();
  await expect(page.getByRole('status')).toHaveText('本地服务已就绪');
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('workbench uses the shared system typography and pine-green modes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('本地服务已就绪');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByRole('heading', { name: '先从一个项目开始' })).toHaveCSS(
    'font-size',
    '26px',
  );
  await expect(page.locator('.sidebar')).toHaveCSS('width', '208px');
  expect(
    await page
      .locator('html')
      .evaluate((element) =>
        (element as HTMLElement).style.getPropertyValue('--ds-color-accent-solid'),
      ),
  ).toBe('#2F7864');
  await page.getByRole('combobox', { name: '明暗模式' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '服务连接' }).click();
  await expect(page.locator('.ant-modal-container')).toHaveCSS(
    'background-color',
    'rgb(35, 35, 41)',
  );
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.reload();
  await expect(page.getByRole('combobox', { name: '明暗模式' })).toHaveValue('dark');
});

test('saved application mode paints before JavaScript and ignores preview settings', async ({
  page,
}) => {
  await page.addInitScript((keys) => {
    localStorage.setItem(keys.applicationKey, JSON.stringify({ mode: 'dark' }));
    localStorage.setItem(keys.previewKey, JSON.stringify({ mode: 'light' }));
  }, themes.preferences);
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(18, 18, 18)');
  await expect(page.locator('#root')).toBeEmpty();
});
