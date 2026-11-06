-- Design proposal only: not a runtime migration. Requires foreign_keys = ON.
-- Apply the complete file to an empty, disposable database for design verification.
-- Earlier common layer: projects/write_operations are superseded by the proposal
-- in snapshot-coordination-draft.sql. Merge definitions, do not concatenate them.

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  FOREIGN KEY (id, current_revision_no)
    REFERENCES project_revisions (project_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE write_operations (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  project_id TEXT NOT NULL REFERENCES projects (id),
  request_hash TEXT NOT NULL
    CHECK (length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  entrypoint TEXT NOT NULL CHECK (entrypoint IN ('web', 'mcp', 'cli', 'system')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('human', 'agent', 'system')),
  actor_label TEXT NOT NULL CHECK (length(trim(actor_label)) > 0),
  client_metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (CASE WHEN json_valid(client_metadata_json) THEN json_type(client_metadata_json) = 'object' ELSE 0 END),
  note_md TEXT,
  saved_at INTEGER NOT NULL CHECK (saved_at >= 0),
  UNIQUE (project_id, id)
) STRICT;
CREATE INDEX write_operations_project_time ON write_operations (project_id, saved_at DESC, id);

CREATE TABLE sources (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  project_id TEXT NOT NULL REFERENCES projects (id),
  captured_by_operation_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('conversation', 'manual_edit', 'code', 'verification', 'document')),
  raw_text TEXT NOT NULL CHECK (length(trim(raw_text)) > 0),
  content_hash TEXT NOT NULL
    CHECK (length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
  locator_json TEXT NOT NULL DEFAULT '{}'
    CHECK (CASE WHEN json_valid(locator_json) THEN json_type(locator_json) = 'object' ELSE 0 END),
  occurred_at INTEGER CHECK (occurred_at IS NULL OR occurred_at >= 0),
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id, captured_by_operation_id)
    REFERENCES write_operations (project_id, id)
) STRICT;
CREATE INDEX sources_capture ON sources (project_id, captured_by_operation_id);

CREATE TABLE project_revisions (
  project_id TEXT NOT NULL REFERENCES projects (id),
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  previous_revision_no INTEGER,
  operation_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  repository_locator_json TEXT
    CHECK (repository_locator_json IS NULL OR CASE WHEN json_valid(repository_locator_json) THEN json_type(repository_locator_json) = 'object' ELSE 0 END),
  PRIMARY KEY (project_id, revision_no),
  UNIQUE (project_id, operation_id),
  CHECK ((revision_no = 1 AND previous_revision_no IS NULL)
    OR (revision_no > 1 AND previous_revision_no IS NOT NULL AND previous_revision_no = revision_no - 1)),
  FOREIGN KEY (project_id, previous_revision_no)
    REFERENCES project_revisions (project_id, revision_no),
  FOREIGN KEY (project_id, operation_id)
    REFERENCES write_operations (project_id, id)
) STRICT;

CREATE TABLE project_overviews (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects (id),
  current_revision_no INTEGER CHECK (current_revision_no IS NULL OR current_revision_no >= 1),
  FOREIGN KEY (project_id, current_revision_no)
    REFERENCES overview_revisions (project_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE overview_revisions (
  project_id TEXT NOT NULL REFERENCES project_overviews (project_id),
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  previous_revision_no INTEGER,
  operation_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  content_json TEXT NOT NULL
    CHECK (CASE WHEN json_valid(content_json) THEN json_type(content_json) = 'object' ELSE 0 END),
  content_hash TEXT NOT NULL
    CHECK (length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (project_id, revision_no),
  UNIQUE (project_id, operation_id),
  CHECK ((revision_no = 1 AND previous_revision_no IS NULL)
    OR (revision_no > 1 AND previous_revision_no IS NOT NULL AND previous_revision_no = revision_no - 1)),
  FOREIGN KEY (project_id, previous_revision_no)
    REFERENCES overview_revisions (project_id, revision_no),
  FOREIGN KEY (project_id, operation_id)
    REFERENCES write_operations (project_id, id)
) STRICT;

CREATE TABLE project_revision_sources (
  project_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  target_side TEXT NOT NULL CHECK (target_side IN ('before', 'after')),
  target_path TEXT NOT NULL CHECK (target_path = '' OR substr(target_path, 1, 1) = '/'),
  explanation_md TEXT NOT NULL CHECK (length(trim(explanation_md)) > 0),
  PRIMARY KEY (project_id, revision_no, source_id, target_side, target_path),
  FOREIGN KEY (project_id, revision_no)
    REFERENCES project_revisions (project_id, revision_no),
  FOREIGN KEY (project_id, source_id) REFERENCES sources (project_id, id)
) STRICT;
CREATE INDEX project_sources_reverse ON project_revision_sources (project_id, source_id, revision_no);

CREATE TABLE overview_revision_sources (
  project_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  target_side TEXT NOT NULL CHECK (target_side IN ('before', 'after')),
  target_path TEXT NOT NULL CHECK (target_path = '' OR substr(target_path, 1, 1) = '/'),
  explanation_md TEXT NOT NULL CHECK (length(trim(explanation_md)) > 0),
  PRIMARY KEY (project_id, revision_no, source_id, target_side, target_path),
  FOREIGN KEY (project_id, revision_no)
    REFERENCES overview_revisions (project_id, revision_no),
  FOREIGN KEY (project_id, source_id) REFERENCES sources (project_id, id)
) STRICT;
CREATE INDEX overview_sources_reverse ON overview_revision_sources (project_id, source_id, revision_no);

-- Head movement is forward-only; restoring content creates another revision.
CREATE TRIGGER project_head_forward BEFORE UPDATE OF current_revision_no ON projects
WHEN NEW.current_revision_no != OLD.current_revision_no + 1
BEGIN SELECT RAISE(ABORT, 'project head must advance by one'); END;
CREATE TRIGGER overview_head_forward BEFORE UPDATE OF current_revision_no ON project_overviews
WHEN NEW.current_revision_no IS NOT coalesce(OLD.current_revision_no, 0) + 1
BEGIN SELECT RAISE(ABORT, 'overview head must advance by one'); END;
CREATE TRIGGER project_identity_immutable BEFORE UPDATE OF id, created_at ON projects
BEGIN SELECT RAISE(ABORT, 'project identity is immutable'); END;
CREATE TRIGGER overview_identity_immutable BEFORE UPDATE OF project_id ON project_overviews
BEGIN SELECT RAISE(ABORT, 'overview identity is immutable'); END;

CREATE TRIGGER write_operations_no_update BEFORE UPDATE ON write_operations
BEGIN SELECT RAISE(ABORT, 'write_operations is append-only'); END;

CREATE TRIGGER write_operations_no_delete BEFORE DELETE ON write_operations
BEGIN SELECT RAISE(ABORT, 'write_operations is append-only'); END;

CREATE TRIGGER sources_no_update BEFORE UPDATE ON sources
BEGIN SELECT RAISE(ABORT, 'sources is append-only'); END;

CREATE TRIGGER sources_no_delete BEFORE DELETE ON sources
BEGIN SELECT RAISE(ABORT, 'sources is append-only'); END;

CREATE TRIGGER project_revisions_no_update BEFORE UPDATE ON project_revisions
BEGIN SELECT RAISE(ABORT, 'project_revisions is append-only'); END;

CREATE TRIGGER project_revisions_no_delete BEFORE DELETE ON project_revisions
BEGIN SELECT RAISE(ABORT, 'project_revisions is append-only'); END;

CREATE TRIGGER overview_revisions_no_update BEFORE UPDATE ON overview_revisions
BEGIN SELECT RAISE(ABORT, 'overview_revisions is append-only'); END;

CREATE TRIGGER overview_revisions_no_delete BEFORE DELETE ON overview_revisions
BEGIN SELECT RAISE(ABORT, 'overview_revisions is append-only'); END;

CREATE TRIGGER project_revision_sources_no_update BEFORE UPDATE ON project_revision_sources
BEGIN SELECT RAISE(ABORT, 'project_revision_sources is append-only'); END;

CREATE TRIGGER project_revision_sources_no_delete BEFORE DELETE ON project_revision_sources
BEGIN SELECT RAISE(ABORT, 'project_revision_sources is append-only'); END;

CREATE TRIGGER overview_revision_sources_no_update BEFORE UPDATE ON overview_revision_sources
BEGIN SELECT RAISE(ABORT, 'overview_revision_sources is append-only'); END;

CREATE TRIGGER overview_revision_sources_no_delete BEFORE DELETE ON overview_revision_sources
BEGIN SELECT RAISE(ABORT, 'overview_revision_sources is append-only'); END;
