import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  requirementContentDraftSchema,
  requirementStatusDraftSchema,
  requirementStatusLabels,
  progressRecordContentDraftSchema,
  retrospectiveContentDraftSchema,
} from '../../docs/database/requirements-content-draft.js';

const fixture = JSON.parse(
  readFileSync(new URL('../../docs/database/requirements.example.json', import.meta.url), 'utf8'),
);

describe('requirements content design proposal', () => {
  it('accepts the explanatory examples without treating them as write requests', () => {
    for (const requirement of fixture.requirements) {
      expect(requirementContentDraftSchema.safeParse(requirement.content).success).toBe(true);
    }
    for (const record of fixture.records) {
      expect(progressRecordContentDraftSchema.safeParse(record.content).success).toBe(true);
    }
    expect(
      progressRecordContentDraftSchema.safeParse(fixture.correctionExample.content).success,
    ).toBe(true);
    expect(
      retrospectiveContentDraftSchema.safeParse(fixture.retrospectiveExample.content).success,
    ).toBe(true);
    expect(progressRecordContentDraftSchema.safeParse(fixture.records[0]).success).toBe(false);
  });

  it('preserves unknown occurrence time and free Markdown without a fixed template', () => {
    const markdown = '简短结论。\n\n    原始缩进与换行';
    const content = { requirementId: 'requirement-a', title: '结论', markdown, occurredAt: null };
    expect(progressRecordContentDraftSchema.parse(content)).toEqual(content);
    expect(
      progressRecordContentDraftSchema.safeParse({ ...content, markdown: ' \n' }).success,
    ).toBe(false);
  });

  it('requires explicit occurrence time or null and rejects invalid timestamps', () => {
    const content = fixture.records[0].content;
    const { occurredAt: _time, ...withoutTime } = content;
    expect(progressRecordContentDraftSchema.safeParse(withoutTime).success).toBe(false);
    for (const occurredAt of [-1, 0.5, Infinity, '2026-11-06']) {
      expect(progressRecordContentDraftSchema.safeParse({ ...content, occurredAt }).success).toBe(
        false,
      );
    }
    expect(progressRecordContentDraftSchema.parse({ ...content, occurredAt: 0 }).occurredAt).toBe(
      0,
    );
  });

  it('requires one explicit parent requirement and does not accept a parent list', () => {
    const content = fixture.records[0].content;
    expect(
      progressRecordContentDraftSchema.safeParse({ ...content, requirementId: [] }).success,
    ).toBe(false);
    expect(
      progressRecordContentDraftSchema.safeParse({ ...content, requirementId: ' ' }).success,
    ).toBe(false);
    expect(
      progressRecordContentDraftSchema.safeParse({ ...content, requirementIds: ['a', 'b'] })
        .success,
    ).toBe(false);
  });

  it('keeps unsettled workflow fields and storage metadata out of content', () => {
    for (const key of [
      'priority',
      'assignee',
      'revisionNo',
      'projectId',
      'savedAt',
      'statusChangedAt',
      'sourceIds',
    ]) {
      expect(
        requirementContentDraftSchema.safeParse({
          ...fixture.requirements[0].content,
          [key]: 'unsettled',
        }).success,
      ).toBe(false);
    }
    expect(
      retrospectiveContentDraftSchema.safeParse({
        ...fixture.retrospectiveExample.content,
        status: 'running',
      }).success,
    ).toBe(false);
  });

  it('accepts exactly the six confirmed requirement states with their display labels', () => {
    expect(requirementStatusLabels).toEqual({
      designing: '设计中',
      ready_for_implementation: '方案已定',
      pending_acceptance: '待验收',
      completed: '已完成',
      on_hold: '暂缓',
      cancelled: '取消',
    });
    const content = fixture.requirements[0].content;
    for (const status of requirementStatusDraftSchema.options) {
      expect(requirementContentDraftSchema.parse({ ...content, status }).status).toBe(status);
    }
    for (const status of [
      'approved',
      'clarified',
      'running',
      '已确认',
      null,
      { value: 'completed', changedAt: 1 },
    ]) {
      expect(requirementContentDraftSchema.safeParse({ ...content, status }).success).toBe(false);
    }
  });

  it('requires an explicit state instead of inferring it from text or supplying a default', () => {
    const content = fixture.requirements[0].content;
    const { status: _status, ...withoutStatus } = content;
    expect(requirementContentDraftSchema.safeParse(withoutStatus).success).toBe(false);
    expect(
      requirementContentDraftSchema.parse({
        ...content,
        status: 'designing',
        markdown: 'Agent 报告已完成代码编写。',
      }).status,
    ).toBe('designing');
  });

  it('requires a review scope and result explanation without inventing execution states', () => {
    const content = fixture.retrospectiveExample.content;
    for (const field of ['title', 'scopeMd', 'summaryMd']) {
      expect(
        retrospectiveContentDraftSchema.safeParse({ ...content, [field]: '\n ' }).success,
      ).toBe(false);
    }
    expect(retrospectiveContentDraftSchema.parse(content)).toEqual(content);
  });
});
