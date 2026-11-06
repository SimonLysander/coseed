import { chooseAppearance } from '../helpers/appearance.js';
import { expect, test } from '@playwright/test';
import themes from '../../src/web/design-system/themes.json' with { type: 'json' };
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;

test('manual mode persists while switching preserves the draft', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('项目名称（样例）').fill('尚未保存的输入');
  await chooseAppearance(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByLabel('项目名称（样例）')).toHaveValue('尚未保存的输入');
  await page.reload();
  await expect(page.getByRole('button', { name: '切换到浅色', exact: true })).toBeVisible();
});

test('mode starts light and stays independent of the operating system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '切换到深色', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await chooseAppearance(page, 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await chooseAppearance(page, 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('legacy preview preference retains mode before the module loads', async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ mode: 'dark', accentId: 'iris' })),
    themes.preferences.previewKey,
  );
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS(
    'background-color',
    rgb(themes.modes.dark.color.surface.page),
  );
  await expect(page.locator('#root')).toBeEmpty();
});

test('canonical modes reach graph fields and overlays without candidate controls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('radio')).toHaveCount(0);
  for (const mode of ['light', 'dark'] as const) {
    await chooseAppearance(page, mode);
    const colors = themes.modes[mode].color;
    expect(
      await page
        .locator('html')
        .evaluate((element) =>
          (element as HTMLElement).style.getPropertyValue('--ds-color-accent-solid'),
        ),
    ).toBe(colors.accent.solid);
    await expect(page.locator('.node-data')).toHaveCSS(
      'background-color',
      rgb(colors.graph.data.background),
    );
    await expect(page.locator('.reading-demo')).toHaveCSS('border-top-style', 'none');
    await page.getByRole('button', { name: '预览弹窗' }).click();
    await expect(page.locator('.ant-modal-container')).toHaveCSS(
      'background-color',
      rgb(colors.surface.paper),
    );
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});

test('dark mobile sample navigation remains operable', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    colorScheme: 'dark',
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4178/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.getByRole('button', { name: '打开样板导航' }).click();
    await page.getByRole('link', { name: '动态图标', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  } finally {
    await context.close();
  }
});
