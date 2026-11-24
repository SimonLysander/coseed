import { readFileSync } from 'node:fs';
import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { readGuide } from '../src/server/mcp/guides.js';
import { requirementContentSchema } from '../src/contracts/content/requirements.js';

const document = readFileSync('docs/operations/agent-integration.md', 'utf8');

describe('one human and agent guide', () => {
  it('returns the source document verbatim, keeping topic schemas available', () => {
    expect(readGuide('usage').markdown).toBe(document);
    expect(readGuide('usage').guideVersion).toBe(11);
    for (const [topic, title] of [
      ['overview', '3. 编写概览'],
      ['requirements', '5. 更新时间线'],
      ['design', '4. 说明结构设计'],
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
        expect(guide.markdown).not.toContain('## 3. 编写概览');
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
      '资料不足处保持待确认',
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

  it('keeps requirement field rules in the shared schema instead of repeating them in the workflow', () => {
    const description = requirementContentSchema.shape.markdown.description;
    const { schemas, markdown } = readGuide('requirements');
    expect(description).toBeTruthy();
    expect(schemas).toHaveProperty('requirement.properties.markdown.description', description);
    expect(schemas).toHaveProperty(
      'requirement.required',
      expect.arrayContaining(['scope', 'primaryConcern']),
    );
    expect(document).not.toContain(description!);
    expect(markdown).not.toContain('涉及范围必须与当前项目业务全景');
    expect(document).toContain('需求字段的填写要求以需求内容 Schema 为准。');
  });

  it('keeps topic chapter mappings aligned with the source document', () => {
    const tokens = new MarkdownIt().parse(document, {});
    const titles = tokens.flatMap((token, index) =>
      token.type === 'heading_open' && token.tag === 'h2' ? [tokens[index + 1]!.content] : [],
    );
    expect(titles).toEqual([
      '1. 明确任务',
      '2. 连接并读取项目',
      '3. 编写概览',
      '4. 说明结构设计',
      '5. 更新时间线',
      '6. 保留依据和未知',
      '7. 保存并核对结果',
    ]);
  });
});
