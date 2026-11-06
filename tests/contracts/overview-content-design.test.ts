import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  projectOverviewDocumentDraftSchema,
  type ProjectOverviewDocumentDraft,
} from '../../docs/database/overview-content-draft.js';

const fixture = JSON.parse(
  readFileSync(
    new URL('../../docs/database/overview-content.example.json', import.meta.url),
    'utf8',
  ),
) as ProjectOverviewDocumentDraft;
const copy = () => structuredClone(fixture);
const rejects = (edit: (value: ProjectOverviewDocumentDraft) => void, message: string) => {
  const value = copy();
  edit(value);
  const result = projectOverviewDocumentDraftSchema.safeParse(value);
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues.some((issue) => issue.message.includes(message))).toBe(true);
};

describe('project overview content design proposal', () => {
  it('accepts the complete sample and preserves Markdown formatting', () => {
    const value = copy();
    value.content.product.markdown = '    缩进代码\n\n正文  \n下一行';
    expect(projectOverviewDocumentDraftSchema.parse(value)).toEqual(value);
  });

  it('keeps document content independent from project, revision, provenance and layout data', () => {
    for (const key of ['projectId', 'revisionNo', 'actor', 'sources', 'x']) {
      expect(
        projectOverviewDocumentDraftSchema.safeParse({ ...fixture, [key]: 'unexpected' }).success,
      ).toBe(false);
    }
    const value = copy();
    Object.assign(value.content.concepts.entries[0]!, { x: 10 });
    expect(projectOverviewDocumentDraftSchema.safeParse(value).success).toBe(false);
  });

  it('allows explicitly unfilled concepts and examples without inventing content', () => {
    const value = copy();
    value.content.concepts = { entries: [], relations: [] };
    value.content.examples = { introductionMd: null, actors: [], useCases: [], sections: [] };
    expect(projectOverviewDocumentDraftSchema.safeParse(value).success).toBe(true);
    value.content.product.markdown = ' \n';
    expect(projectOverviewDocumentDraftSchema.safeParse(value).success).toBe(false);
  });

  it('requires opening context for populated examples and preserves its Markdown', () => {
    rejects((value) => {
      value.content.examples.introductionMd = null;
    }, '开篇背景说明');
    rejects((value) => {
      value.content.examples.introductionMd = ' \n';
    }, '内容不能为空');
    const value = copy();
    const { introductionMd: _introduction, ...withoutIntroduction } = value.content.examples;
    expect(
      projectOverviewDocumentDraftSchema.safeParse({
        ...value,
        content: { ...value.content, examples: withoutIntroduction },
      }).success,
    ).toBe(false);
    value.content.examples.introductionMd = '共同前提。\n\n    保留原始缩进';
    expect(projectOverviewDocumentDraftSchema.parse(value).content.examples.introductionMd).toBe(
      value.content.examples.introductionMd,
    );
  });

  it('does not couple section diagrams to mutable headings or exact body substrings', () => {
    const value = copy();
    value.content.examples.sections[0]!.title = '一个重新表述的小标题';
    value.content.examples.sections[0]!.markdown = '用自然段重新描述该场景。';
    const parsed = projectOverviewDocumentDraftSchema.parse(value);
    expect(parsed.content.examples.sections[0]!.diagram).toEqual(
      fixture.content.examples.sections[0]!.diagram,
    );
  });

  it('allows the same use case to be selected by multiple section diagrams', () => {
    const value = copy();
    value.content.examples.sections[1]!.diagram.useCaseIds.push('read-overview');
    expect(projectOverviewDocumentDraftSchema.safeParse(value).success).toBe(true);
  });

  it('rejects duplicate object identities and duplicate concept facts', () => {
    rejects(
      (value) => value.content.concepts.entries.push(value.content.concepts.entries[0]!),
      'ID 重复',
    );
    rejects(
      (value) =>
        value.content.concepts.relations.push({
          ...value.content.concepts.relations[0]!,
          id: 'duplicate-relation',
        }),
      '重复的概念关系',
    );
    rejects(
      (value) => value.content.examples.actors.push(value.content.examples.actors[0]!),
      'ID 重复',
    );
    rejects(
      (value) => value.content.examples.useCases.push(value.content.examples.useCases[0]!),
      'ID 重复',
    );
    rejects(
      (value) => value.content.examples.sections.push(value.content.examples.sections[0]!),
      'ID 重复',
    );
  });

  it('rejects concept references that do not exist in this document', () => {
    rejects((value) => {
      value.content.concepts.relations[0]!.source = 'unknown';
    }, '不存在的概念');
    rejects((value) => {
      value.content.concepts.relations[0]!.target = 'unknown';
    }, '不存在的概念');
  });

  it('rejects kind-of and composition cycles separately', () => {
    rejects(
      (value) =>
        value.content.concepts.relations.push({
          id: 'kind-back',
          kind: 'kind-of',
          source: 'source',
          target: 'conversation-source',
        }),
      '种属关系存在循环',
    );
    rejects(
      (value) =>
        value.content.concepts.relations.push({
          id: 'part-back',
          kind: 'composition',
          source: 'overview',
          target: 'project',
        }),
      '组成关系存在循环',
    );
    rejects(
      (value) =>
        value.content.concepts.relations.push({
          id: 'self-kind',
          kind: 'kind-of',
          source: 'project',
          target: 'project',
        }),
      '种属关系存在循环',
    );
  });

  it('does not mistake a business association cycle for a hierarchy cycle', () => {
    const value = copy();
    value.content.concepts.relations.push({
      id: 'source-association-back',
      kind: 'association',
      source: 'source',
      target: 'overview',
      label: '支撑',
    });
    expect(projectOverviewDocumentDraftSchema.safeParse(value).success).toBe(true);
  });

  it('rejects unknown or repeated role and use-case references', () => {
    rejects(
      (value) => value.content.examples.useCases[0]!.actorIds.push('unknown'),
      '不存在的角色',
    );
    rejects(
      (value) => value.content.examples.useCases[0]!.actorIds.push('developer'),
      '角色引用重复',
    );
    rejects(
      (value) => value.content.examples.sections[0]!.diagram.useCaseIds.push('unknown'),
      '不存在的用例',
    );
    rejects(
      (value) => value.content.examples.sections[0]!.diagram.useCaseIds.push('read-overview'),
      '用例引用重复',
    );
  });

  it('rejects a populated section without its diagram or body and unsupported versions', () => {
    const value = copy();
    const { diagram: _diagram, ...withoutDiagram } = value.content.examples.sections[0]!;
    expect(
      projectOverviewDocumentDraftSchema.safeParse({
        ...value,
        content: {
          ...value.content,
          examples: { ...value.content.examples, sections: [withoutDiagram] },
        },
      }).success,
    ).toBe(false);
    rejects((candidate) => {
      candidate.content.examples.sections[0]!.markdown = ' ';
    }, '内容不能为空');
    expect(
      projectOverviewDocumentDraftSchema.safeParse({ ...fixture, schemaVersion: 2 }).success,
    ).toBe(false);
  });

  it('rejects unrendered use cases, unused roles and reused diagram identities', () => {
    rejects(
      (value) => value.content.examples.actors.push({ id: 'unused', name: '未使用的角色' }),
      '角色未参与',
    );
    rejects(
      (value) =>
        value.content.examples.useCases.push({
          id: 'unused',
          name: '未展示的用例',
          actorIds: ['developer'],
        }),
      '未被任何小节',
    );
    rejects((value) => {
      value.content.examples.sections[1]!.diagram.id =
        value.content.examples.sections[0]!.diagram.id;
    }, '图的 ID 重复');
  });

  it('validates a large hierarchy without recursive stack overflow', () => {
    const value = copy();
    value.content.concepts.entries = Array.from({ length: 8000 }, (_, index) => ({
      id: `node-${index}`,
      name: `词条 ${index}`,
      descriptionMd: '结构验证样例',
    }));
    value.content.concepts.relations = value.content.concepts.entries
      .slice(1)
      .map((entry, index) => ({
        id: `edge-${index}`,
        kind: 'kind-of',
        source: entry.id,
        target: `node-${index}`,
      }));
    expect(projectOverviewDocumentDraftSchema.safeParse(value).success).toBe(true);
  });
});
