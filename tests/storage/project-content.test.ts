import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { DatabaseService } from '../../dist/server/database/database.service.js';
import { ProjectContentService } from '../../dist/server/modules/project-content/project-content.service.js';
import type { ObjectType } from '../../src/contracts/project-content.js';

const context = {
  entrypoint: 'mcp',
  actorKind: 'agent',
  actorLabel: 'Explicitly fictional test agent',
};
const source = (
  id = randomUUID(),
  rawText = '  Fictional test material.\r\nNot user history.',
) => ({ id, kind: 'document', rawText, locator: {}, occurredAt: null });
const cite = (sourceId: string, side = 'after', path = '') => [
  { sourceId, side, path, explanationMd: 'Fictional source supports the complete stated change.' },
];
const upsert = (
  type: ObjectType,
  id: string,
  content: unknown,
  sourceId: string,
  expectedRevision: number | null = null,
  extra = {},
) => ({
  action: 'upsert',
  objectType: type,
  id,
  content,
  expectedRevision,
  citations: cite(sourceId),
  ...extra,
});
const requirement = (status = 'designing') => ({
  title: 'Fictional requirement',
  markdown: 'Implement a fictional capability.',
  status,
});
const record = (requirementId: string, markdown = 'Fictional conclusion.') => ({
  requirementId,
  title: 'Fictional progress',
  markdown,
  occurredAt: null,
});
const moduleNode = (name = 'Accounts') => ({
  kind: 'module',
  name,
  summary: 'Owns fictional account operations.',
  role: 'core',
});
const component = {
  kind: 'component',
  name: 'Account handler',
  summary: 'Handles fictional assignments.',
  owner: { kind: 'module', id: 'm' },
  primarySourceId: null,
};
const overview = {
  product: { markdown: 'Fictional product.' },
  concepts: {
    entries: [{ id: 'concept', name: 'Account', descriptionMd: 'A fictional account.' }],
    relations: [],
  },
  examples: { introductionMd: null, actors: [], useCases: [], sections: [] },
};

describe('actual project-content storage service', () => {
  let directory: string;
  let database: DatabaseService;
  let service: ProjectContentService;
  let projectId: string;
  const save = (changes: unknown[], sources: unknown[] = [], extra = {}) =>
    service.save(
      {
        projectId,
        operationId: randomUUID(),
        baseVersion: service.readSnapshot(projectId).version,
        sources,
        changes,
        ...extra,
      },
      context,
    );
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'coseed-content-'));
    database = new DatabaseService(new ConfigService({ runtime: { dataDir: directory } }));
    database.onModuleInit();
    service = new ProjectContentService(database);
    projectId = service.createProject(
      { operationId: randomUUID(), name: 'Fictional project' },
      context,
    ).projectId;
  });
  afterEach(() => {
    database.onModuleDestroy();
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates an empty project, captures the actual request, and retries creation without duplicates', () => {
    const input = { operationId: randomUUID(), name: 'Another fictional project' };
    const receipt = service.createProject(input, context);
    expect(service.createProject(input, context)).toEqual(receipt);
    expect(() => service.createProject({ ...input, name: 'Different' }, context)).toThrow(/不同/);
    const snapshot = service.readSnapshot(receipt.projectId);
    expect(snapshot.version).toBe(0);
    expect(snapshot.objects).toEqual([]);
    expect(JSON.parse(snapshot.sources[0]!.rawText)).toEqual({ ...input, repositoryLocator: null });
    expect(snapshot.sources[0]!.occurredAt).toBeNull();
    expect(service.listProjects()).toHaveLength(2);
  });

  it('saves a mixed batch and keeps capture time, occurrence time and per-object revision distinct', () => {
    const material = source();
    const receipt = save(
      [
        upsert('overview', projectId, overview, material.id),
        upsert('requirement', 'req', requirement(), material.id),
        upsert('record', 'b', record('req'), material.id),
        upsert('record', 'a', record('req'), material.id),
        upsert(
          'retrospective',
          'retro',
          { title: 'Fictional review', scopeMd: 'This test.', summaryMd: 'Conclusions.' },
          material.id,
          null,
          { inputSourceIds: [material.id] },
        ),
      ],
      [material],
      { retrospectiveId: 'retro' },
    );
    expect(receipt.version).toBe(1);
    expect(receipt.retrospectiveId).toBe('retro');
    expect(receipt.changes).toHaveLength(5);
    const snapshot = service.readSnapshot(projectId);
    expect(
      snapshot.objects.filter((value) => value.objectType === 'record').map((value) => value.id),
    ).toEqual(['b', 'a']);
    expect(snapshot.objects.find((value) => value.id === 'b')).toMatchObject({
      captureVersion: 1,
      captureOrdinal: 2,
      createdAt: receipt.savedAt,
      content: { occurredAt: null },
    });
    save([upsert('record', 'b', record('req', 'Corrected fictional conclusion.'), material.id, 1)]);
    expect(
      service
        .readSnapshot(projectId)
        .objects.filter((value) => value.objectType === 'record')
        .map((value) => value.id),
    ).toEqual(['b', 'a']);
    expect(service.readRevision(projectId, 'record', 'b', 1).content.markdown).toBe(
      'Fictional conclusion.',
    );
    expect(service.readRevision(projectId, 'record', 'b', 2)).toMatchObject({
      captureVersion: 1,
      captureOrdinal: 2,
      content: { occurredAt: null },
    });
    expect(service.readHistory(projectId, 'record', 'b', { limit: 1 })[0]!.revisionNo).toBe(2);
    expect(
      service.readHistory(projectId, 'record', 'b', { beforeRevision: 2 })[0]!.revisionNo,
    ).toBe(1);
    expect(service.readSources(projectId, [material.id])[0]!.rawText).toBe(material.rawText);
  });

  it('deduplicates successful retries before checking the stale base, but rejects changed payloads', () => {
    const material = source();
    const input = {
      projectId,
      operationId: randomUUID(),
      baseVersion: 0,
      sources: [material],
      changes: [upsert('requirement', 'req', requirement(), material.id)],
    };
    const receipt = service.save(input, context);
    expect(service.save(input, { ...context, actorLabel: 'Retry client' })).toEqual(receipt);
    expect(() => service.save({ ...input, noteMd: 'Different request' }, context)).toThrow(/不同/);
    expect(() => service.save({ ...input, operationId: randomUUID() }, context)).toThrow(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
    expect(service.readSnapshot(projectId).version).toBe(1);
  });

  it('does not create new versions for identical content and evidence', () => {
    const material = source();
    save([upsert('requirement', 'req', requirement(), material.id)], [material]);
    expect(() => save([upsert('requirement', 'req', requirement(), material.id, 1)])).toThrow(
      /没有实际/,
    );
    expect(service.readSnapshot(projectId).version).toBe(1);
  });

  it('rolls back new sources, identities, revisions and operation when one item is invalid', () => {
    const material = source();
    const operationId = randomUUID();
    expect(() =>
      save(
        [
          upsert('requirement', 'req', requirement(), material.id),
          upsert('record', 'record', record('missing'), material.id),
        ],
        [material],
        { operationId },
      ),
    ).toThrow();
    expect(service.readSnapshot(projectId)).toMatchObject({ version: 0, objects: [] });
    expect(() => service.getOperation(projectId, operationId)).toThrow();
    expect(() => service.readSources(projectId, [material.id])).toThrow();
    expect(database.db.get<{ n: number }>(sql`SELECT count(*) AS n FROM requirements`)!.n).toBe(0);
  });

  it('rejects cross-project object and source references, including colliding identities', () => {
    const material = source();
    save([upsert('requirement', 'req', requirement(), material.id)], [material]);
    const second = service.createProject(
      { operationId: randomUUID(), name: 'Other project' },
      context,
    ).projectId;
    expect(() =>
      service.save(
        {
          projectId: second,
          operationId: randomUUID(),
          baseVersion: 0,
          changes: [upsert('requirement', 'req', requirement(), material.id)],
        },
        context,
      ),
    ).toThrow();
    expect(() => service.readRevision(second, 'requirement', 'req', 1)).toThrow();
    expect(() =>
      service.getOperation(
        second,
        service.readRevision(projectId, 'requirement', 'req', 1).operationId,
      ),
    ).toThrow();
    expect(service.readSnapshot(second).version).toBe(0);
  });

  it('keeps source bytes immutable and rejects changed material under an existing ID', () => {
    const material = source();
    save([upsert('requirement', 'req', requirement(), material.id)], [material]);
    expect(() =>
      save(
        [
          upsert(
            'requirement',
            'req',
            { ...requirement(), markdown: 'Corrected.' },
            material.id,
            1,
          ),
        ],
        [{ ...material, rawText: 'Overwritten source' }],
      ),
    ).toThrow(/不可覆盖/);
    expect(service.readSources(projectId, [material.id])[0]!.rawText).toBe(material.rawText);
  });

  it.each(['/title/length', '/__proto__', '/constructor', '/markdown~2', '/links/length'])(
    'rejects invalid or inherited citation path %s',
    (path) => {
      const material = source();
      expect(() =>
        save(
          [
            upsert('requirement', 'req', requirement(), material.id, null, {
              citations: cite(material.id, 'after', path),
            }),
          ],
          [material],
        ),
      ).toThrow(/位置/);
      expect(service.readSnapshot(projectId).version).toBe(0);
    },
  );

  it('requires evidence covering changed fields instead of accepting an unrelated citation', () => {
    const material = source();
    save([upsert('requirement', 'req', requirement(), material.id)], [material]);
    expect(() =>
      save([
        upsert(
          'requirement',
          'req',
          { ...requirement(), markdown: 'New content.' },
          material.id,
          1,
          { citations: cite(material.id, 'after', '/title') },
        ),
      ]),
    ).toThrow(/依据/);
  });

  it('records initial, progress and correction state changes without a fake unchanged event', () => {
    const material = source();
    save([upsert('requirement', 'req', requirement(), material.id)], [material]);
    expect(service.readRevision(projectId, 'requirement', 'req', 1).statusChange!.kind).toBe(
      'initial',
    );
    expect(() =>
      save([upsert('requirement', 'req', requirement('completed'), material.id, 1)]),
    ).toThrow(/原因/);
    expect(() =>
      save([
        upsert('requirement', 'req', requirement('completed'), material.id, 1, {
          statusChange: { kind: 'progress', reasonMd: 'Done.', records: [] },
        }),
      ]),
    ).toThrow(/具体推进记录/);
    save(
      [
        upsert('requirement', 'req', requirement('completed'), material.id, 1, {
          statusChange: {
            kind: 'progress',
            reasonMd: 'Fictional acceptance recorded.',
            records: [{ id: 'r', revisionNo: 1 }],
          },
        }),
        upsert('record', 'r', record('req'), material.id),
      ],
      [],
    );
    save([
      upsert('requirement', 'other', requirement(), material.id),
      upsert('record', 'r', record('other', 'Corrected ownership.'), material.id, 1),
    ]);
    expect(service.readRevision(projectId, 'requirement', 'req', 2).statusChange!.records).toEqual([
      { id: 'r', revisionNo: 1 },
    ]);
    save([
      upsert('requirement', 'req', requirement('designing'), material.id, 2, {
        statusChange: { kind: 'correction', reasonMd: 'Previous state was mistaken.', records: [] },
      }),
    ]);
    save([
      upsert(
        'requirement',
        'req',
        { ...requirement(), markdown: 'Clarified text.' },
        material.id,
        3,
      ),
    ]);
    expect(service.readRevision(projectId, 'requirement', 'req', 4).statusChange).toBeNull();
    expect(service.readRevision(projectId, 'requirement', 'req', 3).statusChange!.kind).toBe(
      'correction',
    );
  });

  it('rejects status basis belonging to another requirement and fake unchanged transitions', () => {
    const material = source();
    save(
      [
        upsert('requirement', 'req', requirement(), material.id),
        upsert('requirement', 'other', requirement(), material.id),
        upsert('record', 'r', record('other'), material.id),
      ],
      [material],
    );
    expect(() =>
      save([
        upsert('requirement', 'req', requirement('completed'), material.id, 1, {
          statusChange: {
            kind: 'progress',
            reasonMd: 'Incorrect basis.',
            records: [{ id: 'r', revisionNo: 1 }],
          },
        }),
      ]),
    ).toThrow();
    expect(() =>
      save([
        upsert('requirement', 'req', requirement(), material.id, 1, {
          statusChange: { kind: 'correction', reasonMd: 'No actual transition.', records: [] },
        }),
      ]),
    ).toThrow(/未变化/);
  });

  it('resolves shared nodes at one project version while preserving graph membership revisions', () => {
    const material = source();
    const diagram = {
      title: 'Fictional graph',
      scope: { kind: 'project' },
      entityIds: ['m'],
      relationshipIds: [],
      noteIds: [],
    };
    save(
      [
        upsert('entity', 'm', moduleNode(), material.id),
        upsert('diagram', 'g1', diagram, material.id),
        upsert('diagram', 'g2', diagram, material.id),
      ],
      [material],
    );
    save([upsert('entity', 'm', moduleNode('Renamed accounts'), material.id, 1)]);
    expect(
      service.readSnapshot(projectId, 1).objects.find((value) => value.id === 'm')!.content.name,
    ).toBe('Accounts');
    expect(
      service.readSnapshot(projectId).objects.find((value) => value.id === 'm')!.content.name,
    ).toBe('Renamed accounts');
    expect(service.readRevision(projectId, 'diagram', 'g2', 1).revisionNo).toBe(1);
    expect(() =>
      save([
        {
          action: 'remove',
          objectType: 'entity',
          id: 'm',
          expectedRevision: 2,
          citations: cite(material.id, 'before'),
        },
      ]),
    ).toThrow(/业务设计/);
    expect(service.readSnapshot(projectId).version).toBe(2);
  });

  it('validates untouched graphs and module ownership against the complete candidate', () => {
    const material = source();
    save(
      [
        upsert('entity', 'm', moduleNode(), material.id),
        upsert('entity', 'c', component, material.id),
        upsert(
          'diagram',
          'g',
          {
            title: 'Inner graph',
            scope: { kind: 'module', moduleId: 'm' },
            entityIds: ['c'],
            relationshipIds: [],
            noteIds: [],
          },
          material.id,
        ),
      ],
      [material],
    );
    expect(() =>
      save([
        upsert(
          'entity',
          'c',
          { ...component, owner: { kind: 'module', id: 'missing' } },
          material.id,
          1,
        ),
      ]),
    ).toThrow(/归属/);
    expect(service.readSnapshot(projectId).version).toBe(1);
  });

  it('pins record links to exact revisions and graph project versions, including same-batch graphs', () => {
    const material = source();
    save(
      [
        upsert('requirement', 'req', requirement(), material.id),
        upsert('entity', 'm', moduleNode(), material.id),
        upsert(
          'diagram',
          'g',
          {
            title: 'Graph',
            scope: { kind: 'project' },
            entityIds: ['m'],
            relationshipIds: [],
            noteIds: [],
          },
          material.id,
        ),
        upsert('record', 'r', record('req'), material.id, null, {
          links: [
            {
              target: { kind: 'diagram', id: 'g', projectVersion: 1 },
              explanationMd: 'Fictional design at this save.',
            },
            {
              target: { kind: 'entity', id: 'm', revisionNo: 1 },
              explanationMd: 'Original module.',
            },
          ],
        }),
      ],
      [material],
    );
    save([upsert('entity', 'm', moduleNode('Changed'), material.id, 1)]);
    const linked = service.readRevision(projectId, 'record', 'r', 1);
    expect(linked.links[0]!.target).toEqual({ kind: 'diagram', id: 'g', projectVersion: 1 });
    expect(
      service.readSnapshot(projectId, 1).objects.find((value) => value.id === 'm')!.content.name,
    ).toBe('Accounts');
    expect(() =>
      save([
        upsert('record', 'r', record('req', 'Invalid future reference.'), material.id, 1, {
          citations: [...cite(material.id), ...cite(material.id, 'before')],
          links: [
            { target: { kind: 'diagram', id: 'g', projectVersion: 99 }, explanationMd: 'Invalid.' },
          ],
        }),
      ]),
    ).toThrow(/未来/);
  });

  it('keeps current requirement links valid and rejects removal of referenced overview parts', () => {
    const material = source();
    save(
      [
        upsert('overview', projectId, overview, material.id),
        upsert('requirement', 'req', requirement(), material.id, null, {
          links: [
            {
              target: { kind: 'overview', part: { kind: 'concept', id: 'concept' } },
              explanationMd: 'Defines the requested concept.',
            },
          ],
        }),
      ],
      [material],
    );
    expect(() =>
      save([
        upsert(
          'overview',
          projectId,
          { ...overview, concepts: { entries: [], relations: [] } },
          material.id,
          1,
          { citations: [...cite(material.id), ...cite(material.id, 'before')] },
        ),
      ]),
    ).toThrow(/关联/);
    save([
      upsert('requirement', 'req', requirement(), material.id, 1, {
        citations: [...cite(material.id), ...cite(material.id, 'before')],
        links: [],
      }),
      upsert(
        'overview',
        projectId,
        { ...overview, concepts: { entries: [], relations: [] } },
        material.id,
        1,
        { citations: [...cite(material.id), ...cite(material.id, 'before')] },
      ),
    ]);
    expect(service.readSnapshot(projectId).version).toBe(2);
  });

  it('appends tombstones and restores content as a new revision, without resurrecting old snapshots', () => {
    const material = source();
    save(
      [
        upsert('requirement', 'req', requirement(), material.id),
        upsert('record', 'r', record('req'), material.id),
      ],
      [material],
    );
    save([
      {
        action: 'remove',
        objectType: 'record',
        id: 'r',
        expectedRevision: 1,
        citations: cite(material.id, 'before'),
      },
    ]);
    expect(service.readSnapshot(projectId).objects.some((value) => value.id === 'r')).toBe(false);
    expect(() => save([upsert('record', 'r', record('req'), material.id, 2)])).toThrow(/恢复/);
    save([
      {
        action: 'restore',
        objectType: 'record',
        id: 'r',
        expectedRevision: 2,
        fromRevisionNo: 1,
        citations: cite(material.id),
      },
    ]);
    expect(service.readRevision(projectId, 'record', 'r', 3).isDeleted).toBe(false);
    expect(service.readSnapshot(projectId, 2).objects.some((value) => value.id === 'r')).toBe(
      false,
    );
    expect(service.readSnapshot(projectId, 1).objects.some((value) => value.id === 'r')).toBe(true);
    expect(() => service.readRevision(projectId, 'record', 'r', 3, 1)).toThrow();
    expect(() => service.readSnapshot(projectId, 999)).toThrow();
  });

  it('separates project metadata revisions from content versions and preserves TS as display text', () => {
    const material = source();
    const code = {
      ...source(),
      kind: 'code',
      locator: { path: 'modules/accounts/domain/account.ts' },
    };
    const data = {
      kind: 'data_object',
      name: 'Account',
      summary: 'Fictional account fields.',
      owner: { kind: 'module', id: 'm' },
      primarySourceId: code.id,
      typeSourceId: code.id,
      typeName: 'Account',
      typeScript: 'type Account = { id: string; /* Account identifier */ };',
    };
    save(
      [
        upsert(
          'project',
          projectId,
          { name: 'Renamed fictional project', repositoryLocator: null },
          material.id,
          1,
        ),
        upsert('entity', 'm', moduleNode(), material.id),
        upsert('entity', 'data', data, code.id),
      ],
      [material, code],
    );
    expect(service.readSnapshot(projectId).project).toMatchObject({
      revisionNo: 2,
      projectVersion: 1,
    });
    expect(service.readSnapshot(projectId, 0).project.content.name).toBe('Fictional project');
    expect(
      service.readSnapshot(projectId).objects.find((value) => value.id === 'data')!.content
        .typeScript,
    ).toBe(data.typeScript);
    const bad = { ...source(), kind: 'code', locator: { path: '../outside/account.ts' } };
    expect(() =>
      save(
        [
          upsert(
            'entity',
            'data',
            { ...data, primarySourceId: bad.id, typeSourceId: bad.id },
            bad.id,
            1,
          ),
        ],
        [bad],
      ),
    ).toThrow(/相对路径/);
    expect(service.readSnapshot(projectId).version).toBe(1);
  });

  it('retains committed receipts across reopening and lets another connection observe complete transactions', () => {
    const material = source();
    const receipt = save([upsert('requirement', 'req', requirement(), material.id)], [material]);
    const observer = new Database(join(directory, 'coseed.sqlite'), { readonly: true });
    try {
      observer.exec('BEGIN');
      const head = () =>
        (
          observer
            .prepare('SELECT current_content_version AS version FROM projects WHERE id = ?')
            .get(projectId) as { version: number }
        ).version;
      expect(head()).toBe(1);
      save([
        upsert('requirement', 'req', { ...requirement(), markdown: 'Correction.' }, material.id, 1),
      ]);
      expect(head()).toBe(1);
      observer.exec('COMMIT');
      expect(head()).toBe(2);
    } finally {
      observer.close();
    }
    database.onModuleDestroy();
    database.onModuleInit();
    expect(service.getOperation(projectId, receipt.operationId)).toEqual(receipt);
    expect(database.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    expect(() => database.db.run(sql`UPDATE sources SET raw_text = 'rewrite'`)).toThrow();
    expect(() =>
      database.db.run(
        sql`INSERT INTO requirement_revision_sources (project_id, requirement_id, revision_no, source_id, target_side, target_path, explanation_md) VALUES (${projectId}, 'req', 1, ${material.id}, 'before', '', 'late')`,
      ),
    ).toThrow();
  });
});

describe('storage completeness and bounded reads', () => {
  it('round-trips every design collection using the agreed fictional example', async () => {
    const { readFileSync } = await import('node:fs');
    const example = JSON.parse(
      readFileSync(
        new URL('../../docs/database/business-design.example.json', import.meta.url),
        'utf8',
      ),
    ) as Record<string, { id: string; content: Record<string, unknown> }[]>;
    const directory = mkdtempSync(join(tmpdir(), 'coseed-design-roundtrip-'));
    const database = new DatabaseService(new ConfigService({ runtime: { dataDir: directory } }));
    database.onModuleInit();
    try {
      const service = new ProjectContentService(database);
      const projectId = service.createProject(
        { operationId: randomUUID(), name: 'Fictional example only' },
        context,
      ).projectId;
      const material = source();
      const kinds = {
        entities: 'entity',
        relationships: 'relationship',
        notes: 'note',
        diagrams: 'diagram',
      } as const;
      const changes = Object.entries(kinds).flatMap(([collection, kind]) =>
        example[collection]!.map((value) => upsert(kind, value.id, value.content, material.id)),
      );
      service.save(
        { projectId, operationId: randomUUID(), baseVersion: 0, sources: [material], changes },
        context,
      );
      const snapshot = service.readSnapshot(projectId);
      expect(snapshot.objects).toHaveLength(changes.length);
      for (const [collection, kind] of Object.entries(kinds))
        for (const item of example[collection]!) {
          const stored = snapshot.objects.find(
            (value) => value.objectType === kind && value.id === item.id,
          )!;
          const expected = structuredClone(item.content);
          for (const field of ['entityIds', 'relationshipIds', 'noteIds'])
            if (Array.isArray(expected[field])) (expected[field] as string[]).sort();
          expect(stored.content).toEqual(expected);
        }
    } finally {
      database.onModuleDestroy();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not add a query per node when resolving larger graphs', async () => {
    const { SnapshotRepository } =
      await import('../../dist/server/modules/project-content/persistence/snapshots.js');
    const directory = mkdtempSync(join(tmpdir(), 'coseed-bounded-reads-'));
    const database = new DatabaseService(new ConfigService({ runtime: { dataDir: directory } }));
    database.onModuleInit();
    try {
      const service = new ProjectContentService(database);
      const projectId = service.createProject(
        { operationId: randomUUID(), name: 'Fictional load fixture' },
        context,
      ).projectId;
      const material = source();
      const countRead = () => {
        let queries = 0;
        const repository = new SnapshotRepository({
          get: (...args: Parameters<typeof database.db.get>) => {
            queries++;
            return database.db.get(...args);
          },
          all: (...args: Parameters<typeof database.db.all>) => {
            queries++;
            return database.db.all(...args);
          },
          run: (...args: Parameters<typeof database.db.run>) => database.db.run(...args),
        } as ConstructorParameters<typeof SnapshotRepository>[0]);
        const started = performance.now();
        const snapshot = repository.snapshot(projectId);
        return {
          queries,
          milliseconds: performance.now() - started,
          count: snapshot.objects.length,
        };
      };
      service.save(
        {
          projectId,
          operationId: randomUUID(),
          baseVersion: 0,
          sources: [material],
          changes: [upsert('entity', 'm', moduleNode(), material.id)],
        },
        context,
      );
      const small = countRead();
      const changes = Array.from({ length: 300 }, (_, index) =>
        upsert('entity', `c-${index}`, component, material.id),
      );
      const started = performance.now();
      service.save({ projectId, operationId: randomUUID(), baseVersion: 1, changes }, context);
      const saveMs = performance.now() - started;
      const large = countRead();
      expect(large.count).toBe(301);
      expect(large.queries).toBe(small.queries);
      console.info(
        JSON.stringify({
          scope: 'local fictional 300-node storage probe; not capacity acceptance',
          saveMs: Math.round(saveMs),
          readMs: Math.round(large.milliseconds),
          queries: large.queries,
        }),
      );
    } finally {
      database.onModuleDestroy();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
