import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { businessDesignBundleSchema as businessDesignBundleDraftSchema } from '../dist/contracts/content/business-design.js';
import { withProposedDatabase } from './database-design/fixture.mjs';

// Formal first 24-table SQL plus complete candidate-snapshot validation.
// This remains a disposable verification fixture, not the production save service.
const example = JSON.parse(
  readFileSync(new URL('../docs/database/business-design.example.json', import.meta.url), 'utf8'),
);
const checks = [];
const clone = (value) => structuredClone(value);
const families = {
  entity: ['business_entities', 'business_entity_revisions', 'entity_id'],
  relationship: ['business_relationships', 'business_relationship_revisions', 'relationship_id'],
  diagram: ['design_diagrams', 'design_diagram_revisions', 'diagram_id'],
  note: ['technical_notes', 'technical_note_revisions', 'note_id'],
};
withProposedDatabase(({ db, project, save, rows, members, head }) => {
  const verify = (name, run) => {
    run();
    checks.push(name);
  };
  const append = (family, projectId, item, operation, sourceId, removed = false) => {
    const [identity, revisions, key] = families[family];
    const previous = db
      .prepare(
        `SELECT current_revision_no AS revision FROM ${identity} WHERE project_id = ? AND id = ?`,
      )
      .get(projectId, item.id);
    const revision = (previous?.revision ?? 0) + 1;
    const c = item.content;
    if (!previous) {
      if (family === 'entity')
        db.prepare(`INSERT INTO ${identity} VALUES (?, ?, ?, 1, ?)`).run(
          item.id,
          projectId,
          c.kind,
          Date.now(),
        );
      else
        db.prepare(`INSERT INTO ${identity} VALUES (?, ?, 1, ?)`).run(
          item.id,
          projectId,
          Date.now(),
        );
    }
    if (family === 'entity' || family === 'relationship') {
      db.prepare(
        `INSERT INTO ${revisions} (project_id, ${key}, revision_no, operation_id, schema_version, content_json, is_deleted)
        VALUES (?, ?, ?, ?, 1, ?, ?)`,
      ).run(projectId, item.id, revision, operation, JSON.stringify(c), Number(removed));
    } else if (family === 'note') {
      db.prepare(
        `INSERT INTO ${revisions} (project_id, note_id, revision_no, operation_id, title, problem_md, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(projectId, item.id, revision, operation, c.title, c.problemMd, Number(removed));
      for (const id of c.entityIds)
        db.prepare('INSERT INTO technical_note_revision_entities VALUES (?, ?, ?, ?)').run(
          projectId,
          item.id,
          revision,
          id,
        );
    } else {
      db.prepare(
        `INSERT INTO ${revisions} (project_id, diagram_id, revision_no, operation_id, title, scope_kind, scope_module_id, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        projectId,
        item.id,
        revision,
        operation,
        c.title,
        c.scope.kind,
        c.scope.kind === 'module' ? c.scope.moduleId : null,
        Number(removed),
      );
      for (const id of c.entityIds)
        db.prepare('INSERT INTO diagram_revision_entities VALUES (?, ?, ?, ?)').run(
          projectId,
          item.id,
          revision,
          id,
        );
      for (const id of c.relationshipIds)
        db.prepare('INSERT INTO diagram_revision_relationships VALUES (?, ?, ?, ?)').run(
          projectId,
          item.id,
          revision,
          id,
        );
      for (const id of c.noteIds)
        db.prepare('INSERT INTO diagram_revision_notes VALUES (?, ?, ?, ?)').run(
          projectId,
          item.id,
          revision,
          id,
        );
    }
    db.prepare(
      `INSERT INTO ${revisions.replace('_revisions', '_revision_sources')}
      VALUES (?, ?, ?, ?, 'after', '', 'Explicitly fictional source supports the proposed content')`,
    ).run(projectId, item.id, revision, sourceId);
    if (previous)
      db.prepare(
        `UPDATE ${identity} SET current_revision_no = ? WHERE project_id = ? AND id = ?`,
      ).run(revision, projectId, item.id);
    return revision;
  };
  const ordered = (items) => [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const bundle = (projectId, version, pending = null) => {
    const entityRows = rows('business_entity_revisions', projectId, version, pending);
    const relationshipRows = rows('business_relationship_revisions', projectId, version, pending);
    const noteRows = rows('technical_note_revisions', projectId, version, pending);
    const diagramRows = rows('design_diagram_revisions', projectId, version, pending);
    const noteMembers = members(
      'technical_note_revision_entities',
      'technical_note_revisions',
      'note_id',
      projectId,
      version,
      pending,
    );
    const graphMembers = Object.fromEntries(
      ['entities', 'relationships', 'notes'].map((kind) => [
        kind,
        members(
          `diagram_revision_${kind}`,
          'design_diagram_revisions',
          'diagram_id',
          projectId,
          version,
          pending,
        ),
      ]),
    );
    return {
      schemaVersion: 2,
      projectVersion: version,
      entities: ordered(
        entityRows.map((row) => ({
          id: row.entity_id,
          revisionNo: row.revision_no,
          content: JSON.parse(row.content_json),
        })),
      ),
      relationships: ordered(
        relationshipRows.map((row) => ({
          id: row.relationship_id,
          revisionNo: row.revision_no,
          content: JSON.parse(row.content_json),
        })),
      ),
      notes: ordered(
        noteRows.map((row) => ({
          id: row.note_id,
          revisionNo: row.revision_no,
          content: {
            title: row.title,
            problemMd: row.problem_md,
            entityIds: noteMembers
              .filter(
                (member) =>
                  member.note_id === row.note_id && member.revision_no === row.revision_no,
              )
              .map((member) => member.entity_id)
              .sort(),
          },
        })),
      ),
      diagrams: ordered(
        diagramRows.map((row) => ({
          id: row.diagram_id,
          revisionNo: row.revision_no,
          content: {
            title: row.title,
            scope:
              row.scope_kind === 'project'
                ? { kind: 'project' }
                : { kind: 'module', moduleId: row.scope_module_id },
            ...Object.fromEntries(
              [
                ['entities', 'entity_id', 'entityIds'],
                ['relationships', 'relationship_id', 'relationshipIds'],
                ['notes', 'note_id', 'noteIds'],
              ].map(([kind, key, field]) => [
                field,
                graphMembers[kind]
                  .filter(
                    (member) =>
                      member.diagram_id === row.diagram_id &&
                      member.revision_no === row.revision_no,
                  )
                  .map((member) => member[key])
                  .sort(),
              ]),
            ),
          },
        })),
      ),
    };
  };
  const persist = (projectId, change, options = {}) =>
    save(projectId, change, {
      ...options,
      validate: (version, pending) =>
        businessDesignBundleDraftSchema.parse(bundle(projectId, version, pending)),
    });
  const a = project();
  const b = project();
  const secondView = clone(example.diagrams.find((item) => item.id === 'requirements-internal'));
  secondView.id = 'second-requirements-view';
  const initial = persist(a.id, (op) => {
    for (const item of example.entities) append('entity', a.id, item, op, a.sourceId);
    for (const item of example.relationships) append('relationship', a.id, item, op, a.sourceId);
    for (const item of example.notes) append('note', a.id, item, op, a.sourceId);
    for (const item of [...example.diagrams, secondView])
      append('diagram', a.id, item, op, a.sourceId);
  });
  const oldBundle = bundle(a.id, 1);
  verify('24 STRICT tables use only projects and write_operations for coordination', () => {
    const tables = db.pragma('table_list').filter((table) => !table.name.startsWith('sqlite_'));
    assert.equal(tables.length, 24);
    assert(tables.every((table) => table.strict === 1));
    assert(!tables.some((table) => table.name === 'project_versions'));
  });
  verify('all proposed object and relationship content round-trips without layout fields', () => {
    assert.deepEqual(oldBundle.entities, ordered(example.entities));
    assert.deepEqual(oldBundle.relationships, ordered(example.relationships));
    businessDesignBundleDraftSchema.parse(oldBundle);
  });
  verify('diagram membership stores stable IDs without pinned object revisions', () => {
    const columns = db.pragma('table_info(diagram_revision_entities)').map((column) => column.name);
    assert.deepEqual(columns, ['project_id', 'diagram_id', 'revision_no', 'entity_id']);
    assert(
      !db
        .pragma('table_info(business_entity_revisions)')
        .some((column) => column.name === 'owner_revision_no'),
    );
  });
  const shared = clone(example.entities.find((item) => item.id === 'update-requirement'));
  shared.content.summary = 'Fictional revised responsibility, shared by both views.';
  persist(a.id, (op) => append('entity', a.id, shared, op, a.sourceId));
  verify('one shared-node edit appears in both current views without new diagram revisions', () => {
    const current = bundle(a.id, 2);
    for (const id of ['requirements-internal', secondView.id]) {
      const graph = current.diagrams.find((item) => item.id === id);
      assert.equal(graph.revisionNo, 1);
      assert(graph.content.entityIds.includes(shared.id));
      assert.equal(
        current.entities.find((item) => item.id === shared.id).content.summary,
        shared.content.summary,
      );
    }
    assert.deepEqual(bundle(a.id, 1), oldBundle);
  });
  const external = clone(example.entities.find((item) => item.id === 'agent-client'));
  external.content.name = 'Renamed fictional external system';
  persist(a.id, (op) => append('entity', a.id, external, op, a.sourceId));
  verify(
    'owner context resolves at the same project version and historical names stay unchanged',
    () => {
      assert.equal(
        bundle(a.id, 3).entities.find((item) => item.id === external.id).content.name,
        external.content.name,
      );
      assert.equal(
        bundle(a.id, 1).entities.find((item) => item.id === external.id).content.name,
        'Coding Agent 客户端',
      );
    },
  );
  const spare = clone(shared);
  spare.id = 'new-spare-component';
  const edge = clone(
    example.relationships.find((item) => item.id === 'agent-updates-requirements'),
  );
  edge.content.targetId = spare.id;
  verify('an edge endpoint change cannot invalidate an unchanged current diagram', () => {
    assert.throws(
      () =>
        persist(a.id, (op) => {
          append('entity', a.id, spare, op, a.sourceId);
          append('relationship', a.id, edge, op, a.sourceId);
        }),
      /端点未包含/,
    );
    assert.equal(head(a.id), 3);
    assert(!db.prepare('SELECT 1 FROM business_entities WHERE id = ?').get(spare.id));
  });
  const repaired = (id) => {
    const item = clone(
      id === secondView.id ? secondView : example.diagrams.find((item) => item.id === id),
    );
    item.content.entityIds.push(spare.id);
    return item;
  };
  verify(
    'fixing one view is insufficient when another view shares the changed relationship',
    () => {
      assert.throws(
        () =>
          persist(a.id, (op) => {
            append('entity', a.id, spare, op, a.sourceId);
            append('relationship', a.id, edge, op, a.sourceId);
            append('diagram', a.id, repaired('requirements-internal'), op, a.sourceId);
          }),
        /端点未包含/,
      );
      assert.equal(head(a.id), 3);
    },
  );
  persist(a.id, (op) => {
    append('entity', a.id, spare, op, a.sourceId);
    append('relationship', a.id, edge, op, a.sourceId);
    for (const id of ['requirements-internal', secondView.id])
      append('diagram', a.id, repaired(id), op, a.sourceId);
  });
  verify(
    'related graph and object edits commit together; older snapshots keep the old endpoint',
    () => {
      assert.equal(head(a.id), 4);
      assert.equal(
        bundle(a.id, 4).relationships.find((item) => item.id === edge.id).content.targetId,
        spare.id,
      );
      assert.equal(
        bundle(a.id, 3).relationships.find((item) => item.id === edge.id).content.targetId,
        'update-requirement',
      );
      assert.deepEqual(bundle(a.id, 1), oldBundle);
    },
  );
  const note = clone(example.notes[0]);
  note.content.problemMd = 'Fictional updated explanation of atomic saving.';
  persist(a.id, (op) => append('note', a.id, note, op, a.sourceId));
  verify('technical-note content follows the snapshot without revising diagram membership', () => {
    assert.equal(bundle(a.id, 5).notes[0].revisionNo, 2);
    assert.equal(
      bundle(a.id, 5).diagrams.find((item) => item.id === 'requirements-internal').revisionNo,
      2,
    );
    assert.equal(bundle(a.id, 4).notes[0].content.problemMd, example.notes[0].content.problemMd);
  });
  verify('a shared-note scope change is checked against every affected current view', () => {
    const invalid = clone(note);
    invalid.content.entityIds.push('overview');
    assert.throws(
      () => persist(a.id, (op) => append('note', a.id, invalid, op, a.sourceId)),
      /说明范围超出了本图/,
    );
    assert.equal(head(a.id), 5);
  });
  verify('removing a referenced object cannot silently leave a dangling current view', () => {
    assert.throws(
      () => persist(a.id, (op) => append('entity', a.id, shared, op, a.sourceId, true)),
      /不存在的对象/,
    );
    assert.equal(head(a.id), 5);
  });
  verify('saved graph members and source citations reject late inserts', () => {
    for (const [table, args] of [
      ['diagram_revision_entities', [a.id, 'requirements-internal', 1, spare.id]],
      ['diagram_revision_relationships', [a.id, 'requirements-internal', 1, edge.id]],
      ['diagram_revision_notes', [a.id, 'requirements-internal', 1, note.id]],
      ['technical_note_revision_entities', [a.id, note.id, 1, spare.id]],
    ])
      assert.throws(
        () => db.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?)`).run(...args),
        /closed/,
      );
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO business_entity_revision_sources VALUES (?, ?, 1, ?, 'after', '', 'Late evidence')`,
          )
          .run(a.id, shared.id, b.sourceId),
      /closed/,
    );
  });
  verify('saved operation identity prevents late revisions and evidence capture', () => {
    assert.throws(() => append('entity', a.id, shared, initial.id, a.sourceId), /closed/);
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO sources (id, project_id, captured_by_operation_id, kind, raw_text, content_hash)
      VALUES (?, ?, ?, 'document', 'Late source', ?)`,
          )
          .run(randomUUID(), a.id, initial.id, 'a'.repeat(64)),
      /closed/,
    );
  });
  verify('cross-project source references are rejected and leave no partial revision', () => {
    assert.throws(
      () => persist(a.id, (op) => append('entity', a.id, shared, op, b.sourceId)),
      /FOREIGN KEY/,
    );
    assert.equal(head(a.id), 5);
  });
  verify('ownership and endpoint kinds remain strongly typed', () => {
    const invalidOwner = clone(shared);
    invalidOwner.id = randomUUID();
    invalidOwner.content.owner = { kind: 'module', id: 'agent-client' };
    assert.throws(
      () => persist(a.id, (op) => append('entity', a.id, invalidOwner, op, a.sourceId)),
      /FOREIGN KEY/,
    );
    const invalidEdge = clone(edge);
    invalidEdge.content.targetId = 'record-data';
    assert.throws(
      () => persist(a.id, (op) => append('relationship', a.id, invalidEdge, op, a.sourceId)),
      /endpoint kinds/,
    );
  });
  verify('missing TS fields and mutable identity kinds cannot be saved', () => {
    const invalidType = clone(example.entities.find((item) => item.id === 'requirement-data'));
    delete invalidType.content.typeScript;
    assert.throws(
      () => persist(a.id, (op) => append('entity', a.id, invalidType, op, a.sourceId)),
      /CHECK/,
    );
    assert.throws(
      () =>
        db.exec("UPDATE business_entities SET kind = 'external_system' WHERE id = 'requirements'"),
      /immutable/,
    );
  });
  verify('historical revisions and member rows are append-only', () => {
    for (const table of [
      ...Object.values(families).map(([, revisions]) => revisions),
      'diagram_revision_entities',
      'diagram_revision_relationships',
      'diagram_revision_notes',
      'technical_note_revision_entities',
    ]) {
      assert.throws(() => db.exec(`DELETE FROM ${table}`), /append-only/);
    }
  });
  verify('retrying the original operation after later edits does not execute it again', () => {
    const before = head(a.id);
    const result = persist(a.id, () => assert.fail('must not repeat changes'), {
      id: initial.id,
      base: initial.base,
      request: initial.id,
    });
    assert.deepEqual(result, initial);
    assert.equal(head(a.id), before);
  });
  verify('a nonexistent or wrong-project snapshot cannot fall back to the current graph', () => {
    assert.throws(() => bundle(a.id, 999), /snapshot does not exist/);
    assert.throws(() => bundle(b.id, 5), /snapshot does not exist/);
    assert.equal(bundle(b.id, 0).entities.length, 0);
  });
  verify(
    'operation indexes and complete foreign-key integrity are present in the composed schema',
    () => {
      for (const [, revisions] of Object.values(families)) {
        const plan = db
          .prepare(
            `EXPLAIN QUERY PLAN SELECT * FROM ${revisions} WHERE project_id = ? AND operation_id = ?`,
          )
          .all(a.id, initial.id);
        assert(plan.some((row) => row.detail.includes(`${revisions}_operation`)));
      }
      assert.deepEqual(db.pragma('foreign_key_check'), []);
    },
  );
}, true);
process.stdout.write(
  `${JSON.stringify({ scope: 'actual 24-table SQL and snapshot-resolved graph', checks: checks.length, passed: checks }, null, 2)}\n`,
);
