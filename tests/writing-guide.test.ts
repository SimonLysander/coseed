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
  it('leaves incomplete reconstruction explicit and does not replace runtime MCP guidance', () => {
    expect(catalog.status).toBe('review');
    expect(catalog.topics.every((topic) => topic.questions.length > 0)).toBe(true);
    const guide = readFileSync('src/server/mcp/guides.ts', 'utf8');
    expect(guide).not.toContain('authoring-review');
    expect(guide).toContain('guideVersion: 1');
  });
});
