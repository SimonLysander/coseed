import { readFileSync } from 'node:fs';
import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { readGuide } from '../src/server/mcp/guides.js';

const document = readFileSync('docs/operations/agent-integration.md', 'utf8');

describe('one human and agent guide', () => {
  it('returns the source document verbatim, keeping topic schemas available', () => {
    expect(readGuide('usage').markdown).toBe(document);
    expect(readGuide('usage').guideVersion).toBe(2);
    for (const [topic, title] of [
      ['overview', '3. 更新项目综述'],
      ['requirements', '4. 整理需求推进'],
      ['design', '5. 更新业务设计'],
      ['sources', '6. 保留依据和未知'],
      ['export', '2. 连接并读取项目'],
    ] as const) {
      const guide = readGuide(topic);
      expect(guide.markdown).toContain(`## ${title}`);
      // Paragraphs are literal source excerpts, not separately rewritten prompts.
      for (const paragraph of guide.markdown.split('\n\n')) expect(document).toContain(paragraph);
      expect(guide.markdown).toContain('Agent 的任务是结合用户目标');
      expect(guide.markdown).toContain('### 内容表达规范');
      if (topic !== 'export') {
        expect(guide.markdown).toContain('## 6. 保留依据和未知');
      } else {
        expect(guide.markdown).not.toContain('## 3. 更新项目综述');
      }
    }
    expect(readGuide('overview').schemas).toHaveProperty('overview');
    expect(readGuide('requirements').schemas).toHaveProperty('record');
    expect(readGuide('design').schemas).toHaveProperty('relationship');
    expect(readGuide('sources').schemas).toHaveProperty('citation');
  });

  it('retains the substantive obligations while allowing editorial revisions', () => {
    for (const obligation of [
      '由用户明确发起阶段回顾',
      '有且只有一个主需求',
      '引用其具体修订并说明变化',
      '六种状态均可回退、恢复和跳转',
      '一张图的所有节点必须正交完备',
      '完成审查后再补连线',
      '至少一端为本项目模块',
      '关联字段及两端数量',
      '返回信息写在原调用线上',
      '未知数量填 `null`',
      '不同说明范围允许交叉',
      'Hover 详情、点击展开或第三层代码页面',
      '人工更正与后续整理发生冲突时，保留现有内容',
      '本版待核对',
    ])
      expect(document).toContain(obligation);
    expect(document).not.toContain('不对，我觉得整个这里其实是');
    for (const interfaceTerm of [
      'manifestSha256',
      'nextAfterPath',
      'expectedRevision',
      'requestKey',
    ])
      expect(document).not.toContain(interfaceTerm);
    expect(readGuide('requirements').schemas).toHaveProperty(
      'record.properties.occurredAt.description',
      expect.stringContaining('无法核实时为 null'),
    );
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
      '2. 连接并读取项目',
      '3. 更新项目综述',
      '4. 整理需求推进',
      '5. 更新业务设计',
      '6. 保留依据和未知',
      '7. 保存并核对结果',
    ]);
  });
});
