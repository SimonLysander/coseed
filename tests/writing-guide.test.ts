import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import catalog from '../docs/requirements/authoring-review/catalog.json' with { type: 'json' };

describe('authoring review provenance', () => {
  it('preserves literal document excerpts and keeps every agreement uniquely identifiable', () => {
    const ids: string[] = [];
    for (const topic of catalog.topics)
      for (const section of topic.sections)
        for (const rule of section.agreements) {
          ids.push(rule.id);
          if ('file' in rule.source)
            expect(
              readFileSync(rule.source.file, 'utf8'),
              `${rule.id} must remain a literal excerpt`,
            ).toContain(rule.excerpt);
          else expect(rule.source.label).toContain('未取得平台消息编号');
        }
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('connects every reading paragraph to existing evidence without mixing source quotes into its text', () => {
    for (const topic of catalog.topics)
      for (const section of topic.sections) {
        const ids = new Set(section.agreements.map((agreement) => agreement.id));
        const covered = new Set(section.readings.flatMap((reading) => reading.agreementIds));
        expect([...covered].sort()).toEqual([...ids].sort());
        for (const reading of section.readings) {
          expect(reading.markdown.trim().length).toBeGreaterThan(0);
          expect(reading.markdown).not.toContain('不对，我觉得');
        }
      }
  });
  it('leaves incomplete reconstruction explicit and does not replace runtime MCP guidance', () => {
    expect(catalog.status).toBe('review');
    expect(catalog.topics.every((topic) => topic.questions.length > 0)).toBe(true);
    const guide = readFileSync('src/server/mcp/guides.ts', 'utf8');
    expect(guide).not.toContain('authoring-review');
    expect(guide).toContain('guideVersion: 1');
  });
});

it('keeps the reviewed obligations explicit instead of weakening them to checks', () => {
  const readings = catalog.topics.flatMap((topic) =>
    topic.sections.flatMap((section) => section.readings),
  );
  const textFor = (id: string) =>
    readings
      .filter((reading) => reading.agreementIds.includes(id))
      .map((reading) => reading.markdown)
      .join('\n');
  expect(textFor('design-complete')).toContain('所有节点必须正交完备');
  expect(textFor('design-relations')).toContain('关联字段');
  expect(textFor('relation-notation')).toContain('开放箭头');
  expect(textFor('relation-notation')).toContain('实线、无箭头');
  expect(textFor('record-single-requirement')).toContain('有且只有一个主需求');
  expect(textFor('record-unknown-time')).toContain('无法核实时填 `null`');
  expect(textFor('state-facts')).toContain('实现过程');
  expect(textFor('state-transitions')).toContain('状态没变，不制造一次状态变化');
});

it('gives illustrations their own evidence and keeps them separate from obligations', () => {
  for (const topic of catalog.topics)
    for (const section of topic.sections) {
      const ids = new Set(section.agreements.map((agreement) => agreement.id));
      for (const example of section.examples) {
        expect(example.markdown.trim()).not.toBe('');
        expect(example.agreementIds.length).toBeGreaterThan(0);
        expect(example.agreementIds.every((id) => ids.has(id))).toBe(true);
      }
    }
});
