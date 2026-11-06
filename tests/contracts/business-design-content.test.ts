import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  businessDesignBundleDraftSchema,
  type BusinessDesignBundleDraft,
} from '../../docs/database/business-design-draft.js';
const fixture = JSON.parse(
  readFileSync(
    new URL('../../docs/database/business-design.example.json', import.meta.url),
    'utf8',
  ),
) as BusinessDesignBundleDraft;
const copy = () => structuredClone(fixture);
const rejects = (edit: (value: BusinessDesignBundleDraft) => void, message?: string) => {
  const value = copy();
  edit(value);
  const parsed = businessDesignBundleDraftSchema.safeParse(value);
  expect(parsed.success).toBe(false);
  if (!parsed.success && message)
    expect(parsed.error.issues.some((issue) => issue.message.includes(message))).toBe(true);
};

describe('business-design content proposal', () => {
  it('accepts a module overview and its internal view with shared object identities', () => {
    expect(businessDesignBundleDraftSchema.parse(fixture)).toEqual(fixture);
    const internal = fixture.diagrams[1]!.content;
    expect(internal.scope).toEqual({
      kind: 'module',
      moduleId: 'requirements',
    });
  });
  it('preserves TS source formatting and allows unlocated planned implementations', () => {
    const parsed = businessDesignBundleDraftSchema.parse(fixture);
    expect(parsed.entities).toEqual(fixture.entities);
    const component = parsed.entities.find((item) => item.id === 'update-requirement')!.content;
    expect(component.kind === 'component' && component.primarySourceId).toBe(null);
  });
  it('rejects hand-positioned objects and geometry in business diagrams', () => {
    rejects((value) => {
      Object.assign(value.entities[0]!.content, { x: 10 });
    });
    rejects((value) => {
      Object.assign(value.diagrams[0]!.content, { layoutOptions: {} });
    });
  });
  it('rejects missing and mistyped owners without treating outside as a permanent node kind', () => {
    rejects((value) => {
      const content = value.entities[3]!.content;
      if (content.kind === 'component') content.owner.id = 'missing';
    }, '归属不存在');
    rejects((value) => {
      const content = value.entities[3]!.content;
      if (content.kind === 'component') content.owner.id = 'agent-client';
    }, '归属不存在');
  });
  it('rejects duplicate snapshots and two appearances of one object in the same view', () => {
    rejects((value) => {
      value.entities.push(value.entities[0]!);
    }, '同一项目快照内对象重复');
    rejects((value) => {
      value.diagrams[0]!.content.entityIds.push('requirements');
    }, '同图中对象重复');
  });
  it('uses stable graph members and rejects missing objects or legacy pinned refs', () => {
    rejects((value) => {
      value.diagrams[0]!.content.entityIds[0] = 'missing';
    }, '不存在的对象');
    rejects((value) => {
      value.diagrams[1]!.content.relationshipIds[0] = 'missing';
    }, '不存在的关系');
    rejects((value) => {
      value.diagrams[1]!.content.noteIds[0] = 'missing';
    }, '不存在的说明');
    rejects((value) => {
      Object.assign(value.diagrams[0]!.content, {
        entityRefs: [{ id: 'requirements', revisionNo: 1 }],
      });
    });
  });
  it('accepts a changed shared node without copying or revising the graph', () => {
    const value = copy();
    value.projectVersion = 2;
    const node = value.entities.find((entry) => entry.id === 'update-requirement')!;
    node.revisionNo = 2;
    node.content.summary = '更新后的职责描述。';
    const parsed = businessDesignBundleDraftSchema.parse(value);
    expect(parsed.diagrams).toEqual(fixture.diagrams);
    expect(fixture.entities.find((entry) => entry.id === node.id)!.revisionNo).toBe(1);
    rejects((model) => {
      model.entities.push({ ...model.entities[0]!, revisionNo: 2 });
    }, '同一项目快照内对象重复');
  });
  it('keeps the module scope and object layers explicit', () => {
    rejects((value) => {
      value.diagrams[0]!.content.entityIds.push('update-requirement');
    }, '图的层次');
    rejects((value) => {
      const scope = value.diagrams[1]!.content.scope;
      if (scope.kind === 'module') scope.moduleId = 'requirement-data';
    }, '模块范围无效');
  });
  it('rejects wrong endpoint kinds and relationships whose endpoints are not in the view', () => {
    rejects((value) => {
      const content = value.relationships[1]!.content;
      content.targetId = 'requirement-data';
    }, '两端对象种类不匹配');
    rejects((value) => {
      value.diagrams[1]!.content.entityIds = value.diagrams[1]!.content.entityIds.filter(
        (entityId) => entityId !== 'agent-review',
      );
    }, '端点未包含');
  });
  it('does not permit target or return data to leak into the wrong operation format', () => {
    rejects((value) => {
      const edge = value.relationships[2]!.content;
      if (edge.kind === 'read') Object.assign(edge.operations[0]!, { changes: 'invalid' });
    });
    rejects((value) => {
      const edge = value.relationships[3]!.content;
      if (edge.kind === 'write') Object.assign(edge.operations[0]!, { returns: { kind: 'none' } });
    });
    rejects((value) => {
      const edge = value.relationships[1]!.content;
      if (edge.kind === 'call')
        Object.assign(edge.operations[0]!, { returns: { kind: 'none', summary: 'not allowed' } });
    });
  });
  it('keeps unknown returns distinct from known no-return operations', () => {
    const value = copy();
    const edge = value.relationships[1]!.content;
    if (edge.kind !== 'call') throw new Error('fixture call not found');
    edge.operations[0]!.returns = null;
    expect(businessDesignBundleDraftSchema.parse(value)).toEqual(value);
    edge.operations[0]!.returns = { kind: 'none' };
    expect(businessDesignBundleDraftSchema.parse(value)).toEqual(value);
  });
  it('validates object multiplicities without guessing missing cardinalities', () => {
    rejects((value) => {
      const edge = value.relationships[5]!.content;
      if (edge.kind === 'object_association') edge.sourceMultiplicity = '5..2';
    }, '数量范围无效');
    const value = copy();
    const edge = value.relationships[5]!.content;
    if (edge.kind !== 'object_association') throw new Error('fixture association not found');
    edge.targetMultiplicity = null;
    expect(businessDesignBundleDraftSchema.safeParse(value).success).toBe(true);
  });
  it('rejects a note that claims objects outside the selected view', () => {
    rejects((value) => {
      value.notes[0]!.content.entityIds.push('overview');
    }, '说明范围超出了本图');
    rejects((value) => {
      value.notes[0]!.content.entityIds.push('missing');
    }, '不存在的对象');
  });
  it('allows semantic note membership to overlap without changing object ownership', () => {
    const value = copy();
    value.notes.push({
      id: 'second-note',
      revisionNo: 1,
      content: {
        title: '版本检查',
        problemMd: '基于旧版本提交时明确检测冲突。',
        entityIds: ['update-requirement', 'requirement-data'],
      },
    });
    value.diagrams[1]!.content.noteIds.push('second-note');
    expect(businessDesignBundleDraftSchema.parse(value)).toEqual(value);
  });
  it('keeps events separate from direct calls and preserves event identifiers', () => {
    const value = copy();
    value.relationships.push({
      id: 'fixture-event',
      revisionNo: 1,
      content: {
        kind: 'event',
        sourceId: 'update-requirement',
        targetId: 'maintain-records',
        summary: '结构验证用的虚构事件，不是 CoSeed 已确定方案。',
        events: [{ name: '样例变化', eventName: 'fixture.changed', payload: '样例对象 ID' }],
      },
    });
    expect(businessDesignBundleDraftSchema.safeParse(value).success).toBe(true);
    const edge = value.relationships.at(-1)!.content;
    if (edge.kind !== 'event') throw new Error('fixture event not found');
    edge.events.push(edge.events[0]!);
    expect(businessDesignBundleDraftSchema.safeParse(value).success).toBe(false);
  });
});
