import { expect, test } from '@playwright/test';
import { expectNavigationAlignment } from '../helpers/navigation-layout.js';

test('reader navigation, document and contents share consistent alignment', async ({ page }) => {
  await page.goto('/?view=reading');
  await expect(page.locator('.study-header')).toHaveCSS('height', '48px');
  await expectNavigationAlignment(page.locator('.study-sidebar .study-nav .ds-nav-item'), {
    count: 3,
    height: 36,
  });
  const heading = await page.locator('.study-document-heading').boundingBox();
  const contents = await page.locator('.study-toc').boundingBox();
  expect(heading && contents && Math.abs(heading.y - contents.y)).toBeLessThan(1);
  await expect(page.locator('.study-preview-label')).toHaveCSS('font-size', '12px');
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('sample navigation stays aligned in both full and rail layouts', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('.sample-sidebar .ds-nav-item');
  await expectNavigationAlignment(rows, { count: 5, height: 36 });
  await page.setViewportSize({ width: 900, height: 1000 });
  await expectNavigationAlignment(rows, { count: 5, height: 36, rail: true });
});

test('approved reader uses canonical typography without trial fonts', async ({ page }) => {
  const fonts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fonts.push(request.url());
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/?view=reading');
  await expect(page.getByRole('heading', { name: '理解项目，跟上每一次推进' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '阅读字体' })).toHaveCount(0);
  await expect(page.locator('.study-article h1')).toHaveCSS('font-size', '26px');
  await expect(page.locator('.study-section > p').first()).toHaveCSS('font-size', '15px');
  await expect(page.locator('.study-section > p').first()).toHaveCSS('line-height', '28px');
  await expect(page.locator('.study-section > p').first()).toHaveCSS('font-weight', '400');
  expect(
    await page
      .locator('html')
      .evaluate((element) =>
        (element as HTMLElement).style.getPropertyValue('--ds-color-accent-solid'),
      ),
  ).toBe('#2F7864');
  await page.getByRole('combobox', { name: '明暗模式' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(fonts.every((url) => url.includes('patrick-hand'))).toBe(true);
});

test('reading navigation remains usable on a narrow screen', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('http://127.0.0.1:4178/?view=reading');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.getByRole('button', { name: '打开项目导航' }).click();
    await expect(page.locator('.study-header')).toHaveCSS('height', '48px');
    await expectNavigationAlignment(page.getByRole('dialog').locator('.ds-nav-item'), {
      count: 3,
      height: 44,
    });
    await page.getByRole('dialog').getByRole('link', { name: '项目综述' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('#what')).toBeInViewport();
  } finally {
    await context.close();
  }
});
