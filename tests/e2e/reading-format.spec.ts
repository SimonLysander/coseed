import { expect, test } from '@playwright/test';
import { createFixture, saveFixtureOverview } from '../helpers/project-fixture.js';
import { chooseAppearance } from '../helpers/appearance.js';

test('Markdown tables and code stay within the reading column in both themes and narrow viewports', async ({
  page,
  request,
  baseURL,
}) => {
  const project = await createFixture(request, '正文格式验证');
  await saveFixtureOverview(baseURL!, project.projectId, {
    product: {
      markdown: [
        '### 资料结构',
        '正文按段落解释内容，**重点**保持可辨识。',
        '| 资料 | 作用 |\n| --- | --- |\n| 项目综述 | 说明当前目标和范围 |\n| 需求推进 | 保留决定及结果 |',
        '> **记录示例**：先核对材料，再说明结论。\n>\n> 补充条件另起一段。',
        '- 阅读资料\n  - 核对背景\n- 判断范围',
        '### 字段对照',
        '| 标识 | 名称 | 范围 | 阶段 | 依据 | 时间 |\n| --- | --- | --- | --- | --- | ---: |\n| requirement | 示例目标 | 明确范围 | 设计中 | 已取得材料 | 1 |',
        `\`\`\`ts\nconst identifier = "${'long-identifier-'.repeat(30)}";\n\`\`\``,
      ].join('\n\n'),
    },
    concepts: { entries: [], relations: [] },
    examples: { introductionMd: null, actors: [], useCases: [], sections: [] },
  });
  await page.goto(`/#/projects/${project.projectId}/overview`);
  const tables = page.getByRole('region', { name: '表格内容', exact: true });
  await expect(tables).toHaveCount(2);
  await expect(tables.first().getByRole('columnheader').first()).toHaveAttribute('scope', 'col');
  for (const mode of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await chooseAppearance(page, mode);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const labelLines = await tables
        .first()
        .locator('tbody tr:first-child td:first-child')
        .evaluate((cell) => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          return range.getClientRects().length;
        });
      expect(labelLines).toBe(1);
      const geometry = await page
        .locator('.overview-section > .reading-markdown')
        .first()
        .evaluate((body) => {
          const heading = body.querySelector('h3')!.getBoundingClientRect();
          const paragraph = body.querySelector('p')!.getBoundingClientRect();
          const table = body.querySelector('.reading-table-scroll')!.getBoundingClientRect();
          const quote = body.querySelector('blockquote')!;
          const quotedText = quote.querySelector('p')!.getBoundingClientRect();
          const list = body.querySelector('ul')!;
          const codeStyle = getComputedStyle(body.querySelector('pre')!);
          return {
            headingGap: paragraph.top - heading.bottom,
            tableGap: table.top - paragraph.bottom,
            quoteInset: quotedText.left - quote.getBoundingClientRect().left,
            listInset:
              list.querySelector('li')!.getBoundingClientRect().left -
              list.getBoundingClientRect().left,
            codePadding: [
              codeStyle.paddingTop,
              codeStyle.paddingRight,
              codeStyle.paddingBottom,
              codeStyle.paddingLeft,
            ].map(parseFloat),
          };
        });
      expect(geometry.headingGap).toBe(8);
      expect(geometry.tableGap).toBe(12);
      expect(geometry.quoteInset).toBe(18);
      expect(geometry.listInset).toBe(24);
      expect(geometry.codePadding).toEqual([12, 12, 12, 12]);
      for (const column of ['first-child', 'last-child']) {
        const padding = await tables
          .first()
          .locator(`tbody tr:first-child td:${column}`)
          .evaluate((cell) => {
            const style = getComputedStyle(cell);
            return [parseFloat(style.paddingInlineStart), parseFloat(style.paddingInlineEnd)];
          });
        expect(padding).toEqual([12, 12]);
      }
      if (width < 768) {
        const wideTable = tables.last();
        expect(await wideTable.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await wideTable.evaluate((node) => {
          node.scrollLeft = 0;
        });
        await wideTable.focus();
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => wideTable.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        expect(await wideTable.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe(
          'solid',
        );
      }
      const code = page.locator('.reading-markdown pre');
      expect(await code.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    }
  }
});
