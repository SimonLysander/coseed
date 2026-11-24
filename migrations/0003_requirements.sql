-- Initial requirement progression, retrospective and typed association storage.
CREATE TABLE requirements (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  project_id TEXT NOT NULL REFERENCES projects(id),
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE(project_id, id),
  FOREIGN KEY(project_id, id, current_revision_no)
    REFERENCES requirement_revisions(project_id, requirement_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

--> statement-breakpoint
CREATE TABLE requirement_revisions (
  project_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  operation_id TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  markdown TEXT NOT NULL CHECK (length(trim(markdown)) > 0),
  status TEXT NOT NULL CHECK (status IN ('designing','ready_for_implementation','pending_acceptance','completed','on_hold','cancelled')),
  status_change_kind TEXT CHECK (status_change_kind IS NULL OR status_change_kind IN ('initial','progress','correction')),
  status_change_reason_md TEXT,
  CHECK ((status_change_kind IS NULL AND status_change_reason_md IS NULL) OR
    (status_change_kind IS NOT NULL AND status_change_reason_md IS NOT NULL AND length(trim(status_change_reason_md)) > 0)),
  PRIMARY KEY(project_id, requirement_id, revision_no),
  UNIQUE(project_id, requirement_id, operation_id),
  FOREIGN KEY(project_id, requirement_id) REFERENCES requirements(project_id,id),
  FOREIGN KEY(project_id, operation_id) REFERENCES write_operations(project_id,id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

--> statement-breakpoint
CREATE INDEX requirement_revisions_operation ON requirement_revisions(project_id,operation_id);

--> statement-breakpoint
CREATE TABLE requirement_revision_sources (
  project_id TEXT NOT NULL, requirement_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  target_side TEXT NOT NULL CHECK(target_side IN ('before','after')),
  target_path TEXT NOT NULL CHECK(target_path = '' OR substr(target_path,1,1) = '/'),
  explanation_md TEXT NOT NULL CHECK(length(trim(explanation_md)) > 0),
  PRIMARY KEY(project_id,requirement_id,revision_no,source_id,target_side,target_path),
  FOREIGN KEY(project_id,requirement_id,revision_no) REFERENCES requirement_revisions(project_id,requirement_id,revision_no),
  FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id)
) STRICT;

--> statement-breakpoint
CREATE INDEX requirement_sources_reverse ON requirement_revision_sources(project_id,source_id,requirement_id,revision_no);

--> statement-breakpoint
CREATE TABLE progress_records (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  project_id TEXT NOT NULL REFERENCES projects(id),
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE(project_id, id),
  FOREIGN KEY(project_id, id, current_revision_no)
    REFERENCES progress_record_revisions(project_id, progress_record_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

--> statement-breakpoint
CREATE TABLE progress_record_revisions (
  project_id TEXT NOT NULL,
  progress_record_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  operation_id TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  requirement_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  markdown TEXT NOT NULL CHECK (length(trim(markdown)) > 0),
  occurred_at INTEGER CHECK (occurred_at IS NULL OR occurred_at >= 0),
  capture_ordinal INTEGER CHECK (capture_ordinal IS NULL OR capture_ordinal >= 0),
  CHECK ((revision_no = 1 AND capture_ordinal IS NOT NULL) OR (revision_no > 1 AND capture_ordinal IS NULL)),
  UNIQUE(project_id, operation_id, capture_ordinal),
  UNIQUE(project_id, progress_record_id, revision_no, requirement_id),
  FOREIGN KEY(project_id, requirement_id) REFERENCES requirements(project_id,id),
  PRIMARY KEY(project_id, progress_record_id, revision_no),
  UNIQUE(project_id, progress_record_id, operation_id),
  FOREIGN KEY(project_id, progress_record_id) REFERENCES progress_records(project_id,id),
  FOREIGN KEY(project_id, operation_id) REFERENCES write_operations(project_id,id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

--> statement-breakpoint
CREATE INDEX progress_record_revisions_operation ON progress_record_revisions(project_id,operation_id);

--> statement-breakpoint
CREATE TABLE progress_record_revision_sources (
  project_id TEXT NOT NULL, progress_record_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  target_side TEXT NOT NULL CHECK(target_side IN ('before','after')),
  target_path TEXT NOT NULL CHECK(target_path = '' OR substr(target_path,1,1) = '/'),
  explanation_md TEXT NOT NULL CHECK(length(trim(explanation_md)) > 0),
  PRIMARY KEY(project_id,progress_record_id,revision_no,source_id,target_side,target_path),
  FOREIGN KEY(project_id,progress_record_id,revision_no) REFERENCES progress_record_revisions(project_id,progress_record_id,revision_no),
  FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id)
) STRICT;

--> statement-breakpoint
CREATE INDEX progress_record_sources_reverse ON progress_record_revision_sources(project_id,source_id,progress_record_id,revision_no);

--> statement-breakpoint
CREATE TABLE retrospectives (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  project_id TEXT NOT NULL REFERENCES projects(id),
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE(project_id, id),
  FOREIGN KEY(project_id, id, current_revision_no)
    REFERENCES retrospective_revisions(project_id, retrospective_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

--> statement-breakpoint
CREATE TABLE retrospective_revisions (
  project_id TEXT NOT NULL,
  retrospective_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  operation_id TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  scope_md TEXT NOT NULL CHECK (length(trim(scope_md)) > 0),
  summary_md TEXT NOT NULL CHECK (length(trim(summary_md)) > 0),
  PRIMARY KEY(project_id, retrospective_id, revision_no),
  UNIQUE(project_id, retrospective_id, operation_id),
  FOREIGN KEY(project_id, retrospective_id) REFERENCES retrospectives(project_id,id),
  FOREIGN KEY(project_id, operation_id) REFERENCES write_operations(project_id,id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

--> statement-breakpoint
CREATE INDEX retrospective_revisions_operation ON retrospective_revisions(project_id,operation_id);

--> statement-breakpoint
CREATE TABLE retrospective_revision_sources (
  project_id TEXT NOT NULL, retrospective_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  target_side TEXT NOT NULL CHECK(target_side IN ('before','after')),
  target_path TEXT NOT NULL CHECK(target_path = '' OR substr(target_path,1,1) = '/'),
  explanation_md TEXT NOT NULL CHECK(length(trim(explanation_md)) > 0),
  PRIMARY KEY(project_id,retrospective_id,revision_no,source_id,target_side,target_path),
  FOREIGN KEY(project_id,retrospective_id,revision_no) REFERENCES retrospective_revisions(project_id,retrospective_id,revision_no),
  FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id)
) STRICT;

--> statement-breakpoint
CREATE INDEX retrospective_sources_reverse ON retrospective_revision_sources(project_id,source_id,retrospective_id,revision_no);

--> statement-breakpoint
CREATE TABLE requirement_revision_status_records (
  project_id TEXT NOT NULL, requirement_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  record_id TEXT NOT NULL, record_revision_no INTEGER NOT NULL,
  PRIMARY KEY(project_id,requirement_id,revision_no,record_id),
  FOREIGN KEY(project_id,requirement_id,revision_no) REFERENCES requirement_revisions(project_id,requirement_id,revision_no),
  FOREIGN KEY(project_id,record_id,record_revision_no,requirement_id)
    REFERENCES progress_record_revisions(project_id,progress_record_id,revision_no,requirement_id)
) STRICT;

--> statement-breakpoint
CREATE TABLE retrospective_revision_inputs (
  project_id TEXT NOT NULL, retrospective_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  PRIMARY KEY(project_id,retrospective_id,revision_no,source_id),
  FOREIGN KEY(project_id,retrospective_id,revision_no) REFERENCES retrospective_revisions(project_id,retrospective_id,revision_no),
  FOREIGN KEY(project_id,source_id) REFERENCES sources(project_id,id)
) STRICT;

--> statement-breakpoint
CREATE TABLE retrospective_operations (
  project_id TEXT NOT NULL, operation_id TEXT NOT NULL, retrospective_id TEXT NOT NULL,
  PRIMARY KEY(project_id,operation_id),
  FOREIGN KEY(project_id,operation_id) REFERENCES write_operations(project_id,id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(project_id,retrospective_id) REFERENCES retrospectives(project_id,id)
) STRICT;

--> statement-breakpoint
CREATE INDEX retrospective_operation_lookup ON retrospective_operations(project_id,retrospective_id,operation_id);

--> statement-breakpoint
CREATE TABLE requirement_revision_links (
  project_id TEXT NOT NULL, requirement_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  overview_id TEXT CHECK(overview_id IS NULL OR overview_id = project_id), overview_part TEXT, overview_part_id TEXT,
  entity_id TEXT, relationship_id TEXT, diagram_id TEXT, note_id TEXT,
  explanation_md TEXT NOT NULL CHECK(length(trim(explanation_md)) > 0),
  PRIMARY KEY(project_id,requirement_id,revision_no,position),
  CHECK((overview_id IS NOT NULL) + (entity_id IS NOT NULL) + (relationship_id IS NOT NULL) + (diagram_id IS NOT NULL) + (note_id IS NOT NULL) = 1),
  CHECK((overview_id IS NULL AND overview_part IS NULL AND overview_part_id IS NULL) OR (overview_id IS NOT NULL AND overview_part IS NOT NULL)),
  FOREIGN KEY(project_id,requirement_id,revision_no) REFERENCES requirement_revisions(project_id,requirement_id,revision_no),
  FOREIGN KEY(overview_id) REFERENCES project_overviews(project_id),
  FOREIGN KEY(project_id,entity_id) REFERENCES business_entities(project_id,id),
  FOREIGN KEY(project_id,relationship_id) REFERENCES business_relationships(project_id,id),
  FOREIGN KEY(project_id,diagram_id) REFERENCES design_diagrams(project_id,id),
  FOREIGN KEY(project_id,note_id) REFERENCES technical_notes(project_id,id)
) STRICT;

--> statement-breakpoint
CREATE TABLE progress_record_revision_links (
  project_id TEXT NOT NULL, progress_record_id TEXT NOT NULL, revision_no INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  target_record_id TEXT, target_record_revision_no INTEGER,
  overview_revision_no INTEGER, overview_part TEXT, overview_part_id TEXT,
  entity_id TEXT, entity_revision_no INTEGER,
  relationship_id TEXT, relationship_revision_no INTEGER,
  diagram_id TEXT, diagram_project_version INTEGER,
  note_id TEXT, note_revision_no INTEGER,
  explanation_md TEXT NOT NULL CHECK(length(trim(explanation_md)) > 0),
  PRIMARY KEY(project_id,progress_record_id,revision_no,position),
  CHECK((target_record_id IS NOT NULL) + (overview_revision_no IS NOT NULL) + (entity_id IS NOT NULL) + (relationship_id IS NOT NULL) + (diagram_id IS NOT NULL) + (note_id IS NOT NULL) = 1),
  CHECK((target_record_id IS NULL) = (target_record_revision_no IS NULL)),
  CHECK((entity_id IS NULL) = (entity_revision_no IS NULL)),
  CHECK((relationship_id IS NULL) = (relationship_revision_no IS NULL)),
  CHECK((diagram_id IS NULL) = (diagram_project_version IS NULL)),
  CHECK((note_id IS NULL) = (note_revision_no IS NULL)),
  CHECK((overview_revision_no IS NULL AND overview_part IS NULL AND overview_part_id IS NULL) OR (overview_revision_no IS NOT NULL AND overview_part IS NOT NULL)),
  FOREIGN KEY(project_id,progress_record_id,revision_no) REFERENCES progress_record_revisions(project_id,progress_record_id,revision_no),
  FOREIGN KEY(project_id,target_record_id,target_record_revision_no) REFERENCES progress_record_revisions(project_id,progress_record_id,revision_no),
  FOREIGN KEY(project_id,overview_revision_no) REFERENCES overview_revisions(project_id,revision_no),
  FOREIGN KEY(project_id,entity_id,entity_revision_no) REFERENCES business_entity_revisions(project_id,entity_id,revision_no),
  FOREIGN KEY(project_id,relationship_id,relationship_revision_no) REFERENCES business_relationship_revisions(project_id,relationship_id,revision_no),
  FOREIGN KEY(project_id,diagram_id) REFERENCES design_diagrams(project_id,id),
  FOREIGN KEY(project_id,diagram_project_version) REFERENCES write_operations(project_id,result_content_version) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(project_id,note_id,note_revision_no) REFERENCES technical_note_revisions(project_id,note_id,revision_no)
) STRICT;

--> statement-breakpoint
CREATE INDEX requirement_revision_links_entity_id ON requirement_revision_links(project_id,entity_id);

--> statement-breakpoint
CREATE INDEX requirement_revision_links_relationship_id ON requirement_revision_links(project_id,relationship_id);

--> statement-breakpoint
CREATE INDEX requirement_revision_links_diagram_id ON requirement_revision_links(project_id,diagram_id);

--> statement-breakpoint
CREATE INDEX requirement_revision_links_note_id ON requirement_revision_links(project_id,note_id);

--> statement-breakpoint
CREATE INDEX progress_record_revision_links_entity_id ON progress_record_revision_links(project_id,entity_id);

--> statement-breakpoint
CREATE INDEX progress_record_revision_links_relationship_id ON progress_record_revision_links(project_id,relationship_id);

--> statement-breakpoint
CREATE INDEX progress_record_revision_links_diagram_id ON progress_record_revision_links(project_id,diagram_id);

--> statement-breakpoint
CREATE INDEX progress_record_revision_links_note_id ON progress_record_revision_links(project_id,note_id);

--> statement-breakpoint
CREATE TRIGGER requirements_identity_immutable BEFORE UPDATE OF id,project_id,created_at ON requirements
BEGIN SELECT RAISE(ABORT,'identity is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER requirements_head_forward BEFORE UPDATE OF current_revision_no ON requirements
WHEN NEW.current_revision_no <= OLD.current_revision_no
BEGIN SELECT RAISE(ABORT,'head must move forward'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revisions_closed BEFORE INSERT ON requirement_revisions
WHEN EXISTS(SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT,'operation is closed'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revisions_no_update BEFORE UPDATE ON requirement_revisions
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revisions_no_delete BEFORE DELETE ON requirement_revisions
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER progress_records_identity_immutable BEFORE UPDATE OF id,project_id,created_at ON progress_records
BEGIN SELECT RAISE(ABORT,'identity is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER progress_records_head_forward BEFORE UPDATE OF current_revision_no ON progress_records
WHEN NEW.current_revision_no <= OLD.current_revision_no
BEGIN SELECT RAISE(ABORT,'head must move forward'); END;

--> statement-breakpoint
CREATE TRIGGER progress_record_revisions_closed BEFORE INSERT ON progress_record_revisions
WHEN EXISTS(SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT,'operation is closed'); END;

--> statement-breakpoint
CREATE TRIGGER progress_record_revisions_no_update BEFORE UPDATE ON progress_record_revisions
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER progress_record_revisions_no_delete BEFORE DELETE ON progress_record_revisions
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER retrospectives_identity_immutable BEFORE UPDATE OF id,project_id,created_at ON retrospectives
BEGIN SELECT RAISE(ABORT,'identity is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER retrospectives_head_forward BEFORE UPDATE OF current_revision_no ON retrospectives
WHEN NEW.current_revision_no <= OLD.current_revision_no
BEGIN SELECT RAISE(ABORT,'head must move forward'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_revisions_closed BEFORE INSERT ON retrospective_revisions
WHEN EXISTS(SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT,'operation is closed'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_revisions_no_update BEFORE UPDATE ON retrospective_revisions
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_revisions_no_delete BEFORE DELETE ON retrospective_revisions
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revision_sources_closed BEFORE INSERT ON requirement_revision_sources
WHEN EXISTS(SELECT 1 FROM requirement_revisions r JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.requirement_id = NEW.requirement_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT,'revision is closed'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revision_sources_no_update BEFORE UPDATE ON requirement_revision_sources
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revision_sources_no_delete BEFORE DELETE ON requirement_revision_sources
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER progress_record_revision_sources_closed BEFORE INSERT ON progress_record_revision_sources
WHEN EXISTS(SELECT 1 FROM progress_record_revisions r JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.progress_record_id = NEW.progress_record_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT,'revision is closed'); END;

--> statement-breakpoint
CREATE TRIGGER progress_record_revision_sources_no_update BEFORE UPDATE ON progress_record_revision_sources
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER progress_record_revision_sources_no_delete BEFORE DELETE ON progress_record_revision_sources
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_revision_sources_closed BEFORE INSERT ON retrospective_revision_sources
WHEN EXISTS(SELECT 1 FROM retrospective_revisions r JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.retrospective_id = NEW.retrospective_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT,'revision is closed'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_revision_sources_no_update BEFORE UPDATE ON retrospective_revision_sources
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_revision_sources_no_delete BEFORE DELETE ON retrospective_revision_sources
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revision_status_records_closed BEFORE INSERT ON requirement_revision_status_records
WHEN EXISTS(SELECT 1 FROM requirement_revisions r JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.requirement_id = NEW.requirement_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT,'revision is closed'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revision_status_records_no_update BEFORE UPDATE ON requirement_revision_status_records
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revision_status_records_no_delete BEFORE DELETE ON requirement_revision_status_records
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_revision_inputs_closed BEFORE INSERT ON retrospective_revision_inputs
WHEN EXISTS(SELECT 1 FROM retrospective_revisions r JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.retrospective_id = NEW.retrospective_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT,'revision is closed'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_revision_inputs_no_update BEFORE UPDATE ON retrospective_revision_inputs
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_revision_inputs_no_delete BEFORE DELETE ON retrospective_revision_inputs
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revision_links_closed BEFORE INSERT ON requirement_revision_links
WHEN EXISTS(SELECT 1 FROM requirement_revisions r JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.requirement_id = NEW.requirement_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT,'revision is closed'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revision_links_no_update BEFORE UPDATE ON requirement_revision_links
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER requirement_revision_links_no_delete BEFORE DELETE ON requirement_revision_links
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER progress_record_revision_links_closed BEFORE INSERT ON progress_record_revision_links
WHEN EXISTS(SELECT 1 FROM progress_record_revisions r JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.progress_record_id = NEW.progress_record_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT,'revision is closed'); END;

--> statement-breakpoint
CREATE TRIGGER progress_record_revision_links_no_update BEFORE UPDATE ON progress_record_revision_links
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER progress_record_revision_links_no_delete BEFORE DELETE ON progress_record_revision_links
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_operations_closed BEFORE INSERT ON retrospective_operations
WHEN EXISTS(SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT,'operation is closed'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_operations_no_update BEFORE UPDATE ON retrospective_operations
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER retrospective_operations_no_delete BEFORE DELETE ON retrospective_operations
BEGIN SELECT RAISE(ABORT,'history is append-only'); END;
