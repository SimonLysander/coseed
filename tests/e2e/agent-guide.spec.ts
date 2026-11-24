import { chooseAppearance } from '../helpers/appearance.js';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { requirementFieldGuide } from '../../src/contracts/content/requirements.js';

const guideTitle = '接入指南';
const referenceTitle = 'Agent 写作规范';
const referenceLinkName = '阅读 Agent 写作规范';
const markdownPath = '/agent-writing-guide.md';

test('the human guide stays open when the reader opens the Markdown resource', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('link', { name: guideTitle, exact: true }).click();
  await expect(page.getByRole('heading', { name: guideTitle, exact: true })).toBeVisible();
  await expect(page.locator('.guide-section > h2')).toHaveText([
    '1连接项目',
    '2日常工作',
    '3更新项目资料',
  ]);
  await expect(page.locator('.sidebar-guide-link')).toHaveAttribute('aria-current', 'page');
  const article = page.getByRole('article');
  const resource = article.locator('header .guide-lead + [role="group"]');
  await expect(resource).toHaveAccessibleName(referenceTitle);
  const writingGuide = resource.getByRole('link', { name: referenceLinkName, exact: true });
  await expect(writingGuide).toBeInViewport();
  await expect(resource.getByRole('button', { name: '复制全文' })).toBeEnabled();
  await expect(writingGuide).toHaveAccessibleDescription(
    /编写或更新项目资料前，请 Agent 仔细阅读完整规范/,
  );
  await expect(writingGuide).toHaveAttribute('href', markdownPath);
  await writingGuide.focus();
  const pending = page.waitForEvent('popup');
  await writingGuide.press('Enter');
  const raw = await pending;
  await expect(raw).toHaveURL(markdownPath);
  expect(await raw.evaluate(() => document.contentType)).toBe('text/plain');
  await expect(raw.locator('body')).toContainText('# Agent 写作规范');
  await expect(raw.locator('body')).toContainText('## 7. 保存并核对结果');
  await raw.close();
  await expect(page).toHaveURL('/#/agent-guide');
  await expect(article.getByText(/Agent 提示词/)).toHaveCount(0);
  await expect(article.locator('details, .ant-collapse')).toHaveCount(0);
  const introduction = article.locator('header .guide-lead');
  await expect(introduction).toContainText(/按项目集中保存.*需求、设计和开发进展/);
  await expect(introduction).toContainText('独立于对话和业务代码仓库');
  await expect(introduction).toContainText('你可以指定要保留的讨论或改动');
  await expect(introduction).toContainText('AI 编程助手（Agent）');
  await expect(introduction).toContainText('新的对话');
  await expect(article.locator('section a[href]')).toHaveCount(0);
  const connection = article.getByRole('region', { name: '连接项目' });
  await expect(connection.locator('.reading-markdown').first().locator('strong')).toHaveText([
    '服务地址',
    '项目密钥',
  ]);
  await expect(connection).toContainText('访问令牌（Bearer Token）');
  const afterConnection = connection.locator('.guide-connection + .reading-markdown p');
  await expect(afterConnection).toHaveCount(2);
  await expect(afterConnection.first()).toContainText('读取当前连接的项目名称');
  await expect(afterConnection.last().locator('strong')).toHaveText('产品说明');
  await expect(afterConnection.last()).toContainText(/预期使用者.*需要解决的问题.*保存到 CoSeed/);
  await expect(afterConnection.last()).toContainText('打开「概览」，在「产品说明」中核对正文');
  const work = article.getByRole('region', { name: '日常工作' });
  await expect(work.getByRole('listitem').locator('strong')).toHaveText([
    '概览',
    '结构设计',
    '时间线',
  ]);
  const update = article.getByRole('region', { name: '更新项目资料' });
  await expect(update).toContainText(/需求范围发生变化.*设计方案确定.*验证完成/);
  await expect(update).toContainText(/指定.*讨论或代码改动/);
  await expect(update.getByRole('blockquote')).toContainText('保留更正前的内容');
  await expect(article.getByRole('button', { name: '复制全文' })).toHaveCount(1);
  await page.setViewportSize({ width: 1440, height: 480 });
  await page.goto('/#/agent-guide/guide-section-7');
  await expect(update.getByRole('heading')).toBeInViewport();
  await chooseAppearance(page, 'dark');
  await page.goto('/#/agent-guide/guide-section-4');
  await expect(page).toHaveURL(markdownPath);
  await expect(page.locator('body')).toContainText('## 5. 更新时间线');
  await page.goto('/#/agent-guide');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(article.getByRole('heading', { name: guideTitle, exact: true })).toBeInViewport();
  await expect(article.getByRole('link', { name: /本地开发[与和]运行/ })).toHaveCount(0);
  await page.locator('.sidebar').getByRole('menuitem', { name: '概览' }).click();
  await expect(page.getByRole('heading', { name: '选择项目' })).toBeVisible();
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
    await expect(page.getByRole('link', { name: referenceLinkName, exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: '复制全文' })).toBeInViewport();
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
  await page.getByRole('menuitem', { name: '日常工作' }).click();
  const heading = page.getByRole('heading', { name: '日常工作', exact: true });
  await expect(heading).toBeInViewport();
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(60);
  await page.goto('/#/agent-guide/guide-section-2');
  await expect(page.getByRole('heading', { name: '连接项目', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button', { name: '打开主导航' }).click();
  await page.getByRole('dialog').getByRole('menuitem', { name: '概览' }).click();
  await expect(page.getByRole('heading', { name: '选择项目' })).toBeVisible();
});

test('copy includes the current service address, while clipboard failure produces explicit feedback', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/agent-guide');
  const mcpAddress = new URL('/mcp', page.url()).href;
  await expect(page.getByRole('article').getByText(mcpAddress, { exact: true })).toBeVisible();
  const resource = page.getByRole('group', { name: referenceTitle });
  await resource.getByRole('button', { name: '复制全文', exact: true }).click();
  await expect(resource.getByRole('button', { name: '已复制', exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const file = await page.request.get(markdownPath);
  expect(file.ok()).toBe(true);
  expect(file.headers()['content-type']).toContain('text/plain');
  expect(copied).toBe(await file.text());
  expect(copied).toContain(mcpAddress);
  expect(copied).not.toContain('local-development.md');
  expect(copied.replace(mcpAddress, '/mcp')).toBe(
    readFileSync(
      new URL('../../docs/operations/agent-integration.md', import.meta.url),
      'utf8',
    ).replace('需求字段的填写要求以需求内容 Schema 为准。', () => requirementFieldGuide),
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
  await resource.getByRole('button', { name: '复制全文', exact: true }).click();
  await expect(resource.getByRole('alert')).toContainText('请打开原文后手动复制');
  await expect(resource.getByRole('link', { name: referenceLinkName })).toBeVisible();
});

test('the development guide uses the backend port configured for its API proxy', async ({
  page,
  baseURL,
}, testInfo) => {
  const backend = new URL(baseURL!);
  const previousPort = process.env.COSEED_PORT;
  process.env.COSEED_PORT = backend.port;
  const frontend = await createServer({
    cacheDir: testInfo.outputPath('vite-cache'),
    logLevel: 'error',
    server: { port: 0, hmr: false },
  }).finally(() => {
    if (previousPort === undefined) delete process.env.COSEED_PORT;
    else process.env.COSEED_PORT = previousPort;
  });
  try {
    await frontend.listen();
    await page.goto(new URL('/#/agent-guide', frontend.resolvedUrls!.local[0]).href);
    const mcpAddress = new URL('/mcp', backend).href;
    await expect(page.getByRole('article').getByText(mcpAddress, { exact: true })).toBeVisible();
    const file = await page.request.get(new URL(markdownPath, page.url()).href);
    expect(file.ok()).toBe(true);
    expect(await file.text()).toContain(`\`${mcpAddress}\``);
  } finally {
    await frontend.close();
  }
});

test('copies the issued project key from the full button and clears it when switching projects', async ({
  page,
  request,
}) => {
  const create = async (name: string) =>
    (
      await (
        await request.post('/api/projects', { data: { name, operationId: crypto.randomUUID() } })
      ).json()
    ).projectId;
  const a = await create('接入预览 A');
  const b = await create('接入预览 B');
  await page.addInitScript(() => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copied = value;
        },
        readText: async () => copied,
      },
    });
  });
  await page.goto('/#/projects/' + a + '/agent-guide');
  await expect(page.getByRole('link', { name: referenceLinkName })).toHaveAttribute(
    'href',
    markdownPath,
  );
  await page.goto('/#/projects/' + a + '/agent-guide/reference/guide-section-3');
  await expect(page).toHaveURL(markdownPath);
  await expect(page.locator('body')).toContainText('## 3. 编写概览');
  await page.goto('/#/projects/' + a + '/agent-guide');
  await page.getByRole('button', { name: '生成密钥' }).click();
  const secret = page.getByLabel(/完整密钥仅在生成时显示/);
  await expect(secret).toHaveValue(/^csk_/);
  const raw = await secret.inputValue();
  const copy = page.getByRole('button', { name: '复制密钥', exact: true });
  const expectCopiedKey = async () => {
    await expect
      .poll(() => page.evaluate(async (key) => (await navigator.clipboard.readText()) === key, raw))
      .toBe(true);
    await page.evaluate(() => navigator.clipboard.writeText(''));
  };
  await copy.getByText('复制密钥', { exact: true }).click();
  await expectCopiedKey();
  await expect(page.getByRole('status').filter({ hasText: '已复制项目密钥' })).toBeVisible();
  await copy.locator('.ant-btn-icon').click();
  await expectCopiedKey();
  await copy.focus();
  for (const key of ['Enter', 'Space']) {
    await copy.press(key);
    await expectCopiedKey();
  }
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Fixture clipboard denied');
        },
      },
    });
  });
  await copy.click();
  await expect(page.getByRole('alert')).toContainText('手动复制');
  const keyList = (await (await request.get('/api/projects/' + a + '/mcp-keys')).json()).items;
  expect(keyList).toHaveLength(1);
  expect(keyList[0].hint).toBe(raw.slice(-6));
  await page.goto('/#/projects/' + b + '/agent-guide');
  await expect(secret).toHaveCount(0);
  await expect(copy).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.guide-key-item')).toHaveCount(0);
  await page.goto('/#/projects/' + a + '/agent-guide');
  await expect(secret).toHaveCount(0);
  await expect(page.locator('.guide-key-item')).toHaveCount(1);
  await page.locator('.guide-key-item').getByRole('button', { name: '撤销' }).click();
  await page.getByRole('tooltip').getByRole('button', { name: '确认撤销' }).click();
  await expect(page.locator('.guide-key-item')).toHaveCount(0);
});
