import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureSystemDiagram } from '../helpers/system-diagram.js';
import { cite, group, source, startTestMcp } from './client.js';

describe('incremental overview changes over MCP', () => {
  let session: Awaited<ReturnType<typeof startTestMcp>>;
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coseed-overview-edits-'));
    session = await startTestMcp(directory);
  });
  afterAll(async () => {
    await session?.client.close();
    await session?.app.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const diagram = (input: unknown) => group('overview.system_diagram', input);
  const examples = (input: unknown) => group('overview.examples', input);
  async function project(name: string) {
    const { projectId } = await session.createProject(name);
    const request = (baseVersion: number, requestKey: string, ...changes: unknown[]) => ({
      projectId,
      baseVersion,
      requestKey,
      sources: [source()],
      changes,
    });
    const read = async (version: number) => {
      const result = await session.client.readResource({
        uri: 'coseed://projects/' + projectId + '/v' + version + '/overview',
      });
      const value = result.contents[0]!;
      if (!('text' in value)) throw Error('Expected overview revision');
      return JSON.parse(value.text).revision;
    };
    await session.data(
      'save_changes',
      request(0, 'product', group('overview.product', { markdown: 'Fictional product.' })),
    );
    return { projectId, request, read };
  }

  it('saves one label, retries the same request, and preserves the prior complete diagram', async () => {
    const { projectId, request, read } = await project('single-label');
    const relabel = diagram({
      edits: [{ op: 'update', source: 'reader', target: 'app', label: '搜索与提交' }],
    });
    const early = await session.call('save_changes', request(1, 'early', relabel));
    expect(early.error).toMatchObject({
      code: 'PREREQUISITE_MISSING',
      details: { issues: [{ field: 'systemDiagram' }] },
    });
    await session.data('save_changes', request(1, 'complete', diagram(fixtureSystemDiagram)));
    const edit = request(2, 'label-only', relabel);
    const saved = await session.data('save_changes', edit);
    expect(saved.items).toMatchObject([{ group: 0, path: 'edits[0]', status: 'saved' }]);
    expect((await session.data('save_changes', edit)).receipt).toEqual(saved.receipt);
    expect((await session.call('save_changes', request(2, 'stale', relabel))).error?.code).toBe(
      'CONFLICT',
    );
    const updated = await read(3);
    expect(updated.content.systemDiagram).toEqual({
      ...fixtureSystemDiagram,
      edges: [{ source: 'reader', target: 'app', label: '搜索与提交' }],
    });
    expect(updated.citations).toMatchObject([{ side: 'after', path: '/systemDiagram/edges/0' }]);
    expect((await read(2)).content.systemDiagram).toEqual(fixtureSystemDiagram);
    const wrongField = diagram({
      edits: [
        {
          op: 'update',
          source: 'reader',
          target: 'app',
          label: '读取',
          citations: [{ ...cite()[0]!, path: '/target' }],
        },
      ],
    });
    expect(
      (await session.call('save_changes', request(3, 'unrelated-evidence', wrongField))).error
        ?.code,
    ).toBe('MISSING_EVIDENCE');
    const remove = diagram({
      edits: [
        { op: 'remove', source: 'reader', target: 'app', citations: cite('$evidence', 'before') },
      ],
    });
    expect(
      (await session.call('save_changes', request(3, 'last-edge', remove))).error,
    ).toBeDefined();
    expect((await session.data('get_project', { projectId })).version).toBe(3);
  });

  it('resolves parallel edges against the read version and cites their final positions', async () => {
    const { projectId, request, read } = await project('parallel-edges');
    const ends = { source: 'reader', target: 'app' };
    const reverse = { source: 'app', target: 'reader', label: '通知' };
    const initial = {
      ...fixtureSystemDiagram,
      edges: [{ ...ends, label: '查阅' }, { ...ends, label: '提交' }, reverse],
    };
    await session.data('save_changes', request(1, 'complete', diagram(initial)));
    const relabel = { op: 'update', ...ends, previousLabel: '提交', label: '保存' };
    const remove = {
      op: 'remove',
      ...ends,
      previousLabel: '查阅',
      citations: cite('$evidence', 'before'),
    };
    const partial = diagram({ edits: [relabel] });
    const invalidBatches = [
      [diagram({ edits: [{ op: 'update', ...ends, label: '查找' }] })],
      [partial, partial],
      [diagram(initial), partial],
      [partial, diagram(initial)],
      [diagram({ edits: [relabel, { op: 'add', ...ends, label: '保存' }] })],
      [
        partial,
        diagram({ edits: [{ op: 'add', source: 'missing', target: 'app', label: '保存' }] }),
      ],
    ];
    for (const [i, changes] of invalidBatches.entries()) {
      const result = await session.call('save_changes', request(2, 'invalid-' + i, ...changes));
      expect(result.error).toBeDefined();
      if (i === 0) expect(result.error?.details?.reason).toContain('previousLabel');
    }
    expect((await session.data('get_project', { projectId })).version).toBe(2);
    const add = { op: 'add', ...ends, label: '检索' };
    const result = await session.data(
      'save_changes',
      request(2, 'batch', partial, diagram({ edits: [remove, add] })),
    );
    expect(
      result.items.map((item: { group: number; path: string }) => [item.group, item.path]),
    ).toEqual([
      [0, 'edits[0]'],
      [1, 'edits[0]'],
      [1, 'edits[1]'],
    ]);
    expect(result.receipt.changes).toHaveLength(1);
    const updated = await read(3);
    expect(updated.content.systemDiagram).toEqual({
      ...initial,
      edges: [{ ...ends, label: '保存' }, reverse, { ...ends, label: '检索' }],
    });
    expect(updated.citations).toHaveLength(3);
    expect(updated.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side: 'after', path: '/systemDiagram/edges/0' }),
        expect.objectContaining({ side: 'before', path: '/systemDiagram/edges/0' }),
        expect.objectContaining({ side: 'after', path: '/systemDiagram/edges/2' }),
      ]),
    );
    expect((await read(2)).content.systemDiagram).toEqual(initial);
  });

  it('changes only the selected use cases and rejects dangling or conflicting selections atomically', async () => {
    const { projectId, request, read } = await project('use-case-selection');
    await session.data('save_changes', request(1, 'diagram', diagram(fixtureSystemDiagram)));
    await session.data(
      'save_changes',
      request(
        2,
        'context',
        group('overview.example_context', { introductionMd: '测试的共同背景。' }),
      ),
    );
    const section = (id: string, useCaseIds: string[]) => ({
      id,
      title: '示例 ' + id,
      markdown: '保留这一节原先的正文。',
      diagram: { id: 'figure-' + id, useCaseIds },
    });
    const initial = {
      actors: [{ id: 'developer', name: '开发者' }],
      useCases: ['read', 'save', 'review'].map((id) => ({ id, name: id, actorIds: ['developer'] })),
      sections: [section('one', ['read', 'save']), section('two', ['save', 'review'])],
    };
    await session.data('save_changes', request(3, 'examples', examples(initial)));
    const selection = { sectionId: 'one', attach: ['review'], detach: ['read'] };
    const change = examples({ selections: [selection, { sectionId: 'two', attach: ['read'] }] });
    const rejected = [
      [examples({ selections: [selection] })],
      [examples({ selections: [{ sectionId: 'one', attach: ['unknown'] }] })],
      [
        examples({
          selections: [
            { sectionId: 'one', detach: ['read', 'save'] },
            { sectionId: 'two', attach: ['read'] },
          ],
        }),
      ],
      [examples({ selections: [{ sectionId: 'one', attach: ['save'], detach: ['save'] }] })],
      [change, examples({ sections: [initial.sections[0]] })],
      [examples({ remove: [{ kind: 'example', id: 'one' }] }), change],
    ];
    for (const [i, changes] of rejected.entries())
      expect(
        (await session.call('save_changes', request(4, 'invalid-' + i, ...changes))).error,
      ).toBeDefined();
    expect((await session.data('get_project', { projectId })).version).toBe(4);
    const saved = await session.data('save_changes', request(4, 'change-selection', change));
    expect(saved.items.map((item: { id: string }) => item.id)).toEqual(['one', 'two']);
    const current = await read(5);
    const old = await read(4);
    expect(old.content.examples.sections).toEqual(initial.sections);
    expect(current.content).toEqual({
      ...old.content,
      examples: {
        ...old.content.examples,
        sections: [section('one', ['save', 'review']), section('two', ['save', 'review', 'read'])],
      },
    });
    expect(current.citations.map((c: { path: string }) => c.path).sort()).toEqual([
      '/examples/sections/0/diagram/useCaseIds',
      '/examples/sections/1/diagram/useCaseIds',
    ]);
    const drop = examples({
      selections: [{ sectionId: 'one', detach: ['save'], citations: cite('$evidence', 'before') }],
    });
    await session.data('save_changes', request(5, 'drop-first', drop));
    expect((await read(6)).content.examples.sections[0]).toEqual(section('one', ['review']));

    // Existing full-section requests can still cite individual positions, including
    // when another section uses the new membership syntax in the same transaction.
    const reorder = section('two', ['read', 'review', 'save']);
    await session.data(
      'save_changes',
      request(
        6,
        'mixed-sections',
        examples({
          sections: [
            {
              ...reorder,
              citations: [0, 2].map((i) => ({
                ...cite()[0]!,
                path: '/diagram/useCaseIds/' + i,
              })),
            },
          ],
          selections: [{ sectionId: 'one', attach: ['read'] }],
        }),
      ),
    );
    expect((await read(7)).content.examples.sections).toEqual([
      section('one', ['review', 'read']),
      reorder,
    ]);
  });
});
