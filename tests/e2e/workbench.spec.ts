import { chooseAppearance } from '../helpers/appearance.js';
import { expect, test } from '@playwright/test';
import themes from '../../src/web/design-system/themes.json' with { type: 'json' };
import { createFixture } from '../helpers/project-fixture.js';
import { expectNavigationAlignment } from '../helpers/navigation-layout.js';

function cssRgb(hex: string) {
  return `rgb(${[1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
}

test('workbench navigation aligns icons and labels without baseline space', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.page-header')).toHaveCount(0);
  const rows = page.locator('.sidebar nav .ds-nav-item');
  await expect(rows).toHaveText(['概览', '结构设计', '时间线']);
  const actions = page.locator('.sidebar-bottom .ds-nav-item');
  await expectNavigationAlignment(rows, { count: 3, height: 36 });
  await expectNavigationAlignment(actions, { count: 2, height: 36 });
  expect((await actions.first().boundingBox())!.width).toBe(
    (await rows.first().boundingBox())!.width,
  );
  await page.setViewportSize({ width: 900, height: 1000 });
  await expectNavigationAlignment(rows, { count: 3, height: 36, rail: true });
  await expectNavigationAlignment(actions, { count: 2, height: 36, rail: true });
  const slot = page.locator('.sidebar .project-slot');
  await expect(slot).toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
  await expect(slot).toHaveCSS('height', '36px');
  const projectIcon = await slot.locator('.project-picker-prefix .ds-icon').boundingBox();
  const navigationIcon = await rows.first().locator('.ds-icon').boundingBox();
  expect(projectIcon!.x + projectIcon!.width / 2).toBeCloseTo(
    navigationIcon!.x + navigationIcon!.width / 2,
    0,
  );
});

test('current pages keep their highlight while other sidebar actions are hovered', async ({
  page,
  request,
}) => {
  const { projectId } = await createFixture(request, '导航状态验证');
  await page.goto(`/#/projects/${projectId}/requirements`);
  const sidebar = page.locator('.sidebar');
  const timeline = sidebar.getByRole('menuitem', { name: '时间线' });
  const overview = sidebar.getByRole('menuitem', { name: '概览' });
  const guide = sidebar.getByRole('link', { name: '接入指南' });
  const theme = sidebar.getByRole('button', { name: /^切换到/ });
  for (const mode of ['light', 'dark'] as const) {
    const palette = themes.modes[mode].color;
    await chooseAppearance(page, mode);
    await timeline.click();
    await expect(page).toHaveTitle('时间线 · CoSeed');
    await expect(timeline).toHaveAttribute('aria-current', 'page');
    for (const item of [overview, guide, theme]) {
      await item.hover();
      await expect(item).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(item).toHaveCSS('background-color', cssRgb(palette.surface.hover), {
        pseudo: 'before',
      });
      await expect(item).toHaveCSS('opacity', '1', { pseudo: 'before' });
      await expect(timeline).toHaveCSS('background-color', cssRgb(palette.accent.soft));
    }
    await guide.click();
    await expect(page).toHaveTitle('接入指南 · CoSeed');
    await expect(guide).toHaveAttribute('aria-current', 'page');
    await expect(guide).toHaveCSS('opacity', '0', { pseudo: 'before' });
    await theme.hover();
    await expect(guide).toHaveCSS('background-color', cssRgb(palette.accent.soft));
  }
});

test('switching appearance paints the selected and hovered rows in the new palette on the first frame', async ({
  page,
}) => {
  await page.goto('/#/agent-guide');
  const sidebar = page.locator('.sidebar-bottom');
  const toggle = sidebar.getByRole('button', { name: /^切换到/ });
  await chooseAppearance(page, 'light');
  await toggle.hover();
  await expect(toggle).toHaveCSS('opacity', '1', { pseudo: 'before' });
  for (const mode of ['dark', 'light'] as const) {
    const observation = await sidebar.evaluateHandle((element) => ({
      firstPaint: new Promise<string[]>((resolve) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          requestAnimationFrame(() => {
            const selected = getComputedStyle(element.querySelector('[aria-current="page"]')!);
            const hovered = getComputedStyle(element.querySelector('button')!, '::before');
            resolve([selected.backgroundColor, hovered.backgroundColor, hovered.opacity]);
          });
        });
        observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
      }),
    }));
    await toggle.click();
    const colors = await observation.evaluate(({ firstPaint }) => firstPaint);
    await observation.dispose();
    const palette = themes.modes[mode].color;
    expect(colors).toEqual([cssRgb(palette.accent.soft), cssRgb(palette.surface.hover), '1']);
  }
});

test('passing the pointer across sidebar icons preserves their strokes and position', async ({
  page,
}) => {
  await page.goto('/');
  const sidebar = page.locator('.sidebar');
  for (const action of [
    sidebar.getByRole('link', { name: '接入指南' }),
    sidebar.getByRole('button', { name: /^切换到/ }),
  ]) {
    const svg = action.locator('svg');
    const original = await svg.evaluate((element) => element.outerHTML);
    await svg.hover();
    const frames = await svg.evaluate(async (element) => {
      const samples = new Set<string>();
      for (let frame = 0; frame < 12; frame++) {
        await new Promise(requestAnimationFrame);
        samples.add(element.outerHTML);
      }
      return [...samples];
    });
    expect(frames).toEqual([original]);
  }
});

test('workbench has no redundant service connection entry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('选择项目 · CoSeed');
  await expect(page.getByText('让理解跟得上开发', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '选择项目' })).toBeVisible();
  await expect(page.getByText('本地服务已就绪', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '服务连接' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the mobile drawer has a single home link and closes when navigating home', async ({
  page,
  request,
}) => {
  const { projectId } = await createFixture(request, '手机导航验证');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/projects/${projectId}/business`);
  await expect(page).toHaveTitle('结构设计 · CoSeed');
  const openMenu = page.getByRole('button', { name: '打开主导航' });
  const drawer = page.getByRole('dialog', { name: 'CoSeed', exact: true });
  for (const current of ['结构设计', '概览']) {
    await openMenu.click();
    await expect(drawer.getByRole('menuitem', { name: current })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(drawer.getByText('CoSeed', { exact: true })).toHaveCount(1);
    await drawer.getByRole('link', { name: 'CoSeed 首页' }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/overview$`));
    await expect(page).toHaveTitle('概览 · CoSeed');
  }
});

test('narrow reading layout does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('heading', { name: '选择项目' })).toBeVisible();
  await page.getByRole('button', { name: '打开主导航' }).click();
  await expect(page.getByRole('dialog').getByText('本地服务已就绪', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: '服务连接' })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('combobox', { name: '选择项目', exact: true }).click();
  await expect(page.getByRole('region', { name: '选择项目', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('failed connection can be retried', async ({ page }) => {
  await page.route('**/api/status', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/status');
  await page.getByRole('button', { name: '重新连接' }).click();
  await expect(page.getByText('本地服务已就绪', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).not.toBeVisible();
  await expect(page.getByRole('button', { name: '服务连接' })).toHaveCount(0);
});

test('workbench uses the shared system typography and pine-green modes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByText('本地服务已就绪', { exact: true })).toHaveCount(0);
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByRole('heading', { name: '选择项目' })).toHaveCSS('font-size', '26px');
  await expect(page.locator('.sidebar')).toHaveCSS('width', '208px');
  await expect(page.locator('.sidebar .ant-menu-item-selected')).toHaveCSS('border-radius', '10px');
  expect(
    await page
      .locator('html')
      .evaluate((element) =>
        (element as HTMLElement).style.getPropertyValue('--ds-color-accent-solid'),
      ),
  ).toBe('#2F7864');
  await chooseAppearance(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('.sidebar').getByRole('combobox', { name: '选择项目', exact: true }).click();
  await expect(page.locator('.project-picker-popup')).toHaveCSS('border-radius', '16px');
  await expect(page.locator('.project-picker-popup')).toHaveCSS(
    'background-color',
    'rgb(35, 35, 41)',
  );
  await page.locator('.sidebar').getByRole('combobox').press('Escape');
  await page.reload();
  await expect(page.getByRole('button', { name: '切换到浅色', exact: true })).toBeVisible();
});

test('saved application mode paints before the application loads', async ({ page }) => {
  await page.addInitScript((keys) => {
    localStorage.setItem(keys.applicationKey, JSON.stringify({ mode: 'dark' }));
  }, themes.preferences);
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(18, 18, 18)');
  await expect(page.locator('#root')).toBeEmpty();
});

test('sun and moon button switches directly by mouse and keyboard and remembers the choice', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const darkAction = page.getByRole('button', { name: '切换到深色', exact: true });
  await expect(darkAction).toHaveCSS('height', '36px');
  await expect(darkAction.locator('.appearance-label')).toHaveText('浅色模式');
  await expect(darkAction.locator('svg')).toHaveAttribute('width', '18');
  await expect(darkAction.locator('svg circle')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('select')).toHaveCount(0);
  await darkAction.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const lightAction = page.getByRole('button', { name: '切换到浅色', exact: true });
  await expect(lightAction.locator('.appearance-label')).toHaveText('深色模式');
  await expect(lightAction.locator('svg circle')).toHaveCount(0);
  await page.mouse.move(700, 250);
  await expect(lightAction).toHaveCSS('color', cssRgb(themes.modes.dark.color.text.secondary));
  await lightAction.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await darkAction.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(lightAction).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('obsolete system preference falls back to light before JavaScript loads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(
    (key) => localStorage.setItem(key, JSON.stringify({ mode: 'system' })),
    themes.preferences.applicationKey,
  );
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('sidebar bottom stays aligned before and after the guide loads, without a top bar or theme tooltip', async ({
  page,
}) => {
  await page.goto('/');
  for (const width of [1280, 900]) {
    await page.setViewportSize({ width, height: 900 });
    const sidebar = page.locator('.sidebar');
    const guide = sidebar.getByRole('link', { name: '接入指南', exact: true });
    const theme = sidebar.getByRole('button', { name: /^切换到(浅色|深色)$/ });
    await expect(guide).toHaveCSS('text-decoration-line', 'none');
    await expect(theme.locator('svg')).toBeVisible();
    const firstIcon = await sidebar.locator('nav .ds-icon').first().boundingBox();
    const guideIcon = await guide.locator('.ds-icon').boundingBox();
    expect(guideIcon!.x + guideIcon!.width / 2).toBeCloseTo(firstIcon!.x + firstIcon!.width / 2, 0);
    if (width === 1280) {
      await expect(theme.locator('.appearance-label')).toHaveText('浅色模式');
      await expect(theme.locator('.appearance-label')).toBeVisible();
      const themeIcon = await theme.locator('.ds-icon').boundingBox();
      expect(themeIcon!.x + themeIcon!.width / 2).toBeCloseTo(
        guideIcon!.x + guideIcon!.width / 2,
        0,
      );
      const guideLabel = await guide.locator('.sidebar-action-label').boundingBox();
      const themeLabel = await theme.locator('.appearance-label').boundingBox();
      expect(themeLabel!.x).toBeCloseTo(guideLabel!.x, 0);
      await expect(guide.locator('.sidebar-action-label')).toHaveCSS('white-space', 'nowrap');
      await expect(guide.locator('.sidebar-action-label')).toHaveCSS('line-height', '22px');
    } else {
      await expect(guide.locator('.sidebar-action-label')).not.toBeVisible();
      await expect(theme.locator('.appearance-label')).not.toBeVisible();
    }
    const bounds = await theme.boundingBox();
    expect(bounds!.x).toBeLessThan(56);
    expect(bounds!.y).toBeGreaterThan(600);
    await theme.hover();
    await page.waitForTimeout(600);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(page.locator('.page-header')).toHaveCount(0);
    await guide.click();
    await expect(page.getByRole('heading', { name: '接入指南' })).toBeVisible();
    await expect(theme.locator('svg')).toBeVisible();
    await page.mouse.move(700, 400);
    await expect(guide).toHaveCSS('color', 'rgb(47, 120, 100)');
    await page.goto('/');
  }
});
