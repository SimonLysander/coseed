import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

// Shared test fixture for the executable SQL proposals. Never imported by src/.
export const hash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const families = {
  project_revisions: ['project_id', 'projects'],
  overview_revisions: ['project_id', 'project_overviews'],
  business_entity_revisions: ['entity_id', 'business_entities'],
  business_relationship_revisions: ['relationship_id', 'business_relationships'],
  design_diagram_revisions: ['diagram_id', 'design_diagrams'],
  technical_note_revisions: ['note_id', 'technical_notes'],
};

export function withProposedDatabase(run, business = false) {
  const directory = mkdtempSync(join(tmpdir(), 'coseed-proposed-database-'));
  const file = join(directory, 'fixture.sqlite');
  const db = new Database(file);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    for (const name of [
      'snapshot-coordination-draft.sql',
      'schema-draft.sql',
      ...(business ? ['business-design-schema-draft.sql'] : []),
    ]) {
      db.exec(readFileSync(new URL(`../../docs/database/${name}`, import.meta.url), 'utf8'));
    }
    const head = (project) =>
      db
        .prepare('SELECT current_content_version AS version FROM projects WHERE id = ?')
        .get(project).version;
    const insertOperation = (project, id, base, fingerprint) =>
      db
        .prepare(
          `INSERT INTO write_operations
      (id, project_id, base_content_version, request_hash, entrypoint, actor_kind, actor_label, saved_at)
      VALUES (?, ?, ?, ?, 'system', 'system', 'Explicitly fictional SQL fixture', ?)`,
        )
        .run(id, project, base, fingerprint, Date.now());
    const source = (
      project,
      operation,
      raw = 'Explicitly fictional source, not real user history.',
    ) => {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO sources (id, project_id, captured_by_operation_id, kind, raw_text, content_hash)
        VALUES (?, ?, ?, 'document', ?, ?)`,
      ).run(id, project, operation, raw, hash(raw));
      return id;
    };
    const project = () => {
      const id = randomUUID();
      const op = randomUUID();
      let sourceId;
      db.transaction(() => {
        db.prepare('INSERT INTO projects VALUES (?, 1, 0, ?)').run(id, Date.now());
        sourceId = source(id, op);
        db.prepare(
          `INSERT INTO project_revisions (project_id, revision_no, operation_id, name)
          VALUES (?, 1, ?, 'Fictional project')`,
        ).run(id, op);
        db.prepare(
          `INSERT INTO project_revision_sources VALUES (?, 1, ?, 'after', '/name', 'Fixture project input')`,
        ).run(id, sourceId);
        db.prepare('INSERT INTO project_overviews VALUES (?, NULL)').run(id);
        insertOperation(id, op, null, hash(`create ${id}`));
      }).immediate();
      return { id, sourceId, operationId: op };
    };
    const checkHeads = (projectId) => {
      for (const [revisions, [key, identity]] of Object.entries(families)) {
        if (!business && revisions.startsWith('business_')) continue;
        if (
          !business &&
          ['design_diagram_revisions', 'technical_note_revisions'].includes(revisions)
        )
          continue;
        const singleton = key === 'project_id';
        const identityProject = identity === 'projects' ? 'i.id' : 'i.project_id';
        const match = singleton ? '' : `AND r.${key} = i.id`;
        const invalid = db
          .prepare(
            `SELECT 1 FROM ${identity} i WHERE ${identityProject} = ?
          AND i.current_revision_no IS NOT (SELECT max(r.revision_no) FROM ${revisions} r
            WHERE r.project_id = ${identityProject} ${match})`,
          )
          .get(projectId);
        assert(!invalid, `stale current pointer in ${identity}`);
      }
    };
    const save = (projectId, change, options = {}) =>
      db
        .transaction(() => {
          const id = options.id ?? randomUUID();
          const base = options.base ?? head(projectId);
          const fingerprint = hash(
            JSON.stringify({ projectId, base, request: options.request ?? id }),
          );
          const existing = db
            .prepare(
              'SELECT request_hash, result_content_version FROM write_operations WHERE project_id = ? AND id = ?',
            )
            .get(projectId, id);
          if (existing) {
            assert.equal(existing.request_hash, fingerprint, 'operation payload mismatch');
            return { id, base, version: existing.result_content_version };
          }
          assert.equal(base, head(projectId), 'project version conflict');
          change(id);
          checkHeads(projectId);
          options.validate?.(base + 1, id);
          insertOperation(projectId, id, base, fingerprint);
          const updated = db
            .prepare(
              'UPDATE projects SET current_content_version = ? WHERE id = ? AND current_content_version = ?',
            )
            .run(base + 1, projectId, base);
          assert.equal(updated.changes, 1);
          return { id, base, version: base + 1 };
        })
        .immediate();

    // This SQL is reused for parent/member reads so the number of queries does not
    // grow with the number of graph nodes. Table names are internal fixture constants.
    const selection = (table) => {
      const [key] = families[table] ?? [];
      assert(key, 'unknown fixture table');
      const removed = table === 'project_revisions' ? '' : 'AND is_deleted = 0';
      return `WITH ranked AS (
        SELECT r.*, row_number() OVER (PARTITION BY r.project_id, r.${key}
          ORDER BY CASE WHEN r.operation_id = @pending THEN @version ELSE o.result_content_version END DESC) AS position
        FROM ${table} r LEFT JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
        WHERE r.project_id = @project AND (o.result_content_version <= @version OR r.operation_id = @pending)
      ), selected AS (SELECT * FROM ranked WHERE position = 1 ${removed})`;
    };
    const parameters = (projectId, version, pending = null) => ({
      project: projectId,
      version,
      pending,
    });
    const rows = (table, projectId, version, pending = null) => {
      if (pending === null)
        assert(
          db
            .prepare(
              'SELECT 1 FROM write_operations WHERE project_id = ? AND result_content_version = ?',
            )
            .get(projectId, version),
          'snapshot does not exist',
        );
      return db
        .prepare(`${selection(table)} SELECT * FROM selected`)
        .all(parameters(projectId, version, pending));
    };
    const members = (table, parent, key, projectId, version, pending = null) =>
      db
        .prepare(
          `${selection(parent)}
      SELECT m.* FROM ${table} m JOIN selected p ON p.project_id = m.project_id
        AND p.${key} = m.${key} AND p.revision_no = m.revision_no`,
        )
        .all(parameters(projectId, version, pending));
    return run({ db, file, head, source, project, save, rows, members, insertOperation });
  } finally {
    if (db.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
