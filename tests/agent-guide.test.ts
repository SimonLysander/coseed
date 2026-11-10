import { readFileSync } from 'node:fs';
import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { readGuide } from '../src/server/mcp/guides.js';
import catalog from '../docs/requirements/authoring-review/catalog.json' with { type: 'json' };

const document = readFileSync('docs/operations/agent-integration.md', 'utf8');
const rendered = new MarkdownIt().render(document);

describe('one human and agent guide', () => {
  it('returns the source document verbatim, keeping topic schemas available', () => {
    expect(readGuide('usage').markdown).toBe(document);
    expect(readGuide('usage').guideVersion).toBe(2);
    for (const [topic, title] of [
      ['overview', '5. 更新项目综述'],
      ['requirements', '6. 整理需求推进'],
      ['design', '7. 更新业务设计'],
      ['sources', '8. 保留依据和未知'],
      ['export', '3. 读取完整资料'],
    ] as const) {
      const guide = readGuide(topic);
      expect(guide.markdown).toContain(`## ${title}`);
      // Paragraphs are literal source excerpts, not separately rewritten prompts.
      for (const paragraph of guide.markdown.split('\n\n')) expect(document).toContain(paragraph);
      expect(guide.markdown).toContain('你帮助开发者维护对项目的理解');
    }
    expect(readGuide('overview').schemas).toHaveProperty('overview');
    expect(readGuide('requirements').schemas).toHaveProperty('record');
    expect(readGuide('design').schemas).toHaveProperty('relationship');
    expect(readGuide('sources').schemas).toHaveProperty('citation');
  });

  it('retains the archived authoring obligations and illustrations without importing raw chat', () => {
    for (const topic of catalog.topics.filter((topic) => topic.id !== 'common')) {
      for (const section of topic.sections.filter((section) => section.id !== 'retrospective')) {
        for (const reading of section.readings)
          expect(rendered).toContain(new MarkdownIt().render(reading.markdown));
        for (const example of section.examples)
          expect(rendered).toContain(new MarkdownIt().render(example.markdown));
      }
    }
    expect(document).toContain('由用户明确发起阶段回顾');
    expect(document).toContain('人工更正遇到冲突时保留现有内容');
    expect(document).not.toContain('不对，我觉得整个这里其实是');
    expect(document).toContain('本版待核对');
  });

  it('publishes the document in the installable package and keeps navigation mappings explicit', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.files).toContain('docs/operations/agent-integration.md');
    const tokens = new MarkdownIt().parse(document, {});
    const titles = tokens.flatMap((token, index) =>
      token.type === 'heading_open' && token.tag === 'h2' ? [tokens[index + 1]!.content] : [],
    );
    expect(titles).toEqual([
      '1. 明确任务',
      '2. 连接并选择项目',
      '3. 读取完整资料',
      '4. 推进并发起回顾',
      '5. 更新项目综述',
      '6. 整理需求推进',
      '7. 更新业务设计',
      '8. 保留依据和未知',
      '9. 保存并核对结果',
    ]);
  });
});
