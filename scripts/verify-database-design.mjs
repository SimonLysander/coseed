import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withProposedDatabase, hash } from './database-design/fixture.mjs';

// Actual proposed common/project/overview SQL, always in a disposable database.
const checks = [];
withProposedDatabase(({ db, project, save, rows, head }) => {
  const verify = (name, run) => {
    run();
    checks.push(name);
  };
  const a = project();
  const b = project();
  const append = (projectId, operation, sourceId, markdown) => {
    const revision =
      (db
        .prepare(
          'SELECT current_revision_no AS revision FROM project_overviews WHERE project_id = ?',
        )
        .get(projectId).revision ?? 0) + 1;
    const content = JSON.stringify({
      product: { markdown },
      concepts: { entries: [], relations: [] },
      examples: { introductionMd: null, actors: [], useCases: [], sections: [] },
    });
    db.prepare(
      `INSERT INTO overview_revisions
      (project_id, revision_no, previous_revision_no, operation_id, schema_version, content_json, content_hash)
      VALUES (?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      projectId,
      revision,
      revision === 1 ? null : revision - 1,
      operation,
      content,
      hash(content),
    );
    db.prepare(
      `INSERT INTO overview_revision_sources VALUES (?, ?, ?, 'after', '/product/markdown', 'Fictional source for this revision')`,
    ).run(projectId, revision, sourceId);
    db.prepare('UPDATE project_overviews SET current_revision_no = ? WHERE project_id = ?').run(
      revision,
      projectId,
    );
  };
  verify(
    'eight STRICT tables share the operation-based version model without a snapshot table',
    () => {
      const tables = db.pragma('table_list').filter((table) => !table.name.startsWith('sqlite_'));
      assert.equal(tables.length, 8);
      assert(tables.every((table) => table.strict === 1));
      assert(!tables.some((table) => table.name === 'project_versions'));
      assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    },
  );
  verify(
    'project creation saves metadata revision 1, source and operation version 0 together',
    () => {
      assert.equal(head(a.id), 0);
      assert.equal(rows('project_revisions', a.id, 0)[0].revision_no, 1);
      assert.equal(rows('overview_revisions', a.id, 0).length, 0);
      assert.deepEqual(db.pragma('foreign_key_check'), []);
    },
  );
  verify('dangling deferred project pointers cannot commit a partially created project', () => {
    const id = randomUUID();
    assert.throws(
      () =>
        db
          .transaction(() => db.prepare('INSERT INTO projects VALUES (?, 1, 0, 1)').run(id))
          .immediate(),
      /FOREIGN KEY/,
    );
    assert(!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id));
  });
  const first = save(a.id, (op) => append(a.id, op, a.sourceId, 'Fixture original overview'));
  const second = save(a.id, (op) => append(a.id, op, a.sourceId, 'Fixture corrected overview'));
  verify('current and historical overview reads resolve their own complete contents', () => {
    assert.equal(
      JSON.parse(rows('overview_revisions', a.id, first.version)[0].content_json).product.markdown,
      'Fixture original overview',
    );
    assert.equal(
      JSON.parse(rows('overview_revisions', a.id, second.version)[0].content_json).product.markdown,
      'Fixture corrected overview',
    );
    assert.equal(rows('overview_revisions', a.id, first.version)[0].revision_no, 1);
  });
  verify('a new revision cannot cite another project source and the whole save rolls back', () => {
    const before = head(a.id);
    assert.throws(
      () => save(a.id, (op) => append(a.id, op, b.sourceId, 'Invalid cross-project source')),
      /FOREIGN KEY/,
    );
    assert.equal(head(a.id), before);
  });
  verify('a revision cannot be attached after its successful operation already exists', () => {
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO overview_revisions
      (project_id, revision_no, previous_revision_no, operation_id, schema_version, content_json, content_hash)
      VALUES (?, 3, 2, ?, 1, '{}', ?)`,
          )
          .run(a.id, second.id, hash('{}')),
      /closed/,
    );
  });
  verify('malformed JSON and missing predecessor revisions are rejected', () => {
    assert.throws(
      () =>
        save(a.id, (op) =>
          db
            .prepare(
              `INSERT INTO overview_revisions
      (project_id, revision_no, previous_revision_no, operation_id, schema_version, content_json, content_hash)
      VALUES (?, 3, 2, ?, 1, '{bad', ?)`,
            )
            .run(a.id, op, hash('bad')),
        ),
      /CHECK/,
    );
    assert.throws(
      () =>
        save(a.id, (op) =>
          db
            .prepare(
              `INSERT INTO overview_revisions
      (project_id, revision_no, previous_revision_no, operation_id, schema_version, content_json, content_hash)
      VALUES (?, 4, 2, ?, 1, '{}', ?)`,
            )
            .run(a.id, op, hash('{}')),
        ),
      /CHECK/,
    );
  });
  verify('committed contents, source material, citations and operations are append-only', () => {
    for (const table of [
      'project_revisions',
      'overview_revisions',
      'sources',
      'project_revision_sources',
      'overview_revision_sources',
      'write_operations',
    ]) {
      assert.throws(() => db.exec(`DELETE FROM ${table}`), /append-only/);
    }
    assert.throws(
      () => db.prepare('UPDATE overview_revisions SET content_json = ?').run('{}'),
      /append-only/,
    );
  });
  verify('new citations cannot be appended to historical overview or project revisions', () => {
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO overview_revision_sources VALUES (?, 1, ?, 'after', '', 'Late citation')`,
          )
          .run(a.id, b.sourceId),
      /closed/,
    );
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO project_revision_sources VALUES (?, 1, ?, 'after', '', 'Late citation')`,
          )
          .run(a.id, b.sourceId),
      /closed/,
    );
  });
  verify('restoring older content creates another revision and keeps previous history', () => {
    save(a.id, (op) => append(a.id, op, a.sourceId, 'Fixture original overview'));
    assert.equal(rows('overview_revisions', a.id, head(a.id))[0].revision_no, 3);
    assert.equal(
      JSON.parse(rows('overview_revisions', a.id, second.version)[0].content_json).product.markdown,
      'Fixture corrected overview',
    );
  });
  verify('metadata revisions and project content versions remain distinct', () => {
    save(a.id, (op) => {
      db.prepare(
        `INSERT INTO project_revisions (project_id, revision_no, previous_revision_no, operation_id, name)
        VALUES (?, 2, 1, ?, 'Renamed fixture')`,
      ).run(a.id, op);
      db.prepare(
        `INSERT INTO project_revision_sources VALUES (?, 2, ?, 'after', '/name', 'Fixture rename')`,
      ).run(a.id, a.sourceId);
      db.prepare('UPDATE projects SET current_revision_no = 2 WHERE id = ?').run(a.id);
    });
    assert.equal(head(a.id), 4);
    assert.equal(rows('project_revisions', a.id, 0)[0].name, 'Fictional project');
    assert.equal(rows('project_revisions', a.id, 4)[0].name, 'Renamed fixture');
  });
  verify('stale project bases cannot overwrite current content', () => {
    assert.throws(
      () => save(a.id, () => assert.fail('must not execute'), { base: first.version }),
      /version conflict/,
    );
  });
  verify(
    'retries with the original base return the same operation result without another revision',
    () => {
      const before = head(a.id);
      const result = save(a.id, () => assert.fail('must not execute'), {
        id: first.id,
        base: first.base,
        request: first.id,
      });
      assert.deepEqual(result, first);
      assert.equal(head(a.id), before);
    },
  );
  verify('the complete proposed project schema has no dangling foreign keys', () => {
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  });
});
process.stdout.write(
  `${JSON.stringify({ scope: 'actual common/project SQL proposals', checks: checks.length, passed: checks }, null, 2)}\n`,
);
