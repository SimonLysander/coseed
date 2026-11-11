import { expect, it } from 'vitest';
import { renderContentMarkdown } from '../src/web/reading/render-markdown.js';

it('keeps project Markdown below interface headings while preserving relative hierarchy', () => {
  const html = renderContentMarkdown('# 正文标题\n\n## 内部小节\n\n**重点**与正文。');
  expect(html).not.toMatch(/<h[12]\b/);
  expect(html).toContain('<h3 class="reading-content-heading">正文标题</h3>');
  expect(html).toContain('<h4 class="reading-content-heading">内部小节</h4>');
  expect(html).toContain('<strong>重点</strong>');
});

it('nests headings within records and notes without altering code or enabling HTML', () => {
  const html = renderContentMarkdown(
    '### 机制说明\n\n#### 细节\n\n```md\n# 代码中的文字\n```\n\n<script>example()</script>',
    5,
  );
  expect(html).toContain('<h5 class="reading-content-heading">机制说明</h5>');
  expect(html).toContain('<h6 class="reading-content-heading">细节</h6>');
  expect(html).toContain('# 代码中的文字');
  expect(html).not.toContain('<script>');
});
