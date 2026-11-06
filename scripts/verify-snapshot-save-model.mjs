import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

// Temporary SQL experiment, not a production save service or a complete module schema.
const directory = mkdtempSync(join(tmpdir(), 'coseed-snapshot-model-'));
const file = join(directory, 'model.sqlite');
let db = new Database(file);
const checks = [];
const hash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const verify = (name, run) => {
  run();
  checks.push(name);
};
const count = (table) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
const head = (project) =>
  db.prepare('SELECT current_content_version AS version FROM projects WHERE id = ?').get(project)
    .version;

function connect() {
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
}

// Only columns needed to exercise coordination are present. Content Schemas,
// full diagram rules and authentication remain outside this SQL experiment.
const fixtureSchema = `
CREATE TABLE project_revisions (
  project_id TEXT NOT NULL REFERENCES projects(id),
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  operation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (project_id, revision_no),
  UNIQUE (project_id, operation_id),
  FOREIGN KEY (project_id, operation_id) REFERENCES write_operations(project_id, id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE requirements (
  project_id TEXT NOT NULL REFERENCES projects(id),
  id TEXT NOT NULL,
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, id, current_revision_no)
    REFERENCES requirement_revisions(project_id, requirement_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE requirement_revisions (
  project_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  operation_id TEXT NOT NULL,
  markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('designing', 'ready_for_implementation',
    'pending_acceptance', 'completed', 'on_hold', 'cancelled')),
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  PRIMARY KEY (project_id, requirement_id, revision_no),
  UNIQUE (project_id, requirement_id, operation_id),
  FOREIGN KEY (project_id, requirement_id) REFERENCES requirements(project_id, id),
  FOREIGN KEY (project_id, operation_id) REFERENCES write_operations(project_id, id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE INDEX requirement_operations ON requirement_revisions(project_id, operation_id);
CREATE TABLE progress_records (
  project_id TEXT NOT NULL REFERENCES projects(id),
  id TEXT NOT NULL,
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, id, current_revision_no)
    REFERENCES progress_record_revisions(project_id, record_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE progress_record_revisions (
  project_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  operation_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  markdown TEXT NOT NULL,
  occurred_at INTEGER,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  PRIMARY KEY (project_id, record_id, revision_no),
  UNIQUE (project_id, record_id, operation_id),
  FOREIGN KEY (project_id, record_id) REFERENCES progress_records(project_id, id),
  FOREIGN KEY (project_id, requirement_id) REFERENCES requirements(project_id, id),
  FOREIGN KEY (project_id, operation_id) REFERENCES write_operations(project_id, id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE INDEX record_operations ON progress_record_revisions(project_id, operation_id);
CREATE TABLE sources (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  captured_by_operation_id TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, captured_by_operation_id) REFERENCES write_operations(project_id, id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE project_revision_sources (
  project_id TEXT NOT NULL, revision_no INTEGER NOT NULL, source_id TEXT NOT NULL,
  PRIMARY KEY (project_id, revision_no, source_id),
  FOREIGN KEY (project_id, revision_no) REFERENCES project_revisions(project_id, revision_no),
  FOREIGN KEY (project_id, source_id) REFERENCES sources(project_id, id)
) STRICT;
CREATE TABLE requirement_revision_sources (
  project_id TEXT NOT NULL, requirement_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  PRIMARY KEY (project_id, requirement_id, revision_no, source_id),
  FOREIGN KEY (project_id, requirement_id, revision_no)
    REFERENCES requirement_revisions(project_id, requirement_id, revision_no),
  FOREIGN KEY (project_id, source_id) REFERENCES sources(project_id, id)
) STRICT;
CREATE TABLE progress_record_revision_sources (
  project_id TEXT NOT NULL, record_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  PRIMARY KEY (project_id, record_id, revision_no, source_id),
  FOREIGN KEY (project_id, record_id, revision_no)
    REFERENCES progress_record_revisions(project_id, record_id, revision_no),
  FOREIGN KEY (project_id, source_id) REFERENCES sources(project_id, id)
) STRICT;
CREATE TABLE record_revision_links (
  project_id TEXT NOT NULL, record_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  target_id TEXT NOT NULL, target_revision_no INTEGER NOT NULL,
  PRIMARY KEY (project_id, record_id, revision_no, target_id),
  FOREIGN KEY (project_id, record_id, revision_no)
    REFERENCES progress_record_revisions(project_id, record_id, revision_no),
  FOREIGN KEY (project_id, target_id, target_revision_no)
    REFERENCES progress_record_revisions(project_id, record_id, revision_no)
) STRICT;
CREATE TABLE requirement_status_basis (
  project_id TEXT NOT NULL, requirement_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  record_id TEXT NOT NULL, record_revision_no INTEGER NOT NULL,
  PRIMARY KEY (project_id, requirement_id, revision_no, record_id),
  FOREIGN KEY (project_id, requirement_id, revision_no)
    REFERENCES requirement_revisions(project_id, requirement_id, revision_no),
  FOREIGN KEY (project_id, record_id, record_revision_no)
    REFERENCES progress_record_revisions(project_id, record_id, revision_no)
) STRICT;
`;

const revisionFamilies = [
  ['project_revisions', 'project_id', 'project'],
  ['requirement_revisions', 'requirement_id', 'requirement'],
  ['progress_record_revisions', 'record_id', 'record'],
];

function addFixtureGuards() {
  const operationCondition = (column) => `EXISTS (
    SELECT 1 FROM write_operations WHERE project_id = NEW.project_id
      AND id = NEW.${column})`;
  const conditions = new Map([
    ...revisionFamilies.map(([table]) => [table, operationCondition('operation_id')]),
    ['sources', operationCondition('captured_by_operation_id')],
  ]);
  for (const [table, parent, id] of [
    ['project_revision_sources', 'project_revisions', 'project_id'],
    ['requirement_revision_sources', 'requirement_revisions', 'requirement_id'],
    ['progress_record_revision_sources', 'progress_record_revisions', 'record_id'],
    ['record_revision_links', 'progress_record_revisions', 'record_id'],
    ['requirement_status_basis', 'requirement_revisions', 'requirement_id'],
  ]) {
    conditions.set(
      table,
      `EXISTS (SELECT 1 FROM ${parent} r JOIN write_operations v
        ON v.project_id = r.project_id AND v.id = r.operation_id
        WHERE r.project_id = NEW.project_id AND r.${id} = NEW.${id}
          AND r.revision_no = NEW.revision_no)`,
    );
  }
  for (const [table, condition] of conditions) {
    db.exec(`
      CREATE TRIGGER ${table}_sealed BEFORE INSERT ON ${table}
      WHEN ${condition}
      BEGIN SELECT RAISE(ABORT, 'revision or operation is sealed'); END;
      CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'fixture history is append-only'); END;
      CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'fixture history is append-only'); END;
    `);
  }
}

function insertOperation(project, id, base, requestHash) {
  // Same fictional timestamp for every operation demonstrates that time is not ordering.
  db.prepare(
    `INSERT INTO write_operations
    (id, project_id, base_content_version, request_hash, entrypoint, actor_kind, actor_label, saved_at)
    VALUES (?, ?, ?, ?, 'system', 'system', 'Fictional SQL experiment', 1700000000000)`,
  ).run(id, project, base, requestHash);
}

function finish(project, id, base, fingerprint) {
  insertOperation(project, id, base, fingerprint);
  const version = base === null ? 0 : base + 1;
  if (version > 0)
    db.prepare('UPDATE projects SET current_content_version = ? WHERE id = ?').run(
      version,
      project,
    );
  assert.equal(
    head(project),
    db
      .prepare(
        'SELECT max(result_content_version) AS version FROM write_operations WHERE project_id = ?',
      )
      .get(project).version,
    'Save service must advance the project head before commit',
  );
}

function receipt(project, id) {
  const op = db
    .prepare(
      `SELECT o.id, o.base_content_version, o.result_content_version AS content_version, o.saved_at
    FROM write_operations o
    WHERE o.project_id = ? AND o.id = ?`,
    )
    .get(project, id);
  if (!op) return null;
  const changes = revisionFamilies.flatMap(([table, key, kind]) =>
    db
      .prepare(
        `SELECT ${key} AS id, revision_no FROM ${table}
      WHERE project_id = ? AND operation_id = ? ORDER BY ${key}`,
      )
      .all(project, id)
      .map((item) => ({ kind, ...item })),
  );
  return { ...op, changes };
}

function createProject() {
  const project = randomUUID();
  const operation = randomUUID();
  const source = randomUUID();
  db.transaction(() => {
    db.prepare('INSERT INTO projects VALUES (?, 1, 0, 1700000000000)').run(project);
    db.prepare('INSERT INTO project_revisions VALUES (?, 1, ?, ?)').run(
      project,
      operation,
      'Fictional CoSeed storage example',
    );
    db.prepare('INSERT INTO sources VALUES (?, ?, ?, ?)').run(
      project,
      source,
      operation,
      '  Explicitly fictional source.\r\nNo invented user history.',
    );
    db.prepare('INSERT INTO project_revision_sources VALUES (?, 1, ?)').run(project, source);
    finish(project, operation, null, hash(`create ${project}`));
  }).immediate();
  return { project, source, operation };
}

function appendRequirement(project, id, op, source, markdown, status = 'designing') {
  const previous = db
    .prepare(
      'SELECT current_revision_no AS revision FROM requirements WHERE project_id = ? AND id = ?',
    )
    .get(project, id);
  const revision = (previous?.revision ?? 0) + 1;
  if (!previous) db.prepare('INSERT INTO requirements VALUES (?, ?, 1)').run(project, id);
  db.prepare('INSERT INTO requirement_revisions VALUES (?, ?, ?, ?, ?, ?, 0)').run(
    project,
    id,
    revision,
    op,
    markdown,
    status,
  );
  db.prepare('INSERT INTO requirement_revision_sources VALUES (?, ?, ?, ?)').run(
    project,
    id,
    revision,
    source,
  );
  db.prepare('UPDATE requirements SET current_revision_no = ? WHERE project_id = ? AND id = ?').run(
    revision,
    project,
    id,
  );
  return revision;
}

function appendRecord(project, id, op, source, requirement, markdown, deleted = 0) {
  const previous = db
    .prepare(
      'SELECT current_revision_no AS revision FROM progress_records WHERE project_id = ? AND id = ?',
    )
    .get(project, id);
  const revision = (previous?.revision ?? 0) + 1;
  if (!previous) db.prepare('INSERT INTO progress_records VALUES (?, ?, 1)').run(project, id);
  db.prepare('INSERT INTO progress_record_revisions VALUES (?, ?, ?, ?, ?, ?, NULL, ?)').run(
    project,
    id,
    revision,
    op,
    requirement,
    markdown,
    deleted,
  );
  db.prepare('INSERT INTO progress_record_revision_sources VALUES (?, ?, ?, ?)').run(
    project,
    id,
    revision,
    source,
  );
  db.prepare(
    'UPDATE progress_records SET current_revision_no = ? WHERE project_id = ? AND id = ?',
  ).run(revision, project, id);
  return revision;
}

function verifyCurrentHeads(project) {
  for (const [identity, revisions, key] of [
    ['requirements', 'requirement_revisions', 'requirement_id'],
    ['progress_records', 'progress_record_revisions', 'record_id'],
  ]) {
    const invalid = db
      .prepare(
        `SELECT i.id FROM ${identity} i
      WHERE i.project_id = ? AND i.current_revision_no IS NOT (
        SELECT max(r.revision_no) FROM ${revisions} r
        WHERE r.project_id = i.project_id AND r.${key} = i.id
      )`,
      )
      .all(project);
    assert.equal(invalid.length, 0, 'object head must match its latest revision');
  }
  const profile = db
    .prepare(
      `SELECT current_revision_no AS head,
    (SELECT max(revision_no) FROM project_revisions WHERE project_id = projects.id) AS latest
    FROM projects WHERE id = ?`,
    )
    .get(project);
  assert.equal(profile.head, profile.latest, 'project profile head must match its latest revision');
}

function save(project, { id, base, request }, change) {
  // Deliberately a fixture fingerprint; production must canonicalize its actual logical request.
  const fingerprint = hash(JSON.stringify({ project, base, request }));
  return db
    .transaction(() => {
      const previous = db
        .prepare('SELECT request_hash FROM write_operations WHERE project_id = ? AND id = ?')
        .get(project, id);
      if (previous) {
        assert.equal(previous.request_hash, fingerprint, 'operation payload mismatch');
        return receipt(project, id);
      }
      assert.equal(head(project), base, 'project version conflict');
      change(id);
      const changed = revisionFamilies.reduce(
        (total, [table]) =>
          total +
          db
            .prepare(`SELECT count(*) AS n FROM ${table} WHERE project_id = ? AND operation_id = ?`)
            .get(project, id).n,
        0,
      );
      assert(changed > 0, 'empty save');
      verifyCurrentHeads(project);
      finish(project, id, base, fingerprint);
      return receipt(project, id);
    })
    .immediate();
}

function snapshot(project, version, family) {
  assert(
    db
      .prepare('SELECT 1 FROM write_operations WHERE project_id = ? AND result_content_version = ?')
      .get(project, version),
    'snapshot does not exist',
  );
  const table = family === 'requirement' ? 'requirement_revisions' : 'progress_record_revisions';
  const key = family === 'requirement' ? 'requirement_id' : 'record_id';
  return db
    .prepare(
      `WITH ranked AS (
    SELECT r.*, v.result_content_version AS content_version,
      row_number() OVER (PARTITION BY r.project_id, r.${key} ORDER BY v.result_content_version DESC) AS position
    FROM ${table} r JOIN write_operations v
      ON v.project_id = r.project_id AND v.id = r.operation_id
    WHERE r.project_id = ? AND v.result_content_version <= ?
  ) SELECT * FROM ranked WHERE position = 1 AND is_deleted = 0 ORDER BY ${key}`,
    )
    .all(project, version);
}

try {
  connect();
  db.exec(
    readFileSync(
      new URL('../docs/database/snapshot-coordination-draft.sql', import.meta.url),
      'utf8',
    ),
  );
  db.exec(fixtureSchema);
  addFixtureGuards();
  const first = createProject();
  const second = createProject();
  const p = first.project;
  verify(
    'initial version 0 includes project metadata revision 1, but no invented business content',
    () => {
      assert.equal(head(p), 0);
      assert.equal(receipt(p, first.operation).content_version, 0);
      assert.equal(snapshot(p, 0, 'requirement').length, 0);
      assert.equal(snapshot(p, 0, 'record').length, 0);
      assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
      assert(
        db
          .pragma('table_list')
          .filter((item) => item.name !== 'sqlite_schema' && item.name !== 'sqlite_temp_schema')
          .every((item) => item.strict === 1),
      );
    },
  );

  const req = randomUUID();
  const oldRecord = randomUUID();
  const newRecord = randomUUID();
  const initial = { id: randomUUID(), base: 0, request: 'Create requirement and first conclusion' };
  save(p, initial, (op) => {
    appendRequirement(p, req, op, first.source, 'Fixture initial requirement');
    appendRecord(p, oldRecord, op, first.source, req, 'Fixture original conclusion');
  });
  const batch = { id: randomUUID(), base: 1, request: 'Correct old record and add later decision' };
  const batchReceipt = save(p, batch, (op) => {
    appendRequirement(
      p,
      req,
      op,
      first.source,
      'Fixture agreed design',
      'ready_for_implementation',
    );
    appendRecord(p, oldRecord, op, first.source, req, 'Fixture corrected conclusion');
    appendRecord(p, newRecord, op, first.source, req, 'Fixture later decision');
    db.prepare('INSERT INTO record_revision_links VALUES (?, ?, 1, ?, 1)').run(
      p,
      newRecord,
      oldRecord,
    );
    db.prepare('INSERT INTO requirement_status_basis VALUES (?, ?, 2, ?, 1)').run(
      p,
      req,
      newRecord,
    );
  });
  verify('one save owns three revisions, one project version and one immutable receipt', () => {
    assert.equal(batchReceipt.changes.length, 3);
    assert.equal(batchReceipt.content_version, 2);
    assert.equal(head(p), 2);
    assert.equal(
      db.prepare('SELECT current_revision_no FROM projects WHERE id = ?').get(p)
        .current_revision_no,
      1,
    );
  });
  verify('as-of reads retain old content while current records appear once each', () => {
    assert.equal(snapshot(p, 1, 'requirement')[0].status, 'designing');
    assert.equal(snapshot(p, 1, 'record')[0].markdown, 'Fixture original conclusion');
    assert.equal(snapshot(p, 2, 'record').length, 2);
    assert.equal(
      snapshot(p, 2, 'record').find((row) => row.record_id === oldRecord).revision_no,
      2,
    );
  });
  verify('fixed old-record and same-batch status references target exact revisions', () => {
    const link = db
      .prepare(
        `SELECT r.markdown FROM record_revision_links l JOIN progress_record_revisions r
      ON r.project_id = l.project_id AND r.record_id = l.target_id AND r.revision_no = l.target_revision_no
      WHERE l.project_id = ?`,
      )
      .get(p);
    assert.equal(link.markdown, 'Fixture original conclusion');
    assert.equal(
      db
        .prepare('SELECT record_revision_no FROM requirement_status_basis WHERE project_id = ?')
        .get(p).record_revision_no,
      1,
    );
  });
  verify('version ordering does not depend on distinct timestamps', () => {
    assert.equal(
      db
        .prepare('SELECT count(DISTINCT saved_at) AS n FROM write_operations WHERE project_id = ?')
        .get(p).n,
      1,
    );
    assert.deepEqual(
      db
        .prepare(
          'SELECT result_content_version AS content_version FROM write_operations WHERE project_id = ? ORDER BY result_content_version',
        )
        .all(p)
        .map((row) => row.content_version),
      [0, 1, 2],
    );
  });

  const next = { id: randomUUID(), base: 2, request: 'Another correction' };
  const beforeWrite = snapshot(p, 1, 'requirement');
  save(p, next, (op) =>
    appendRecord(p, oldRecord, op, first.source, req, 'Fixture third revision'),
  );
  verify('separate download batches pinned to an old version do not mix in later commits', () => {
    assert.equal(beforeWrite[0].status, 'designing');
    assert.equal(snapshot(p, 1, 'record')[0].revision_no, 1);
    assert.equal(head(p), 3);
  });
  verify(
    'same operation retries return the original receipt before checking its stale base',
    () => {
      const counts = [count('write_operations'), count('progress_record_revisions')];
      assert.deepEqual(
        save(p, batch, () => assert.fail('retry must not execute changes')),
        batchReceipt,
      );
      assert.deepEqual([count('write_operations'), count('progress_record_revisions')], counts);
      assert.equal(head(p), 3);
    },
  );
  verify('same operation identity with another payload is rejected', () => {
    assert.throws(
      () => save(p, { ...batch, request: 'Different content' }, () => {}),
      /payload mismatch/,
    );
  });
  verify('new operations with stale bases cannot overwrite current content', () => {
    assert.throws(() => save(p, { ...batch, id: randomUUID() }, () => {}), /version conflict/);
    assert.equal(head(p), 3);
  });
  verify('missing project snapshots are errors, not aliases for latest', () => {
    assert.throws(() => snapshot(p, 999, 'record'), /does not exist/);
  });
  verify('sealed operations reject late revisions and newly captured evidence', () => {
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO requirement_revisions VALUES (?, ?, 3, ?, ?, ?, 0)')
          .run(p, req, batch.id, 'Late revision', 'designing'),
      /sealed/,
    );
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO sources VALUES (?, ?, ?, ?)')
          .run(p, randomUUID(), batch.id, 'Late evidence'),
      /sealed/,
    );
  });
  verify('sealed parent revisions reject late citations, record links and status evidence', () => {
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO requirement_revision_sources VALUES (?, ?, 2, ?)')
          .run(p, req, second.source),
      /sealed/,
    );
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO record_revision_links VALUES (?, ?, 1, ?, 2)')
          .run(p, newRecord, oldRecord),
      /sealed/,
    );
    assert.throws(
      () =>
        db
          .prepare('INSERT INTO requirement_status_basis VALUES (?, ?, 2, ?, 2)')
          .run(p, req, oldRecord),
      /sealed/,
    );
  });
  verify(
    'historical operations, versions, contents and relationships reject update and delete',
    () => {
      for (const table of [
        'write_operations',
        ...revisionFamilies.map(([name]) => name),
        'sources',
        'project_revision_sources',
        'requirement_revision_sources',
        'progress_record_revision_sources',
        'record_revision_links',
        'requirement_status_basis',
      ]) {
        assert.throws(() => db.exec(`DELETE FROM ${table}`), /append-only/);
      }
      assert.throws(
        () =>
          db
            .prepare('UPDATE progress_record_revisions SET markdown = ? WHERE project_id = ?')
            .run('Changed history', p),
        /append-only/,
      );
    },
  );
  verify(
    'cross-project references roll back operation, new identity, revisions and version together',
    () => {
      const badRecord = randomUUID();
      const opCount = count('write_operations');
      assert.throws(
        () =>
          save(
            second.project,
            { id: randomUUID(), base: 0, request: 'Invalid cross-project record' },
            (op) =>
              appendRecord(second.project, badRecord, op, second.source, req, 'Invalid fixture'),
          ),
        /FOREIGN KEY/,
      );
      assert.equal(count('write_operations'), opCount);
      assert.equal(head(second.project), 0);
      assert.equal(
        db
          .prepare('SELECT count(*) AS n FROM progress_records WHERE project_id = ?')
          .get(second.project).n,
        0,
      );
    },
  );
  verify('a revision without its final operation cannot commit', () => {
    const opCount = count('write_operations');
    assert.throws(
      () =>
        db
          .transaction(() =>
            appendRecord(p, oldRecord, randomUUID(), first.source, req, 'Uncommitted fixture'),
          )
          .immediate(),
      /FOREIGN KEY/,
    );
    assert.equal(count('write_operations'), opCount);
    assert.equal(head(p), 3);
  });
  verify(
    'missing deferred object heads roll back even after sealing and project-head movement',
    () => {
      const id = randomUUID();
      assert.throws(
        () =>
          db
            .transaction(() => {
              const op = randomUUID();

              db.prepare('INSERT INTO progress_records VALUES (?, ?, 99)').run(p, id);
              finish(p, op, 3, hash('dangling object head'));
            })
            .immediate(),
        /FOREIGN KEY/,
      );
      assert.equal(head(p), 3);
    },
  );
  verify('result versions are generated and cannot be independently supplied', () => {
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO write_operations
      (id, project_id, base_content_version, result_content_version, request_hash, entrypoint, actor_kind, actor_label, saved_at)
      VALUES (?, ?, 3, 999, ?, 'system', 'system', 'fixture', 1)`,
          )
          .run(randomUUID(), p, hash('wrong version')),
      /generated column/,
    );
  });
  verify('empty logical saves create neither an operation nor a project version', () => {
    const opCount = count('write_operations');
    assert.throws(
      () => save(p, { id: randomUUID(), base: 3, request: 'No changes' }, () => {}),
      /empty save/,
    );
    assert.equal(count('write_operations'), opCount);
    assert.equal(head(p), 3);
  });

  save(p, { id: randomUUID(), base: 3, request: 'Remove record' }, (op) =>
    appendRecord(p, oldRecord, op, first.source, req, 'Fixture third revision', 1),
  );
  verify(
    'as-of selection filters tombstones after ranking and does not resurrect older versions',
    () => {
      assert(!snapshot(p, 4, 'record').some((row) => row.record_id === oldRecord));
      assert(snapshot(p, 3, 'record').some((row) => row.record_id === oldRecord));
    },
  );
  save(p, { id: randomUUID(), base: 4, request: 'Restore original text' }, (op) =>
    appendRecord(p, oldRecord, op, first.source, req, 'Fixture original conclusion'),
  );
  verify(
    'restore appends another revision without rewriting deletion or the original record',
    () => {
      assert.equal(
        snapshot(p, 5, 'record').find((row) => row.record_id === oldRecord).revision_no,
        5,
      );
      assert(!snapshot(p, 4, 'record').some((row) => row.record_id === oldRecord));
      assert.equal(snapshot(p, 1, 'record')[0].markdown, 'Fixture original conclusion');
      assert.deepEqual(receipt(p, batch.id), batchReceipt);
    },
  );
  verify('head rollback is rejected; restoration cannot reset the project version', () => {
    assert.throws(
      () => db.prepare('UPDATE projects SET current_content_version = 2 WHERE id = ?').run(p),
      /next saved/,
    );
    assert.equal(head(p), 5);
  });
  verify('project-head finalization needs a save-service check beyond foreign keys', () => {
    assert.throws(
      () =>
        db
          .transaction(() => {
            const op = randomUUID();
            insertOperation(p, op, 5, hash('simulate forgotten head update'));

            assert.equal(head(p), 6, 'service final head check');
          })
          .immediate(),
      /service final head check/,
    );
    assert.equal(head(p), 5);
  });
  verify('original source text preserves leading whitespace and CRLF', () => {
    assert.equal(
      db
        .prepare('SELECT raw_text FROM sources WHERE project_id = ? AND id = ?')
        .get(p, first.source).raw_text,
      '  Explicitly fictional source.\r\nNo invented user history.',
    );
  });
  verify('another project has an independent version sequence', () => {
    assert.equal(head(second.project), 0);
    assert.equal(head(p), 5);
  });
  verify('an existing but stale object head is rejected by the save-service check', () => {
    const before = count('requirement_revisions');
    assert.throws(
      () =>
        save(
          p,
          { id: randomUUID(), base: 5, request: 'Simulate forgotten object head update' },
          (op) => {
            appendRequirement(p, req, op, first.source, 'Fixture fault injection');
            db.prepare(
              'UPDATE requirements SET current_revision_no = 2 WHERE project_id = ? AND id = ?',
            ).run(p, req);
          },
        ),
      /object head must match/,
    );
    assert.equal(head(p), 5);
    assert.equal(count('requirement_revisions'), before);
  });
  db.close();
  db = new Database(file);
  connect();
  verify('reopening the database retains the exact successful receipt and sealed history', () => {
    assert.deepEqual(receipt(p, batch.id), batchReceipt);
    assert.equal(head(p), 5);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  });
  verify(
    'a second WAL reader sees a complete old transaction until its read transaction ends',
    () => {
      const reader = new Database(file, { readonly: true });
      try {
        reader.exec('BEGIN');
        const readHead = () =>
          reader
            .prepare('SELECT current_content_version AS version FROM projects WHERE id = ?')
            .get(p).version;
        assert.equal(readHead(), 5);
        save(p, { id: randomUUID(), base: 5, request: 'Concurrent committed correction' }, (op) =>
          appendRecord(p, oldRecord, op, first.source, req, 'Fixture concurrent revision'),
        );
        assert.equal(head(p), 6);
        assert.equal(readHead(), 5);
        reader.exec('COMMIT');
        assert.equal(readHead(), 6);
        assert.deepEqual(receipt(p, batch.id), batchReceipt);
        assert.equal(snapshot(p, 1, 'record')[0].markdown, 'Fixture original conclusion');
      } finally {
        reader.close();
      }
    },
  );
  process.stdout.write(
    `${JSON.stringify({ scope: 'temporary coordination SQL experiment', checks: checks.length, passed: checks }, null, 2)}\n`,
  );
} finally {
  if (db.open) db.close();
  rmSync(directory, { recursive: true, force: true });
}
