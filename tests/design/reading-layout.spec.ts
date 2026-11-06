import { expect, test, type Locator } from '@playwright/test';
import { expectNavigationAlignment } from '../helpers/navigation-layout.js';

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error('预期布局元素不可见');
  return { ...value, right: value.x + value.width, bottom: value.y + value.height };
}

test('all reader regions align across desktop, tablet and phone breakpoints', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?view=reading');
  for (const width of [1920, 1440, 1280, 1279, 1024, 1023, 900, 768, 767, 600, 390, 320]) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => scrollTo(0, 0));
      const article = await box(page.locator('.study-article'));
      const main = await box(page.locator('.study-main'));
      const padding = width >= 1024 ? 32 : 20;
      expect(article.width).toBeLessThanOrEqual(660);
      expect(article.x).toBeGreaterThanOrEqual(main.x + padding);
      expect(article.right).toBeLessThanOrEqual(main.right - padding);
      expect(article.y - main.y).toBe(padding);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(page.locator('.study-header')).toHaveCSS('height', '48px');

      for (const item of await page.locator('.study-header > *').all()) {
        if (!(await item.isVisible())) continue;
        const bounds = await box(item);
        expect(Math.abs(bounds.y + bounds.height / 2 - 24)).toBeLessThanOrEqual(1);
        expect(bounds.right).toBeLessThanOrEqual(width - 12);
      }
      for (const item of await page
        .locator(
          '.study-article h1, .study-section h2, .study-section > p:not(.study-handnote), .study-review-note',
        )
        .all()) {
        expect((await box(item)).x).toBe(article.x);
      }
      const blocks = page.locator('.study-document-heading, .study-section');
      for (let i = 1; i < (await blocks.count()); i++) {
        expect((await box(blocks.nth(i))).y - (await box(blocks.nth(i - 1))).bottom).toBe(32);
      }
      for (const section of await page.locator('.study-section').all()) {
        const children = section.locator(':scope > *');
        for (let i = 1; i < (await children.count()); i++) {
          expect((await box(children.nth(i))).y - (await box(children.nth(i - 1))).bottom).toBe(12);
        }
      }
      const lastSection = await box(page.locator('.study-section').last());
      expect((await box(page.locator('.study-review-note'))).y - lastSection.bottom).toBe(40);

      for (const row of await page.locator('.study-concepts > div').all()) {
        const term = await box(row.locator('dt'));
        const description = await box(row.locator('dd'));
        expect(term.x).toBe(article.x);
        if (width >= 768) {
          expect(description.x - term.x).toBe(92);
          expect(description.y).toBe(term.y);
        } else {
          expect(description.x).toBe(article.x);
          expect(description.y - term.bottom).toBe(4);
        }
      }
      const note = await box(page.locator('.study-handnote'));
      expect(note.x).toBe(article.x + (width >= 768 ? 92 : 0));

      if (width >= 768) {
        await expect(page.locator('.study-sidebar')).toHaveCSS(
          'width',
          width >= 1024 ? '208px' : '56px',
        );
        await expectNavigationAlignment(page.locator('.study-sidebar .study-nav .ds-nav-item'), {
          count: 3,
          height: 36,
          rail: width < 1024,
        });
      } else {
        await expect(page.locator('.study-sidebar')).not.toBeVisible();
        await expect(page.getByRole('button', { name: '打开项目导航' })).toBeVisible();
      }
      if (width >= 1280) {
        const toc = await box(page.locator('.study-toc'));
        expect(toc.y).toBe(article.y);
        expect(toc.x - article.right).toBe(48);
        await expect(page.getByRole('button', { name: '打开阅读目录' })).not.toBeVisible();
      } else {
        await expect(page.locator('.study-toc')).not.toBeVisible();
        await expect(page.getByRole('button', { name: '打开阅读目录' })).toBeVisible();
      }
    });
  }
});

test('collapsed contents remains reachable and does not hide the target under the header', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 640 },
    hasTouch: true,
    isMobile: true,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4178/?view=reading');
    await page.getByRole('button', { name: '打开阅读目录' }).click();
    const popup = await box(page.locator('.study-toc-popup'));
    expect(popup.x).toBeGreaterThanOrEqual(0);
    expect(popup.right).toBeLessThanOrEqual(320);
    expect(popup.y).toBeGreaterThanOrEqual(48);
    for (const item of await page.getByRole('menuitem').all()) {
      expect((await box(item)).height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('menuitem', { name: '如何使用' }).click();
    await expect(page.locator('#usage h2')).toBeInViewport();
    expect((await box(page.locator('#usage h2'))).y).toBeGreaterThanOrEqual(48);
    await expect(page.locator('.study-toc-popup')).not.toBeVisible();
  } finally {
    await context.close();
  }
});

test('short windows keep sidebar links and sticky contents within a scrollable region', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 240 });
  await page.goto('/?view=reading');
  await expectNavigationAlignment(page.locator('.study-sidebar .study-nav .ds-nav-item'), {
    count: 3,
    height: 36,
  });
  const back = page.getByRole('link', { name: '返回设计样板' });
  await back.scrollIntoViewIfNeeded();
  expect((await box(back)).bottom).toBeLessThanOrEqual(240);
  const toc = await box(page.locator('.study-toc'));
  expect(toc.bottom).toBeLessThanOrEqual(240 - 32);
  await expect(page.locator('.study-toc')).toHaveCSS('overflow-y', 'auto');
  await page.locator('.study-reference').scrollIntoViewIfNeeded();
  await expect(page.locator('.study-reference')).toBeInViewport();
});

test('long headings and object descriptions wrap without breaking their columns', async ({
  page,
}) => {
  await page.goto('/?view=reading');
  await page.evaluate(() => {
    document.querySelector('.study-document-heading h1')!.textContent =
      '理解一个持续演进的项目，并跟上每次需求和设计变化'.repeat(3);
    document.querySelector('.study-concepts dt')!.textContent = '需求演进中的业务核心概念';
    document.querySelector('.study-concepts dd')!.textContent =
      `保存业务含义和实现依据，${'ExampleProjectIdentifier'.repeat(8)}`;
    document.querySelector('.study-marker')!.textContent =
      '这是一段会随屏幕宽度正常换行而不能撑破正文列的强调内容'.repeat(3);
  });
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const article = await box(page.locator('.study-article'));
    for (const selector of [
      '.study-document-heading h1',
      '.study-concepts dt',
      '.study-concepts dd',
    ]) {
      const element = await box(page.locator(selector).first());
      expect(element.x).toBeGreaterThanOrEqual(article.x);
      expect(element.right).toBeLessThanOrEqual(article.right);
    }
  }
});
