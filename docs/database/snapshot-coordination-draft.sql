-- Coordination proposal, not a runtime migration.
-- Replaces the projects/write_operations definitions in schema-draft.sql;
-- do not concatenate both definitions. Typed module tables are separate.
-- Requires project_revisions(project_id, revision_no) before inserting data.
-- All connections must enable foreign_keys; save all rows in one transaction.

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  current_content_version INTEGER NOT NULL DEFAULT 0
    CHECK (current_content_version BETWEEN 0 AND 9007199254740991),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  FOREIGN KEY (id, current_revision_no)
    REFERENCES project_revisions (project_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (id, current_content_version)
    REFERENCES project_versions (project_id, content_version)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE write_operations (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  project_id TEXT NOT NULL REFERENCES projects (id),
  -- NULL is reserved for the initial project transaction, yielding version 0.
  base_content_version INTEGER
    CHECK (base_content_version IS NULL OR base_content_version BETWEEN 0 AND 9007199254740990),
  result_content_version INTEGER GENERATED ALWAYS AS
    (CASE WHEN base_content_version IS NULL THEN 0 ELSE base_content_version + 1 END) STORED,
  request_hash TEXT NOT NULL
    CHECK (length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  entrypoint TEXT NOT NULL CHECK (entrypoint IN ('web', 'mcp', 'cli', 'system')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('human', 'agent', 'system')),
  actor_label TEXT NOT NULL CHECK (length(trim(actor_label)) > 0),
  client_metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (CASE WHEN json_valid(client_metadata_json) THEN json_type(client_metadata_json) = 'object' ELSE 0 END),
  note_md TEXT,
  saved_at INTEGER NOT NULL CHECK (saved_at >= 0),
  UNIQUE (project_id, id),
  UNIQUE (project_id, id, result_content_version),
  FOREIGN KEY (project_id, base_content_version)
    REFERENCES project_versions (project_id, content_version),
  -- A persisted operation must have its matching sealed version by COMMIT.
  FOREIGN KEY (project_id, result_content_version, id)
    REFERENCES project_versions (project_id, content_version, operation_id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE project_versions (
  project_id TEXT NOT NULL REFERENCES projects (id),
  content_version INTEGER NOT NULL
    CHECK (content_version BETWEEN 0 AND 9007199254740991),
  operation_id TEXT NOT NULL,
  PRIMARY KEY (project_id, content_version),
  UNIQUE (project_id, operation_id),
  UNIQUE (project_id, content_version, operation_id),
  FOREIGN KEY (project_id, operation_id, content_version)
    REFERENCES write_operations (project_id, id, result_content_version)
) STRICT;

CREATE INDEX write_operations_project_time
  ON write_operations (project_id, saved_at DESC, id);

CREATE TRIGGER project_initial_version BEFORE INSERT ON projects
WHEN NEW.current_content_version != 0
BEGIN SELECT RAISE(ABORT, 'project must initialize at content version 0'); END;

CREATE TRIGGER operation_base_current BEFORE INSERT ON write_operations
WHEN (
  NEW.base_content_version IS NULL AND EXISTS (
    SELECT 1 FROM project_versions WHERE project_id = NEW.project_id
  )
) OR (
  NEW.base_content_version IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM projects WHERE id = NEW.project_id
      AND current_content_version = NEW.base_content_version
  )
)
BEGIN SELECT RAISE(ABORT, 'project base version conflict'); END;

-- Insert this row only after revisions, sources, members and citations are complete.
CREATE TRIGGER version_base_current BEFORE INSERT ON project_versions
WHEN NOT EXISTS (
  SELECT 1 FROM write_operations o JOIN projects p ON p.id = o.project_id
  WHERE o.project_id = NEW.project_id AND o.id = NEW.operation_id
    AND o.result_content_version = NEW.content_version
    AND (
      (o.base_content_version IS NULL AND NEW.content_version = 0
        AND p.current_content_version = 0)
      OR (o.base_content_version = p.current_content_version
        AND NEW.content_version = p.current_content_version + 1)
    )
)
BEGIN SELECT RAISE(ABORT, 'version does not match current operation'); END;

-- The common save service advances the head after sealing, before COMMIT, and
-- checks it equals the latest sealed version. This trigger only validates an
-- attempted movement; SQL foreign keys alone do not force that UPDATE to happen.
CREATE TRIGGER content_head_forward BEFORE UPDATE OF current_content_version ON projects
WHEN NEW.current_content_version != OLD.current_content_version + 1
  OR NOT EXISTS (
    SELECT 1 FROM project_versions WHERE project_id = NEW.id
      AND content_version = NEW.current_content_version
  )
BEGIN SELECT RAISE(ABORT, 'content head must advance to the next sealed version'); END;

CREATE TRIGGER project_identity_immutable BEFORE UPDATE OF id, created_at ON projects
BEGIN SELECT RAISE(ABORT, 'project identity is immutable'); END;

CREATE TRIGGER write_operations_no_update BEFORE UPDATE ON write_operations
BEGIN SELECT RAISE(ABORT, 'write_operations is append-only'); END;
CREATE TRIGGER write_operations_no_delete BEFORE DELETE ON write_operations
BEGIN SELECT RAISE(ABORT, 'write_operations is append-only'); END;
CREATE TRIGGER project_versions_no_update BEFORE UPDATE ON project_versions
BEGIN SELECT RAISE(ABORT, 'project_versions is append-only'); END;
CREATE TRIGGER project_versions_no_delete BEFORE DELETE ON project_versions
BEGIN SELECT RAISE(ABORT, 'project_versions is append-only'); END;

-- Each typed revision/source/member table also needs insert-after-seal guards.
-- The verification fixture demonstrates them; they must be included when composing
-- the complete module schema, not assumed to be supplied by this three-table file.
