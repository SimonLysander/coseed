-- Common operation/version coordination. Applied first by the Drizzle migrator.
-- Operation rows are inserted LAST; child operation foreign keys must be deferred.
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
    REFERENCES write_operations (project_id, result_content_version)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

--> statement-breakpoint
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
  UNIQUE (project_id, result_content_version),
  FOREIGN KEY (project_id, base_content_version)
    REFERENCES write_operations (project_id, result_content_version)
) STRICT;

--> statement-breakpoint
CREATE INDEX write_operations_project_time
  ON write_operations (project_id, saved_at DESC, id);

--> statement-breakpoint
CREATE TRIGGER project_initial_version BEFORE INSERT ON projects
WHEN NEW.current_content_version != 0
BEGIN SELECT RAISE(ABORT, 'project must initialize at content version 0'); END;

--> statement-breakpoint
CREATE TRIGGER operation_base_current BEFORE INSERT ON write_operations
WHEN (
  NEW.base_content_version IS NULL AND EXISTS (
    SELECT 1 FROM write_operations WHERE project_id = NEW.project_id
  )
) OR (
  NEW.base_content_version IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM projects WHERE id = NEW.project_id
      AND current_content_version = NEW.base_content_version
  )
)
BEGIN SELECT RAISE(ABORT, 'project base version conflict'); END;

--> statement-breakpoint
-- A successful operation is the version anchor and seals its child rows.
-- Insert it after all revisions, sources and relations have been validated.
-- The save service then advances the head and checks it equals the maximum
-- successful result version before COMMIT; a foreign key does not perform UPDATE.
CREATE TRIGGER content_head_forward BEFORE UPDATE OF current_content_version ON projects
WHEN NEW.current_content_version != OLD.current_content_version + 1
  OR NOT EXISTS (
    SELECT 1 FROM write_operations WHERE project_id = NEW.id
      AND result_content_version = NEW.current_content_version
  )
BEGIN SELECT RAISE(ABORT, 'content head must advance to the next saved version'); END;

--> statement-breakpoint
CREATE TRIGGER project_identity_immutable BEFORE UPDATE OF id, created_at ON projects
BEGIN SELECT RAISE(ABORT, 'project identity is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER write_operations_no_update BEFORE UPDATE ON write_operations
BEGIN SELECT RAISE(ABORT, 'write_operations is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER write_operations_no_delete BEFORE DELETE ON write_operations
BEGIN SELECT RAISE(ABORT, 'write_operations is append-only'); END;

-- Each typed revision/source/member table also needs insert-after-operation guards.
-- Deferred child foreign keys allow content insertion before its operation row;
-- once that row exists, INSERT/UPDATE/DELETE must not alter the saved collection.
