import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

// Exercises the SQL proposal directly. This fixture is not a production repository or API.
const directory = mkdtempSync(join(tmpdir(), 'coseed-business-schema-'));
const file = join(directory, 'design.sqlite');
const db = new Database(file);
const checks = [];
const hash = (text) => createHash('sha256').update(text).digest('hex');
const example = JSON.parse(
  readFileSync(new URL('../docs/database/business-design.example.json', import.meta.url), 'utf8'),
);
const verify = (name, run) => {
  run();
  checks.push(name);
};
const transaction = (run) => db.transaction(run).immediate();
function operation(projectId) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO write_operations
    (id, project_id, request_hash, entrypoint, actor_kind, actor_label, saved_at)
    VALUES (?, ?, ?, 'system', 'system', 'SQL verification fixture', ?)`,
  ).run(id, projectId, hash(id), Date.now());
  return id;
}
function project() {
  const id = randomUUID();
  let sourceId;
  transaction(() => {
    db.prepare('INSERT INTO projects VALUES (?, 1, ?)').run(id, Date.now());
    const op = operation(id);
    db.prepare(
      `INSERT INTO project_revisions
      (project_id, revision_no, operation_id, name) VALUES (?, 1, ?, 'Disposable fixture')`,
    ).run(id, op);
    sourceId = randomUUID();
    db.prepare(
      `INSERT INTO sources
      (id, project_id, captured_by_operation_id, kind, raw_text, content_hash)
      VALUES (?, ?, ?, 'document', 'Explicitly fictional design fixture', ?)`,
    ).run(sourceId, id, op, hash('Explicitly fictional design fixture'));
  });
  return { id, sourceId };
}
const families = {
  entity: ['business_entities', 'business_entity_revisions', 'entity_id'],
  relationship: ['business_relationships', 'business_relationship_revisions', 'relationship_id'],
  diagram: ['design_diagrams', 'design_diagram_revisions', 'diagram_id'],
  note: ['technical_notes', 'technical_note_revisions', 'note_id'],
};
function identity(family, projectId, id, kind) {
  const [table] = families[family];
  if (family === 'entity') {
    db.prepare(
      `INSERT INTO ${table} (id, project_id, kind, current_revision_no, created_at)
      VALUES (?, ?, ?, 1, ?)`,
    ).run(id, projectId, kind, Date.now());
  } else {
    db.prepare(`INSERT INTO ${table} VALUES (?, ?, 1, ?)`).run(id, projectId, Date.now());
  }
}
function citation(family, projectId, id, revision, sourceId) {
  const [, version, key] = families[family];
  const table = version.replace('_revisions', '_revision_sources');
  db.prepare(
    `INSERT INTO ${table}
    (project_id, ${key}, revision_no, source_id, target_side, target_path, explanation_md)
    VALUES (?, ?, ?, ?, 'after', '', 'This fictional source supports the design fixture')`,
  ).run(projectId, id, revision, sourceId);
}
function entityRevision(projectId, item, op, ownerRevision = 1) {
  db.prepare(
    `INSERT INTO business_entity_revisions
    (project_id, entity_id, revision_no, operation_id, schema_version, content_json, owner_revision_no)
    VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    projectId,
    item.id,
    item.revisionNo,
    op,
    JSON.stringify(item.content),
    'owner' in item.content ? ownerRevision : null,
  );
}
function relationshipRevision(projectId, item, op) {
  db.prepare(
    `INSERT INTO business_relationship_revisions
    (project_id, relationship_id, revision_no, operation_id, schema_version, content_json)
    VALUES (?, ?, ?, ?, 1, ?)`,
  ).run(projectId, item.id, item.revisionNo, op, JSON.stringify(item.content));
}
function noteRevision(projectId, item, op) {
  db.prepare('INSERT INTO technical_note_revisions VALUES (?, ?, ?, ?, ?, ?)').run(
    projectId,
    item.id,
    item.revisionNo,
    op,
    item.content.title,
    item.content.problemMd,
  );
  for (const id of item.content.entityIds) {
    db.prepare('INSERT INTO technical_note_revision_entities VALUES (?, ?, ?, ?)').run(
      projectId,
      item.id,
      item.revisionNo,
      id,
    );
  }
}
function diagramRevision(projectId, item, op) {
  const { content } = item;
  db.prepare('INSERT INTO design_diagram_revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    projectId,
    item.id,
    item.revisionNo,
    op,
    content.title,
    content.scope.kind,
    content.scope.kind === 'module' ? content.scope.moduleRef.id : null,
    content.scope.kind === 'module' ? content.scope.moduleRef.revisionNo : null,
  );
  for (const ref of content.entityRefs) {
    db.prepare('INSERT INTO diagram_revision_entities VALUES (?, ?, ?, ?, ?)').run(
      projectId,
      item.id,
      item.revisionNo,
      ref.id,
      ref.revisionNo,
    );
  }
  for (const ref of content.relationshipRefs) {
    const edge = db
      .prepare(
        `SELECT source_entity_id, target_entity_id FROM business_relationship_revisions
      WHERE project_id = ? AND relationship_id = ? AND revision_no = ?`,
      )
      .get(projectId, ref.id, ref.revisionNo);
    assert(edge, 'Fixture must reference an existing relationship revision');
    db.prepare('INSERT INTO diagram_revision_relationships VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      projectId,
      item.id,
      item.revisionNo,
      ref.id,
      ref.revisionNo,
      edge.source_entity_id,
      edge.target_entity_id,
    );
  }
  for (const ref of content.noteRefs) {
    db.prepare('INSERT INTO diagram_revision_notes VALUES (?, ?, ?, ?, ?)').run(
      projectId,
      item.id,
      item.revisionNo,
      ref.id,
      ref.revisionNo,
    );
  }
}
function readDiagram(projectId, id, revision) {
  // Four bounded family queries, no per-node fetch and no current-head lookup for historical content.
  const diagram = db
    .prepare(
      `SELECT * FROM design_diagram_revisions
    WHERE project_id = ? AND diagram_id = ? AND revision_no = ?`,
    )
    .get(projectId, id, revision);
  assert(diagram);
  const entities = db
    .prepare(
      `SELECT e.entity_id AS id, e.revision_no AS revisionNo, e.content_json
    FROM diagram_revision_entities m JOIN business_entity_revisions e
      ON e.project_id = m.project_id AND e.entity_id = m.entity_id AND e.revision_no = m.entity_revision_no
    WHERE m.project_id = ? AND m.diagram_id = ? AND m.revision_no = ? ORDER BY e.entity_id`,
    )
    .all(projectId, id, revision)
    .map(({ content_json, ...item }) => ({ ...item, content: JSON.parse(content_json) }));
  const relationships = db
    .prepare(
      `SELECT r.relationship_id AS id, r.revision_no AS revisionNo, r.content_json
    FROM diagram_revision_relationships m JOIN business_relationship_revisions r
      ON r.project_id = m.project_id AND r.relationship_id = m.relationship_id AND r.revision_no = m.relationship_revision_no
    WHERE m.project_id = ? AND m.diagram_id = ? AND m.revision_no = ? ORDER BY r.relationship_id`,
    )
    .all(projectId, id, revision)
    .map(({ content_json, ...item }) => ({ ...item, content: JSON.parse(content_json) }));
  const notes = db
    .prepare(
      `SELECT n.note_id AS id, n.revision_no AS revisionNo, n.title, n.problem_md, e.entity_id
    FROM diagram_revision_notes m JOIN technical_note_revisions n
      ON n.project_id = m.project_id AND n.note_id = m.note_id AND n.revision_no = m.note_revision_no
    JOIN technical_note_revision_entities e
      ON e.project_id = n.project_id AND e.note_id = n.note_id AND e.revision_no = n.revision_no
    WHERE m.project_id = ? AND m.diagram_id = ? AND m.revision_no = ? ORDER BY n.note_id, e.entity_id`,
    )
    .all(projectId, id, revision);
  return { diagram, entities, relationships, notes };
}
const clone = (value) => structuredClone(value);
const internal = () => clone(example.diagrams.find((item) => item.id === 'requirements-internal'));
function rejectsDiagram(projectId, edit, pattern) {
  assert.throws(
    () =>
      transaction(() => {
        const item = internal();
        item.id = randomUUID();
        edit(item.content);
        identity('diagram', projectId, item.id);
        diagramRevision(projectId, item, operation(projectId));
      }),
    pattern,
  );
}

try {
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  for (const name of ['schema-draft.sql', 'business-design-schema-draft.sql']) {
    db.exec(readFileSync(new URL(`../docs/database/${name}`, import.meta.url), 'utf8'));
  }
  verify('eight shared tables plus sixteen business-design tables are STRICT', () => {
    const tables = db.pragma('table_list').filter((table) => !table.name.startsWith('sqlite_'));
    assert.equal(tables.length, 24);
    assert(tables.every((table) => table.strict === 1));
  });
  const a = project();
  const b = project();
  transaction(() => {
    const op = operation(a.id);
    for (const item of example.entities) identity('entity', a.id, item.id, item.content.kind);
    for (const item of example.entities) {
      entityRevision(a.id, item, op);
      citation('entity', a.id, item.id, 1, a.sourceId);
    }
    for (const item of example.relationships) {
      identity('relationship', a.id, item.id);
      relationshipRevision(a.id, item, op);
      citation('relationship', a.id, item.id, 1, a.sourceId);
    }
    for (const item of example.notes) {
      identity('note', a.id, item.id);
      noteRevision(a.id, item, op);
      citation('note', a.id, item.id, 1, a.sourceId);
    }
    for (const item of example.diagrams) {
      identity('diagram', a.id, item.id);
      diagramRevision(a.id, item, op);
      citation('diagram', a.id, item.id, 1, a.sourceId);
    }
  });
  verify('the existing design example round-trips exact entity and relationship content', () => {
    const graph = readDiagram(a.id, 'requirements-internal', 1);
    const byId = (items) => [...items].sort((left, right) => left.id.localeCompare(right.id, 'en'));
    assert.deepEqual(
      graph.entities,
      byId(example.entities.filter((item) => graph.entities.some((e) => e.id === item.id))),
    );
    assert.deepEqual(
      graph.relationships,
      byId(example.relationships.filter((item) => item.content.kind !== 'functional_dependency')),
    );
    assert.equal(graph.notes[0].problem_md, example.notes[0].content.problemMd);
    assert.deepEqual(
      graph.notes.map((note) => note.entity_id).sort(),
      [...example.notes[0].content.entityIds].sort(),
    );
  });
  verify(
    'save time and actor resolve through the exact operation, without copying timestamps',
    () => {
      const row = db
        .prepare(
          `SELECT o.saved_at, o.actor_label FROM business_entity_revisions r
      JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
      WHERE r.project_id = ? AND r.entity_id = 'requirement-data' AND r.revision_no = 1`,
        )
        .get(a.id);
      assert(Number.isSafeInteger(row.saved_at));
      assert.equal(row.actor_label, 'SQL verification fixture');
    },
  );
  verify('all four citation families reject cross-project sources', () => {
    for (const [family, id] of [
      ['entity', 'requirements'],
      ['relationship', 'requirements-use-overview'],
      ['diagram', 'business-overview'],
      ['note', 'atomic-save'],
    ]) {
      assert.throws(() => citation(family, a.id, id, 1, b.sourceId), /FOREIGN KEY/);
    }
  });
  verify(
    'entity ownership pins a real revision and rejects mismatched kind or missing owner',
    () => {
      for (const owner of [
        { kind: 'module', id: 'agent-client' },
        { kind: 'module', id: 'missing' },
      ]) {
        assert.throws(
          () =>
            transaction(() => {
              const item = clone(example.entities.find((item) => item.id === 'update-requirement'));
              item.id = randomUUID();
              item.content.owner = owner;
              identity('entity', a.id, item.id, 'component');
              entityRevision(a.id, item, operation(a.id));
            }),
          /FOREIGN KEY/,
        );
      }
      assert.throws(
        () =>
          transaction(() => {
            const item = clone(example.entities.find((item) => item.id === 'update-requirement'));
            item.id = randomUUID();
            identity('entity', a.id, item.id, 'component');
            entityRevision(a.id, item, operation(a.id), 99);
          }),
        /FOREIGN KEY/,
      );
    },
  );
  verify('malformed JSON, mutable entity kind, and absent TS fields are rejected', () => {
    const op = operation(a.id);
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO business_entity_revisions
      (project_id, entity_id, revision_no, operation_id, schema_version, content_json)
      VALUES (?, 'requirements', 2, ?, 1, '{bad')`,
          )
          .run(a.id, op),
      /JSON|CHECK/,
    );
    const wrong = {
      ...example.entities[0],
      revisionNo: 2,
      content: { kind: 'external_system', name: 'Wrong', summary: 'Wrong' },
    };
    assert.throws(() => entityRevision(a.id, wrong, op), /FOREIGN KEY/);
    const missingType = clone(example.entities.find((item) => item.id === 'requirement-data'));
    missingType.revisionNo = 2;
    delete missingType.content.typeScript;
    assert.throws(() => entityRevision(a.id, missingType, op), /CHECK/);
    assert.throws(
      () =>
        db
          .prepare(
            `UPDATE business_entities SET kind = 'external_system' WHERE id = 'requirements'`,
          )
          .run(),
      /immutable/,
    );
  });
  verify('cross-project operations and code-source references cannot be stored', () => {
    const otherOperation = operation(b.id);
    const item = clone(example.entities.find((item) => item.id === 'requirement-data'));
    item.revisionNo = 2;
    assert.throws(() => entityRevision(a.id, item, otherOperation), /FOREIGN KEY/);
    item.content.primarySourceId = b.sourceId;
    assert.throws(() => entityRevision(a.id, item, operation(a.id)), /FOREIGN KEY/);
  });
  verify('relationship kinds reject invalid endpoint types and cross-project endpoints', () => {
    transaction(() => {
      const op = operation(b.id);
      identity('entity', b.id, 'other-module', 'module');
      entityRevision(
        b.id,
        {
          id: 'other-module',
          revisionNo: 1,
          content: { kind: 'module', name: 'Other project', summary: 'Fixture only', role: 'core' },
        },
        op,
      );
      identity('entity', b.id, 'other-component', 'component');
      entityRevision(
        b.id,
        {
          id: 'other-component',
          revisionNo: 1,
          content: {
            kind: 'component',
            name: 'Other component',
            summary: 'Fixture only',
            owner: { kind: 'module', id: 'other-module' },
            primarySourceId: null,
          },
        },
        op,
      );
    });
    for (const target of ['overview', 'other-component']) {
      assert.throws(
        () =>
          transaction(() => {
            const edge = clone(example.relationships.find((item) => item.content.kind === 'call'));
            edge.id = randomUUID();
            edge.content.targetId = target;
            identity('relationship', a.id, edge.id);
            relationshipRevision(a.id, edge, operation(a.id));
          }),
        /endpoint kinds/,
      );
    }
  });
  verify(
    'diagrams reject non-module scopes, absent revisions, and objects from the wrong level',
    () => {
      rejectsDiagram(
        a.id,
        (content) => {
          content.scope.moduleRef.id = 'agent-client';
        },
        /scope/,
      );
      rejectsDiagram(
        a.id,
        (content) => {
          content.entityRefs[0].revisionNo = 99;
        },
        /revision/,
      );
      rejectsDiagram(
        a.id,
        (content) => {
          content.entityRefs[0] = { id: 'overview', revisionNo: 1 };
        },
        /level/,
      );
      rejectsDiagram(b.id, () => {}, /scope/);
    },
  );
  verify(
    'a diagram cannot include two versions of one entity or an edge missing its endpoints',
    () => {
      rejectsDiagram(
        a.id,
        (content) => {
          content.entityRefs.push(content.entityRefs[0]);
        },
        /UNIQUE/,
      );
      rejectsDiagram(
        a.id,
        (content) => {
          content.entityRefs = content.entityRefs.filter((ref) => ref.id !== 'agent-review');
        },
        /FOREIGN KEY/,
      );
    },
  );
  verify('edge join keys cannot disagree with their referenced relationship version', () => {
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO diagram_revision_relationships VALUES (?, ?, 1, ?, 1, ?, ?)')
          .run(
            a.id,
            'requirements-internal',
            'requirements-use-overview',
            'update-requirement',
            'maintain-records',
          ),
      /level|FOREIGN KEY/,
    );
    assert.throws(
      () =>
        transaction(() => {
          const item = internal();
          item.id = randomUUID();
          item.content.relationshipRefs = [];
          item.content.noteRefs = [];
          identity('diagram', a.id, item.id);
          diagramRevision(a.id, item, operation(a.id));
          db.prepare('INSERT INTO diagram_revision_relationships VALUES (?, ?, 1, ?, 1, ?, ?)').run(
            a.id,
            item.id,
            'update-maintains-records',
            'maintain-records',
            'update-requirement',
          );
        }),
      /FOREIGN KEY/,
    );
  });
  verify('overlapping technical scopes are allowed, but notes outside a view are rejected', () => {
    transaction(() => {
      const op = operation(a.id);
      identity('note', a.id, 'overlapping-note');
      noteRevision(
        a.id,
        {
          id: 'overlapping-note',
          revisionNo: 1,
          content: {
            title: 'Fixture overlap',
            problemMd: 'Same member, another concern',
            entityIds: ['update-requirement'],
          },
        },
        op,
      );
    });
    rejectsDiagram(
      a.id,
      (content) => {
        content.relationshipRefs = [];
        content.entityRefs = content.entityRefs.filter((ref) => ref.id !== 'maintain-records');
      },
      /note scope/,
    );
  });
  verify('a later entity and diagram revision preserve historical graph content exactly', () => {
    const before = readDiagram(a.id, 'requirements-internal', 1);
    transaction(() => {
      const op = operation(a.id);
      const item = clone(example.entities.find((item) => item.id === 'update-requirement'));
      item.revisionNo = 2;
      item.content.summary = 'Fixture revised summary, not a new node identity.';
      entityRevision(a.id, item, op);
      citation('entity', a.id, item.id, 2, a.sourceId);
      assert.equal(
        db
          .prepare(
            `UPDATE business_entities SET current_revision_no = 2
        WHERE project_id = ? AND id = ? AND current_revision_no = 1`,
          )
          .run(a.id, item.id).changes,
        1,
      );
      const diagram = internal();
      diagram.revisionNo = 2;
      diagram.content.entityRefs.find((ref) => ref.id === item.id).revisionNo = 2;
      diagramRevision(a.id, diagram, op);
      citation('diagram', a.id, diagram.id, 2, a.sourceId);
      db.prepare(
        `UPDATE design_diagrams SET current_revision_no = 2 WHERE project_id = ? AND id = ?`,
      ).run(a.id, diagram.id);
    });
    assert.deepEqual(readDiagram(a.id, 'requirements-internal', 1), before);
    assert.equal(
      readDiagram(a.id, 'requirements-internal', 2).entities.find(
        (item) => item.id === 'update-requirement',
      ).revisionNo,
      2,
    );
    assert.equal(
      db
        .prepare(
          `UPDATE business_entities SET current_revision_no = 3
      WHERE project_id = ? AND id = 'update-requirement' AND current_revision_no = 1`,
        )
        .run(a.id).changes,
      0,
    );
  });
  verify('all new snapshots, memberships and citations reject overwrite and deletion', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all()
      .map(({ name }) => name);
    for (const table of tables.filter(
      (name) =>
        /_revisions$|_revision_(entities|relationships|notes|sources)$/.test(name) &&
        !/^(project|overview)/.test(name),
    )) {
      const column = db.pragma(`table_xinfo('${table}')`).find((column) => !column.hidden).name;
      assert.throws(() => db.exec(`UPDATE ${table} SET ${column} = ${column}`), /append-only/);
      assert.throws(() => db.exec(`DELETE FROM ${table}`), /append-only/);
    }
  });
  verify('missing deferred head revisions fail at commit and roll back the full batch', () => {
    const before = db.prepare('SELECT count(*) AS count FROM write_operations').get().count;
    const id = randomUUID();
    assert.throws(
      () =>
        transaction(() => {
          operation(a.id);
          identity('diagram', a.id, id);
        }),
      /FOREIGN KEY/,
    );
    assert.equal(db.prepare('SELECT count(*) AS count FROM write_operations').get().count, before);
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM design_diagrams WHERE id = ?').get(id).count,
      0,
    );
    assert.throws(
      () =>
        db
          .prepare(
            `UPDATE design_diagrams SET current_revision_no = 1 WHERE project_id = ? AND id = 'requirements-internal'`,
          )
          .run(a.id),
      /forward/,
    );
  });
  verify('a later owner rename does not rewrite historical ownership context', () => {
    transaction(() => {
      const op = operation(a.id);
      const item = clone(example.entities.find((item) => item.id === 'requirements'));
      item.revisionNo = 2;
      item.content.name = 'Renamed module fixture';
      entityRevision(a.id, item, op);
      citation('entity', a.id, item.id, 2, a.sourceId);
      db.prepare(
        `UPDATE business_entities SET current_revision_no = 2 WHERE project_id = ? AND id = 'requirements'`,
      ).run(a.id);
    });
    const row = db
      .prepare(
        `SELECT owner.name FROM business_entity_revisions child
      JOIN business_entity_revisions owner ON owner.project_id = child.project_id
        AND owner.entity_id = child.owner_entity_id AND owner.revision_no = child.owner_revision_no
      WHERE child.project_id = ? AND child.entity_id = 'update-requirement' AND child.revision_no = 1`,
      )
      .get(a.id);
    assert.equal(row.name, '需求推进');
  });
  verify(
    'an exception after a full graph batch rolls back all snapshots, sources and heads',
    () => {
      const tables = db
        .prepare(`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
        .all()
        .map(({ name }) => name);
      const counts = () =>
        tables.map((name) => db.prepare(`SELECT count(*) AS count FROM ${name}`).get().count);
      const before = counts();
      assert.throws(
        () =>
          transaction(() => {
            const op = operation(a.id);
            const sourceId = randomUUID();
            db.prepare(
              `INSERT INTO sources (id, project_id, captured_by_operation_id, kind, raw_text, content_hash)
        VALUES (?, ?, ?, 'document', 'Rollback fixture', ?)`,
            ).run(sourceId, a.id, op, hash('Rollback fixture'));
            const entity = clone(example.entities.find((item) => item.id === 'update-requirement'));
            entity.revisionNo = 3;
            entityRevision(a.id, entity, op, 2);
            citation('entity', a.id, entity.id, 3, sourceId);
            const edge = clone(
              example.relationships.find((item) => item.id === 'update-maintains-records'),
            );
            edge.revisionNo = 2;
            relationshipRevision(a.id, edge, op);
            citation('relationship', a.id, edge.id, 2, sourceId);
            const note = clone(example.notes[0]);
            note.revisionNo = 2;
            noteRevision(a.id, note, op);
            citation('note', a.id, note.id, 2, sourceId);
            const diagram = internal();
            diagram.revisionNo = 3;
            diagram.content.entityRefs.find((ref) => ref.id === entity.id).revisionNo = 3;
            diagram.content.relationshipRefs.find((ref) => ref.id === edge.id).revisionNo = 2;
            diagram.content.noteRefs[0].revisionNo = 2;
            diagramRevision(a.id, diagram, op);
            citation('diagram', a.id, diagram.id, 3, sourceId);
            for (const [family, item] of [
              ['entity', entity],
              ['relationship', edge],
              ['note', note],
              ['diagram', diagram],
            ]) {
              const [table] = families[family];
              db.prepare(
                `UPDATE ${table} SET current_revision_no = ? WHERE project_id = ? AND id = ?`,
              ).run(item.revisionNo, a.id, item.id);
            }
            throw new Error('injected failure after heads');
          }),
        /injected failure/,
      );
      assert.deepEqual(counts(), before);
      assert.equal(
        db
          .prepare(
            `SELECT current_revision_no FROM design_diagrams
      WHERE project_id = ? AND id = 'requirements-internal'`,
          )
          .get(a.id).current_revision_no,
        2,
      );
    },
  );
  verify('one operation cannot create multiple revisions of the same entity', () => {
    const op = db
      .prepare(
        `SELECT operation_id FROM business_entity_revisions
      WHERE project_id = ? AND entity_id = 'update-requirement' AND revision_no = 2`,
      )
      .get(a.id).operation_id;
    const item = clone(example.entities.find((item) => item.id === 'update-requirement'));
    item.revisionNo = 3;
    assert.throws(() => entityRevision(a.id, item, op), /UNIQUE/);
  });
  verify('reverse view lookup and history pagination use the intended indexes', () => {
    const reverse = db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT diagram_id FROM diagram_revision_entities
      WHERE project_id = ? AND entity_id = ?`,
      )
      .all(a.id, 'update-requirement');
    assert(reverse.some((row) => row.detail.includes('diagram_entities_reverse')));
    const history = db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT revision_no FROM business_entity_revisions
      WHERE project_id = ? AND entity_id = ? AND revision_no < 100 ORDER BY revision_no DESC LIMIT 20`,
      )
      .all(a.id, 'update-requirement');
    assert(history.some((row) => /USING.*INDEX/.test(row.detail)));
  });
  verify(
    'reopened database retains exact revisions and passes integrity and foreign-key checks',
    () => {
      const reopened = new Database(file, { readonly: true });
      try {
        reopened.pragma('foreign_keys = ON');
        assert.equal(reopened.pragma('integrity_check', { simple: true }), 'ok');
        assert.deepEqual(reopened.pragma('foreign_key_check'), []);
        assert.equal(
          reopened
            .prepare(
              `SELECT entity_revision_no FROM diagram_revision_entities
        WHERE project_id = ? AND diagram_id = 'requirements-internal' AND revision_no = 1 AND entity_id = 'update-requirement'`,
            )
            .get(a.id).entity_revision_no,
          1,
        );
      } finally {
        reopened.close();
      }
    },
  );
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        sqlite: db.prepare('SELECT sqlite_version() AS version').get().version,
        newTables: 16,
        totalTables: 24,
        checks,
        scope:
          'Physical SQL proposal only; runtime services, publication, evidence semantics and MCP contracts remain unimplemented',
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
