import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const directory = mkdtempSync(join(tmpdir(), 'coseed-schema-proposal-'));
const file = join(directory, 'design.sqlite');
const database = new Database(file);
const checks = [];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const count = (table) => database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count;
const verify = (name, run) => {
  run();
  checks.push(name);
};

// Fixtures exercise the proposed SQL directly; this is not the application save service.
function operation(projectId) {
  const id = randomUUID();
  database
    .prepare(
      `INSERT INTO write_operations
    (id, project_id, request_hash, entrypoint, actor_kind, actor_label, saved_at)
    VALUES (?, ?, ?, 'web', 'human', 'schema verification fixture', ?)`,
    )
    .run(id, projectId, hash(id), Date.now());
  return id;
}
function source(projectId, operationId) {
  const id = randomUUID();
  const raw = `Fixture original material ${id}`;
  database
    .prepare(
      `INSERT INTO sources
    (id, project_id, captured_by_operation_id, kind, raw_text, content_hash)
    VALUES (?, ?, ?, 'manual_edit', ?, ?)`,
    )
    .run(id, projectId, operationId, raw, hash(raw));
  return id;
}
function createProject(name) {
  const id = randomUUID();
  let sourceId;
  database
    .transaction(() => {
      database.prepare('INSERT INTO projects VALUES (?, 1, ?)').run(id, Date.now());
      const operationId = operation(id);
      sourceId = source(id, operationId);
      database
        .prepare(
          `INSERT INTO project_revisions
      (project_id, revision_no, operation_id, name) VALUES (?, 1, ?, ?)`,
        )
        .run(id, operationId, name);
      database
        .prepare(
          `INSERT INTO project_revision_sources VALUES (?, 1, ?, 'after', '/name', 'Fixture source supports project name')`,
        )
        .run(id, sourceId);
      database.prepare('INSERT INTO project_overviews VALUES (?, NULL)').run(id);
    })
    .immediate();
  return { id, sourceId };
}
function appendOverview(projectId, revision, sourceId, existingOperationId) {
  const operationId = existingOperationId ?? operation(projectId);
  const content = JSON.stringify({
    product: { markdown: `Fixture revision ${revision}` },
    concepts: { entries: [], relations: [] },
    examples: [],
  });
  database
    .prepare(`INSERT INTO overview_revisions VALUES (?, ?, ?, ?, 1, ?, ?)`)
    .run(
      projectId,
      revision,
      revision === 1 ? null : revision - 1,
      operationId,
      content,
      hash(content),
    );
  database
    .prepare(
      `INSERT INTO overview_revision_sources VALUES (?, ?, ?, 'after', '/product/markdown', 'Fixture source supports the product statement')`,
    )
    .run(projectId, revision, sourceId);
  database
    .prepare('UPDATE project_overviews SET current_revision_no = ? WHERE project_id = ?')
    .run(revision, projectId);
}

try {
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.exec(
    readFileSync(new URL('../docs/database/schema-draft.sql', import.meta.url), 'utf8'),
  );
  verify('all eight tables are STRICT and foreign keys are enabled', () => {
    const tables = database
      .pragma('table_list')
      .filter((table) => table.name !== 'sqlite_schema' && table.name !== 'sqlite_temp_schema');
    assert.equal(tables.length, 8);
    assert(tables.every((table) => table.strict === 1));
    assert.equal(database.pragma('foreign_keys', { simple: true }), 1);
  });

  const first = createProject('Fixture A');
  const second = createProject('Fixture B');
  verify('project creation commits identity, first revision and exact source together', () => {
    assert.equal(count('projects'), 2);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    assert.equal(
      database
        .prepare('SELECT current_revision_no FROM project_overviews WHERE project_id = ?')
        .get(first.id).current_revision_no,
      null,
    );
  });
  verify('a dangling deferred head fails at commit and rolls back project creation', () => {
    const id = randomUUID();
    assert.throws(
      () =>
        database
          .transaction(() => {
            database.prepare('INSERT INTO projects VALUES (?, 1, ?)').run(id, Date.now());
            operation(id);
          })
          .immediate(),
      /FOREIGN KEY/,
    );
    assert.equal(
      database.prepare('SELECT count(*) AS count FROM projects WHERE id = ?').get(id).count,
      0,
    );
    assert.equal(
      database
        .prepare('SELECT count(*) AS count FROM write_operations WHERE project_id = ?')
        .get(id).count,
      0,
    );
  });

  database.transaction(() => appendOverview(first.id, 1, first.sourceId)).immediate();
  const original = database
    .prepare('SELECT content_json FROM overview_revisions WHERE project_id = ? AND revision_no = 1')
    .get(first.id).content_json;
  database.transaction(() => appendOverview(first.id, 2, first.sourceId)).immediate();
  verify('current reads use the head and previous snapshots retain their original content', () => {
    const result = database
      .prepare(
        `SELECT r.revision_no FROM project_overviews h JOIN overview_revisions r
      ON r.project_id = h.project_id AND r.revision_no = h.current_revision_no WHERE h.project_id = ?`,
      )
      .get(first.id);
    assert.equal(result.revision_no, 2);
    assert.equal(
      database
        .prepare(
          'SELECT content_json FROM overview_revisions WHERE project_id = ? AND revision_no = 1',
        )
        .get(first.id).content_json,
      original,
    );
  });
  verify('sources from another project cannot be attached to this revision', () => {
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO overview_revision_sources VALUES (?, 2, ?, 'after', '/product/markdown', 'Cross-project fixture')`,
          )
          .run(first.id, second.sourceId),
      /FOREIGN KEY/,
    );
  });
  verify('write operations from another project cannot create this project revision', () => {
    const otherOperation = database
      .prepare('SELECT id FROM write_operations WHERE project_id = ?')
      .get(second.id).id;
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO project_revisions (project_id, revision_no, previous_revision_no, operation_id, name) VALUES (?, 2, 1, ?, 'Invalid')`,
          )
          .run(first.id, otherOperation),
      /FOREIGN KEY/,
    );
  });
  verify('malformed JSON, invalid types and missing predecessor values are rejected', () => {
    const op = database
      .prepare('SELECT id FROM write_operations WHERE project_id = ?')
      .get(second.id).id;
    const insert = database.prepare('INSERT INTO overview_revisions VALUES (?, ?, ?, ?, 1, ?, ?)');
    assert.throws(() => insert.run(second.id, 1, null, op, '{bad', hash('x')), /CHECK/);
    assert.throws(() => insert.run(second.id, 1, null, op, '[]', hash('x')), /CHECK/);
    assert.throws(() => insert.run(second.id, 2, null, op, '{}', hash('x')), /CHECK/);
    assert.throws(() => insert.run(second.id, 3, 2, op, '{}', hash('x')), /FOREIGN KEY/);
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO write_operations
      (id, project_id, request_hash, entrypoint, actor_kind, actor_label, saved_at)
      VALUES (?, ?, ?, 'web', 'human', 'type fixture', ?)`,
          )
          .run(randomUUID(), first.id, hash('type fixture'), 'not-an-integer'),
      /cannot store TEXT/,
    );
  });
  verify(
    'historical snapshots, sources, operations and citations reject overwrite and deletion',
    () => {
      for (const table of [
        'project_revisions',
        'overview_revisions',
        'sources',
        'write_operations',
        'project_revision_sources',
        'overview_revision_sources',
      ]) {
        assert.throws(() => database.exec(`DELETE FROM ${table}`), /append-only/);
      }
      assert.throws(
        () =>
          database
            .prepare('UPDATE overview_revisions SET content_json = ? WHERE project_id = ?')
            .run('{}', first.id),
        /append-only/,
      );
      assert.throws(
        () =>
          database
            .prepare('UPDATE sources SET raw_text = ? WHERE id = ?')
            .run('replacement', first.sourceId),
        /append-only/,
      );
      assert.throws(
        () =>
          database
            .prepare('UPDATE overview_revision_sources SET explanation_md = ? WHERE project_id = ?')
            .run('replacement', first.id),
        /append-only/,
      );
    },
  );
  verify('heads cannot move backward or commit a missing next version', () => {
    assert.throws(
      () =>
        database
          .prepare('UPDATE project_overviews SET current_revision_no = 1 WHERE project_id = ?')
          .run(first.id),
      /advance by one/,
    );
    assert.throws(
      () =>
        database
          .transaction(() =>
            database
              .prepare('UPDATE project_overviews SET current_revision_no = 3 WHERE project_id = ?')
              .run(first.id),
          )
          .immediate(),
      /FOREIGN KEY/,
    );
    assert.equal(
      database
        .prepare('SELECT current_revision_no FROM project_overviews WHERE project_id = ?')
        .get(first.id).current_revision_no,
      2,
    );
  });
  verify(
    'an exception rolls back the operation, original material, snapshot, citation and head',
    () => {
      const before = [
        'write_operations',
        'sources',
        'overview_revisions',
        'overview_revision_sources',
      ].map(count);
      assert.throws(
        () =>
          database
            .transaction(() => {
              const op = operation(first.id);
              const material = source(first.id, op);
              appendOverview(first.id, 3, material, op);
              throw new Error('fixture failure after head change');
            })
            .immediate(),
        /fixture failure/,
      );
      assert.deepEqual(
        ['write_operations', 'sources', 'overview_revisions', 'overview_revision_sources'].map(
          count,
        ),
        before,
      );
      assert.equal(
        database
          .prepare('SELECT current_revision_no FROM project_overviews WHERE project_id = ?')
          .get(first.id).current_revision_no,
        2,
      );
    },
  );
  verify('operation identity is unique and stale conditional writes affect zero rows', () => {
    const op = database
      .prepare('SELECT * FROM write_operations WHERE project_id = ? LIMIT 1')
      .get(first.id);
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO write_operations (id, project_id, request_hash, entrypoint, actor_kind, actor_label, saved_at) VALUES (?, ?, ?, 'web', 'human', 'duplicate', ?)`,
          )
          .run(op.id, first.id, hash('different request'), Date.now()),
      /UNIQUE/,
    );
    const result = database
      .prepare(
        'UPDATE project_overviews SET current_revision_no = 2 WHERE project_id = ? AND current_revision_no = 1',
      )
      .run(first.id);
    assert.equal(result.changes, 0);
  });
  verify('WAL readers retain a snapshot while another connection commits the next version', () => {
    const reader = new Database(file);
    try {
      reader.pragma('foreign_keys = ON');
      reader.exec('BEGIN');
      const head = reader.prepare(
        'SELECT current_revision_no FROM project_overviews WHERE project_id = ?',
      );
      assert.equal(head.get(first.id).current_revision_no, 2);
      database.transaction(() => appendOverview(first.id, 3, first.sourceId)).immediate();
      assert.equal(head.get(first.id).current_revision_no, 2);
      reader.exec('COMMIT');
      assert.equal(head.get(first.id).current_revision_no, 3);
    } finally {
      reader.close();
    }
  });
  verify('history pagination and reverse evidence lookups use indexes', () => {
    const history = database
      .prepare(
        'EXPLAIN QUERY PLAN SELECT revision_no FROM overview_revisions WHERE project_id = ? AND revision_no < ? ORDER BY revision_no DESC LIMIT 20',
      )
      .all(first.id, 100);
    assert(history.some((row) => /USING.*INDEX/.test(row.detail)));
    const reverse = database
      .prepare(
        'EXPLAIN QUERY PLAN SELECT revision_no FROM overview_revision_sources WHERE project_id = ? AND source_id = ?',
      )
      .all(first.id, first.sourceId);
    assert(reverse.some((row) => row.detail.includes('overview_sources_reverse')));
  });
  verify('the persisted draft database passes integrity and foreign-key checks', () => {
    const reopened = new Database(file, { readonly: true });
    try {
      assert.equal(reopened.pragma('integrity_check', { simple: true }), 'ok');
      assert.deepEqual(reopened.pragma('foreign_key_check'), []);
      assert.equal(
        reopened
          .prepare('SELECT current_revision_no FROM project_overviews WHERE project_id = ?')
          .get(first.id).current_revision_no,
        3,
      );
    } finally {
      reopened.close();
    }
  });
  console.log(
    JSON.stringify(
      {
        sqlite: database.prepare('SELECT sqlite_version() AS version').get().version,
        tables: 8,
        checks,
        status: 'passed',
        scope:
          'SQL proposal only; content validation, evidence coverage and retry services remain unimplemented',
      },
      null,
      2,
    ),
  );
} finally {
  database.close();
  rmSync(directory, { recursive: true, force: true });
}
