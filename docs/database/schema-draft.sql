-- Proposal only, not a runtime migration. Load snapshot-coordination-draft.sql first.
-- This file defines project metadata, overview content and shared source tables.
-- The common projects/write_operations definitions have one authority in that file.

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
    DEFERRABLE INITIALLY DEFERRED
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
    DEFERRABLE INITIALLY DEFERRED
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
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
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
    DEFERRABLE INITIALLY DEFERRED
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
CREATE TRIGGER overview_identity_immutable BEFORE UPDATE OF project_id ON project_overviews
BEGIN SELECT RAISE(ABORT, 'overview identity is immutable'); END;

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

CREATE TRIGGER sources_operation_closed BEFORE INSERT ON sources
WHEN EXISTS (SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.captured_by_operation_id)
BEGIN SELECT RAISE(ABORT, 'operation is closed'); END;

CREATE TRIGGER project_revisions_operation_closed BEFORE INSERT ON project_revisions
WHEN EXISTS (SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT, 'operation is closed'); END;

CREATE TRIGGER overview_revisions_operation_closed BEFORE INSERT ON overview_revisions
WHEN EXISTS (SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT, 'operation is closed'); END;

CREATE TRIGGER project_revision_sources_revision_closed BEFORE INSERT ON project_revision_sources
WHEN EXISTS (SELECT 1 FROM project_revisions r JOIN write_operations o
  ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT, 'revision is closed'); END;

CREATE TRIGGER overview_revision_sources_revision_closed BEFORE INSERT ON overview_revision_sources
WHEN EXISTS (SELECT 1 FROM overview_revisions r JOIN write_operations o
  ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT, 'revision is closed'); END;

CREATE INDEX project_revisions_operation ON project_revisions(project_id, operation_id);
CREATE INDEX overview_revisions_operation ON overview_revisions(project_id, operation_id);
