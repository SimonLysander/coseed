-- Proposal only; load snapshot-coordination-draft.sql and schema-draft.sql first.
-- Not a runtime migration. Operation foreign keys are deferred: save operation LAST.
-- Graph members and owners use stable IDs, resolved at one project snapshot.
-- Content Schema validates the complete candidate snapshot before operation insertion.

CREATE TABLE business_entities (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  project_id TEXT NOT NULL REFERENCES projects (id),
  kind TEXT NOT NULL CHECK (kind IN ('module', 'component', 'data_object', 'external_system')),
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE (project_id, id),
  UNIQUE (project_id, id, kind),
  FOREIGN KEY (project_id, id, current_revision_no)
    REFERENCES business_entity_revisions (project_id, entity_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE business_relationships (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  project_id TEXT NOT NULL REFERENCES projects (id),
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id, id, current_revision_no)
    REFERENCES business_relationship_revisions (project_id, relationship_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE design_diagrams (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  project_id TEXT NOT NULL REFERENCES projects (id),
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id, id, current_revision_no)
    REFERENCES design_diagram_revisions (project_id, diagram_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE technical_notes (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
  project_id TEXT NOT NULL REFERENCES projects (id),
  current_revision_no INTEGER NOT NULL CHECK (current_revision_no >= 1),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id, id, current_revision_no)
    REFERENCES technical_note_revisions (project_id, note_id, revision_no)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE INDEX business_entities_project_kind ON business_entities (project_id, kind, id);

CREATE TABLE business_entity_revisions (
  project_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  operation_id TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  content_json TEXT NOT NULL CHECK (CASE WHEN json_valid(content_json) THEN json_type(content_json) = 'object' ELSE 0 END),
  kind TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.kind')) STORED NOT NULL
    CHECK (kind IN ('module', 'component', 'data_object', 'external_system')),
  name TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.name')) STORED NOT NULL CHECK (length(trim(name)) > 0),
  summary TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.summary')) STORED NOT NULL CHECK (length(trim(summary)) > 0),
  owner_entity_id TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.owner.id')) STORED,
  owner_kind TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.owner.kind')) STORED,
  primary_source_id TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.primarySourceId')) STORED,
  type_source_id TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.typeSourceId')) STORED,
  PRIMARY KEY (project_id, entity_id, revision_no),
  UNIQUE (project_id, entity_id, operation_id),
  CHECK ((kind IN ('module', 'external_system') AND owner_entity_id IS NULL AND owner_kind IS NULL)
    OR (kind IN ('component', 'data_object') AND owner_entity_id IS NOT NULL AND owner_kind IS NOT NULL
      AND owner_kind IN ('module', 'external_system'))),
  CHECK (kind != 'data_object' OR coalesce(length(trim(json_extract(content_json, '$.typeName'))) > 0
    AND length(trim(json_extract(content_json, '$.typeScript'))) > 0, 0)),
  FOREIGN KEY (project_id, entity_id, kind) REFERENCES business_entities (project_id, id, kind),
  FOREIGN KEY (project_id, owner_entity_id, owner_kind) REFERENCES business_entities (project_id, id, kind),
  FOREIGN KEY (project_id, primary_source_id) REFERENCES sources (project_id, id),
  FOREIGN KEY (project_id, type_source_id) REFERENCES sources (project_id, id),
  FOREIGN KEY (project_id, operation_id) REFERENCES write_operations (project_id, id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE INDEX business_entities_owner ON business_entity_revisions (project_id, owner_entity_id, entity_id, revision_no);

CREATE TABLE business_relationship_revisions (
  project_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  operation_id TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  content_json TEXT NOT NULL CHECK (CASE WHEN json_valid(content_json) THEN json_type(content_json) = 'object' ELSE 0 END),
  kind TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.kind')) STORED NOT NULL
    CHECK (kind IN ('functional_dependency', 'module_association', 'call', 'read', 'write', 'object_association', 'event')),
  source_entity_id TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.sourceId')) STORED NOT NULL,
  target_entity_id TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.targetId')) STORED NOT NULL,
  summary TEXT GENERATED ALWAYS AS (json_extract(content_json, '$.summary')) STORED NOT NULL CHECK (length(trim(summary)) > 0),
  PRIMARY KEY (project_id, relationship_id, revision_no),
  UNIQUE (project_id, relationship_id, operation_id),
  CHECK (source_entity_id != target_entity_id OR kind = 'object_association'),
  FOREIGN KEY (project_id, relationship_id) REFERENCES business_relationships (project_id, id),
  FOREIGN KEY (project_id, source_entity_id) REFERENCES business_entities (project_id, id),
  FOREIGN KEY (project_id, target_entity_id) REFERENCES business_entities (project_id, id),
  FOREIGN KEY (project_id, operation_id) REFERENCES write_operations (project_id, id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE INDEX business_relationships_source ON business_relationship_revisions (project_id, source_entity_id, relationship_id, revision_no);
CREATE INDEX business_relationships_target ON business_relationship_revisions (project_id, target_entity_id, relationship_id, revision_no);

CREATE TABLE design_diagram_revisions (
  project_id TEXT NOT NULL,
  diagram_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  operation_id TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('project', 'module')),
  scope_module_id TEXT,
  PRIMARY KEY (project_id, diagram_id, revision_no),
  UNIQUE (project_id, diagram_id, operation_id),
  CHECK ((scope_kind = 'project' AND scope_module_id IS NULL)
    OR (scope_kind = 'module' AND scope_module_id IS NOT NULL)),
  FOREIGN KEY (project_id, diagram_id) REFERENCES design_diagrams (project_id, id),
  FOREIGN KEY (project_id, scope_module_id) REFERENCES business_entities (project_id, id),
  FOREIGN KEY (project_id, operation_id) REFERENCES write_operations (project_id, id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE INDEX design_diagrams_module ON design_diagram_revisions (project_id, scope_module_id, diagram_id, revision_no);

CREATE TABLE technical_note_revisions (
  project_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  operation_id TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  problem_md TEXT NOT NULL CHECK (length(trim(problem_md)) > 0),
  PRIMARY KEY (project_id, note_id, revision_no),
  UNIQUE (project_id, note_id, operation_id),
  FOREIGN KEY (project_id, note_id) REFERENCES technical_notes (project_id, id),
  FOREIGN KEY (project_id, operation_id) REFERENCES write_operations (project_id, id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE technical_note_revision_entities (
  project_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY (project_id, note_id, revision_no, entity_id),
  FOREIGN KEY (project_id, note_id, revision_no) REFERENCES technical_note_revisions (project_id, note_id, revision_no),
  FOREIGN KEY (project_id, entity_id) REFERENCES business_entities (project_id, id)
) STRICT;
CREATE INDEX technical_notes_entity ON technical_note_revision_entities (project_id, entity_id, note_id, revision_no);

CREATE TABLE diagram_revision_entities (
  project_id TEXT NOT NULL,
  diagram_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY (project_id, diagram_id, revision_no, entity_id),
  FOREIGN KEY (project_id, diagram_id, revision_no) REFERENCES design_diagram_revisions (project_id, diagram_id, revision_no),
  FOREIGN KEY (project_id, entity_id) REFERENCES business_entities (project_id, id)
) STRICT;
CREATE INDEX diagram_entities_reverse ON diagram_revision_entities (project_id, entity_id, diagram_id, revision_no);

CREATE TABLE diagram_revision_relationships (
  project_id TEXT NOT NULL,
  diagram_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  relationship_id TEXT NOT NULL,
  PRIMARY KEY (project_id, diagram_id, revision_no, relationship_id),
  FOREIGN KEY (project_id, diagram_id, revision_no) REFERENCES design_diagram_revisions (project_id, diagram_id, revision_no),
  FOREIGN KEY (project_id, relationship_id) REFERENCES business_relationships (project_id, id)
) STRICT;
CREATE INDEX diagram_relationships_reverse ON diagram_revision_relationships (project_id, relationship_id, diagram_id, revision_no);

CREATE TABLE diagram_revision_notes (
  project_id TEXT NOT NULL,
  diagram_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  note_id TEXT NOT NULL,
  PRIMARY KEY (project_id, diagram_id, revision_no, note_id),
  FOREIGN KEY (project_id, diagram_id, revision_no) REFERENCES design_diagram_revisions (project_id, diagram_id, revision_no),
  FOREIGN KEY (project_id, note_id) REFERENCES technical_notes (project_id, id)
) STRICT;
CREATE INDEX diagram_notes_reverse ON diagram_revision_notes (project_id, note_id, diagram_id, revision_no);

CREATE TABLE business_entity_revision_sources (
  project_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  target_side TEXT NOT NULL CHECK (target_side IN ('before', 'after')),
  target_path TEXT NOT NULL CHECK (target_path = '' OR substr(target_path, 1, 1) = '/'),
  explanation_md TEXT NOT NULL CHECK (length(trim(explanation_md)) > 0),
  PRIMARY KEY (project_id, entity_id, revision_no, source_id, target_side, target_path),
  FOREIGN KEY (project_id, entity_id, revision_no) REFERENCES business_entity_revisions (project_id, entity_id, revision_no),
  FOREIGN KEY (project_id, source_id) REFERENCES sources (project_id, id)
) STRICT;
CREATE INDEX business_entity_revision_sources_reverse ON business_entity_revision_sources (project_id, source_id, entity_id, revision_no);

CREATE TABLE business_relationship_revision_sources (
  project_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  target_side TEXT NOT NULL CHECK (target_side IN ('before', 'after')),
  target_path TEXT NOT NULL CHECK (target_path = '' OR substr(target_path, 1, 1) = '/'),
  explanation_md TEXT NOT NULL CHECK (length(trim(explanation_md)) > 0),
  PRIMARY KEY (project_id, relationship_id, revision_no, source_id, target_side, target_path),
  FOREIGN KEY (project_id, relationship_id, revision_no) REFERENCES business_relationship_revisions (project_id, relationship_id, revision_no),
  FOREIGN KEY (project_id, source_id) REFERENCES sources (project_id, id)
) STRICT;
CREATE INDEX business_relationship_revision_sources_reverse ON business_relationship_revision_sources (project_id, source_id, relationship_id, revision_no);

CREATE TABLE design_diagram_revision_sources (
  project_id TEXT NOT NULL,
  diagram_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  target_side TEXT NOT NULL CHECK (target_side IN ('before', 'after')),
  target_path TEXT NOT NULL CHECK (target_path = '' OR substr(target_path, 1, 1) = '/'),
  explanation_md TEXT NOT NULL CHECK (length(trim(explanation_md)) > 0),
  PRIMARY KEY (project_id, diagram_id, revision_no, source_id, target_side, target_path),
  FOREIGN KEY (project_id, diagram_id, revision_no) REFERENCES design_diagram_revisions (project_id, diagram_id, revision_no),
  FOREIGN KEY (project_id, source_id) REFERENCES sources (project_id, id)
) STRICT;
CREATE INDEX design_diagram_revision_sources_reverse ON design_diagram_revision_sources (project_id, source_id, diagram_id, revision_no);

CREATE TABLE technical_note_revision_sources (
  project_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  target_side TEXT NOT NULL CHECK (target_side IN ('before', 'after')),
  target_path TEXT NOT NULL CHECK (target_path = '' OR substr(target_path, 1, 1) = '/'),
  explanation_md TEXT NOT NULL CHECK (length(trim(explanation_md)) > 0),
  PRIMARY KEY (project_id, note_id, revision_no, source_id, target_side, target_path),
  FOREIGN KEY (project_id, note_id, revision_no) REFERENCES technical_note_revisions (project_id, note_id, revision_no),
  FOREIGN KEY (project_id, source_id) REFERENCES sources (project_id, id)
) STRICT;
CREATE INDEX technical_note_revision_sources_reverse ON technical_note_revision_sources (project_id, source_id, note_id, revision_no);

-- SQL guards structural endpoint types; the content Schema checks each operation payload.
CREATE TRIGGER business_relationship_endpoint_kinds BEFORE INSERT ON business_relationship_revisions
WHEN NOT EXISTS (
  SELECT 1 FROM business_entities s JOIN business_entities t ON t.project_id = s.project_id
  WHERE s.project_id = NEW.project_id AND s.id = NEW.source_entity_id AND t.id = NEW.target_entity_id AND (
    (NEW.kind IN ('functional_dependency', 'module_association') AND s.kind IN ('module', 'external_system')
      AND t.kind IN ('module', 'external_system') AND (s.kind = 'module' OR t.kind = 'module'))
    OR (NEW.kind IN ('call', 'event') AND s.kind = 'component' AND t.kind = 'component')
    OR (NEW.kind IN ('read', 'write') AND s.kind = 'component' AND t.kind = 'data_object')
    OR (NEW.kind = 'object_association' AND s.kind = 'data_object' AND t.kind = 'data_object')
  )
)
BEGIN SELECT RAISE(ABORT, 'relationship endpoint kinds are invalid'); END;

CREATE TRIGGER design_diagram_scope_kind BEFORE INSERT ON design_diagram_revisions
WHEN NEW.scope_kind = 'module' AND NOT EXISTS (
  SELECT 1 FROM business_entities WHERE project_id = NEW.project_id
    AND id = NEW.scope_module_id AND kind = 'module'
)
BEGIN SELECT RAISE(ABORT, 'diagram scope must reference a module'); END;

CREATE TRIGGER diagram_entity_level BEFORE INSERT ON diagram_revision_entities
WHEN NOT EXISTS (
  SELECT 1 FROM design_diagram_revisions d JOIN business_entities e ON e.project_id = d.project_id
  WHERE d.project_id = NEW.project_id AND d.diagram_id = NEW.diagram_id AND d.revision_no = NEW.revision_no
    AND e.id = NEW.entity_id AND (
      (d.scope_kind = 'project' AND e.kind IN ('module', 'external_system'))
      OR (d.scope_kind = 'module' AND e.kind IN ('component', 'data_object'))
    )
)
BEGIN SELECT RAISE(ABORT, 'entity is missing or invalid for diagram level'); END;

-- Relationship endpoints and note scopes can change without a diagram revision.
-- Their complete candidate-snapshot checks belong to the shared content validator.

CREATE TRIGGER business_entities_identity_immutable BEFORE UPDATE OF id, project_id, created_at, kind ON business_entities
BEGIN SELECT RAISE(ABORT, 'identity is immutable'); END;
CREATE TRIGGER business_entities_head_forward BEFORE UPDATE OF current_revision_no ON business_entities
WHEN NEW.current_revision_no <= OLD.current_revision_no
BEGIN SELECT RAISE(ABORT, 'head must move forward'); END;

CREATE TRIGGER business_relationships_identity_immutable BEFORE UPDATE OF id, project_id, created_at ON business_relationships
BEGIN SELECT RAISE(ABORT, 'identity is immutable'); END;
CREATE TRIGGER business_relationships_head_forward BEFORE UPDATE OF current_revision_no ON business_relationships
WHEN NEW.current_revision_no <= OLD.current_revision_no
BEGIN SELECT RAISE(ABORT, 'head must move forward'); END;

CREATE TRIGGER design_diagrams_identity_immutable BEFORE UPDATE OF id, project_id, created_at ON design_diagrams
BEGIN SELECT RAISE(ABORT, 'identity is immutable'); END;
CREATE TRIGGER design_diagrams_head_forward BEFORE UPDATE OF current_revision_no ON design_diagrams
WHEN NEW.current_revision_no <= OLD.current_revision_no
BEGIN SELECT RAISE(ABORT, 'head must move forward'); END;

CREATE TRIGGER technical_notes_identity_immutable BEFORE UPDATE OF id, project_id, created_at ON technical_notes
BEGIN SELECT RAISE(ABORT, 'identity is immutable'); END;
CREATE TRIGGER technical_notes_head_forward BEFORE UPDATE OF current_revision_no ON technical_notes
WHEN NEW.current_revision_no <= OLD.current_revision_no
BEGIN SELECT RAISE(ABORT, 'head must move forward'); END;

CREATE TRIGGER business_entity_revisions_no_update BEFORE UPDATE ON business_entity_revisions
BEGIN SELECT RAISE(ABORT, 'business_entity_revisions is append-only'); END;

CREATE TRIGGER business_entity_revisions_no_delete BEFORE DELETE ON business_entity_revisions
BEGIN SELECT RAISE(ABORT, 'business_entity_revisions is append-only'); END;

CREATE TRIGGER business_relationship_revisions_no_update BEFORE UPDATE ON business_relationship_revisions
BEGIN SELECT RAISE(ABORT, 'business_relationship_revisions is append-only'); END;

CREATE TRIGGER business_relationship_revisions_no_delete BEFORE DELETE ON business_relationship_revisions
BEGIN SELECT RAISE(ABORT, 'business_relationship_revisions is append-only'); END;

CREATE TRIGGER design_diagram_revisions_no_update BEFORE UPDATE ON design_diagram_revisions
BEGIN SELECT RAISE(ABORT, 'design_diagram_revisions is append-only'); END;

CREATE TRIGGER design_diagram_revisions_no_delete BEFORE DELETE ON design_diagram_revisions
BEGIN SELECT RAISE(ABORT, 'design_diagram_revisions is append-only'); END;

CREATE TRIGGER technical_note_revisions_no_update BEFORE UPDATE ON technical_note_revisions
BEGIN SELECT RAISE(ABORT, 'technical_note_revisions is append-only'); END;

CREATE TRIGGER technical_note_revisions_no_delete BEFORE DELETE ON technical_note_revisions
BEGIN SELECT RAISE(ABORT, 'technical_note_revisions is append-only'); END;

CREATE TRIGGER technical_note_revision_entities_no_update BEFORE UPDATE ON technical_note_revision_entities
BEGIN SELECT RAISE(ABORT, 'technical_note_revision_entities is append-only'); END;

CREATE TRIGGER technical_note_revision_entities_no_delete BEFORE DELETE ON technical_note_revision_entities
BEGIN SELECT RAISE(ABORT, 'technical_note_revision_entities is append-only'); END;

CREATE TRIGGER diagram_revision_entities_no_update BEFORE UPDATE ON diagram_revision_entities
BEGIN SELECT RAISE(ABORT, 'diagram_revision_entities is append-only'); END;

CREATE TRIGGER diagram_revision_entities_no_delete BEFORE DELETE ON diagram_revision_entities
BEGIN SELECT RAISE(ABORT, 'diagram_revision_entities is append-only'); END;

CREATE TRIGGER diagram_revision_relationships_no_update BEFORE UPDATE ON diagram_revision_relationships
BEGIN SELECT RAISE(ABORT, 'diagram_revision_relationships is append-only'); END;

CREATE TRIGGER diagram_revision_relationships_no_delete BEFORE DELETE ON diagram_revision_relationships
BEGIN SELECT RAISE(ABORT, 'diagram_revision_relationships is append-only'); END;

CREATE TRIGGER diagram_revision_notes_no_update BEFORE UPDATE ON diagram_revision_notes
BEGIN SELECT RAISE(ABORT, 'diagram_revision_notes is append-only'); END;

CREATE TRIGGER diagram_revision_notes_no_delete BEFORE DELETE ON diagram_revision_notes
BEGIN SELECT RAISE(ABORT, 'diagram_revision_notes is append-only'); END;

CREATE TRIGGER business_entity_revision_sources_no_update BEFORE UPDATE ON business_entity_revision_sources
BEGIN SELECT RAISE(ABORT, 'business_entity_revision_sources is append-only'); END;

CREATE TRIGGER business_entity_revision_sources_no_delete BEFORE DELETE ON business_entity_revision_sources
BEGIN SELECT RAISE(ABORT, 'business_entity_revision_sources is append-only'); END;

CREATE TRIGGER business_relationship_revision_sources_no_update BEFORE UPDATE ON business_relationship_revision_sources
BEGIN SELECT RAISE(ABORT, 'business_relationship_revision_sources is append-only'); END;

CREATE TRIGGER business_relationship_revision_sources_no_delete BEFORE DELETE ON business_relationship_revision_sources
BEGIN SELECT RAISE(ABORT, 'business_relationship_revision_sources is append-only'); END;

CREATE TRIGGER design_diagram_revision_sources_no_update BEFORE UPDATE ON design_diagram_revision_sources
BEGIN SELECT RAISE(ABORT, 'design_diagram_revision_sources is append-only'); END;

CREATE TRIGGER design_diagram_revision_sources_no_delete BEFORE DELETE ON design_diagram_revision_sources
BEGIN SELECT RAISE(ABORT, 'design_diagram_revision_sources is append-only'); END;

CREATE TRIGGER technical_note_revision_sources_no_update BEFORE UPDATE ON technical_note_revision_sources
BEGIN SELECT RAISE(ABORT, 'technical_note_revision_sources is append-only'); END;

CREATE TRIGGER technical_note_revision_sources_no_delete BEFORE DELETE ON technical_note_revision_sources
BEGIN SELECT RAISE(ABORT, 'technical_note_revision_sources is append-only'); END;

CREATE INDEX business_entity_revisions_operation ON business_entity_revisions(project_id, operation_id);
CREATE TRIGGER business_entity_revisions_operation_closed BEFORE INSERT ON business_entity_revisions
WHEN EXISTS (SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT, 'operation is closed'); END;

CREATE INDEX business_relationship_revisions_operation ON business_relationship_revisions(project_id, operation_id);
CREATE TRIGGER business_relationship_revisions_operation_closed BEFORE INSERT ON business_relationship_revisions
WHEN EXISTS (SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT, 'operation is closed'); END;

CREATE INDEX design_diagram_revisions_operation ON design_diagram_revisions(project_id, operation_id);
CREATE TRIGGER design_diagram_revisions_operation_closed BEFORE INSERT ON design_diagram_revisions
WHEN EXISTS (SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT, 'operation is closed'); END;

CREATE INDEX technical_note_revisions_operation ON technical_note_revisions(project_id, operation_id);
CREATE TRIGGER technical_note_revisions_operation_closed BEFORE INSERT ON technical_note_revisions
WHEN EXISTS (SELECT 1 FROM write_operations WHERE project_id = NEW.project_id AND id = NEW.operation_id)
BEGIN SELECT RAISE(ABORT, 'operation is closed'); END;

CREATE TRIGGER business_entity_revision_sources_revision_closed BEFORE INSERT ON business_entity_revision_sources
WHEN EXISTS (SELECT 1 FROM business_entity_revisions r JOIN write_operations o
  ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.entity_id = NEW.entity_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT, 'revision is closed'); END;

CREATE TRIGGER business_relationship_revision_sources_revision_closed BEFORE INSERT ON business_relationship_revision_sources
WHEN EXISTS (SELECT 1 FROM business_relationship_revisions r JOIN write_operations o
  ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.relationship_id = NEW.relationship_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT, 'revision is closed'); END;

CREATE TRIGGER design_diagram_revision_sources_revision_closed BEFORE INSERT ON design_diagram_revision_sources
WHEN EXISTS (SELECT 1 FROM design_diagram_revisions r JOIN write_operations o
  ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.diagram_id = NEW.diagram_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT, 'revision is closed'); END;

CREATE TRIGGER technical_note_revision_sources_revision_closed BEFORE INSERT ON technical_note_revision_sources
WHEN EXISTS (SELECT 1 FROM technical_note_revisions r JOIN write_operations o
  ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.note_id = NEW.note_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT, 'revision is closed'); END;

CREATE TRIGGER diagram_revision_entities_revision_closed BEFORE INSERT ON diagram_revision_entities
WHEN EXISTS (SELECT 1 FROM design_diagram_revisions r JOIN write_operations o
  ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.diagram_id = NEW.diagram_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT, 'revision is closed'); END;

CREATE TRIGGER diagram_revision_relationships_revision_closed BEFORE INSERT ON diagram_revision_relationships
WHEN EXISTS (SELECT 1 FROM design_diagram_revisions r JOIN write_operations o
  ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.diagram_id = NEW.diagram_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT, 'revision is closed'); END;

CREATE TRIGGER diagram_revision_notes_revision_closed BEFORE INSERT ON diagram_revision_notes
WHEN EXISTS (SELECT 1 FROM design_diagram_revisions r JOIN write_operations o
  ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.diagram_id = NEW.diagram_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT, 'revision is closed'); END;

CREATE TRIGGER technical_note_revision_entities_revision_closed BEFORE INSERT ON technical_note_revision_entities
WHEN EXISTS (SELECT 1 FROM technical_note_revisions r JOIN write_operations o
  ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = NEW.project_id AND r.note_id = NEW.note_id AND r.revision_no = NEW.revision_no)
BEGIN SELECT RAISE(ABORT, 'revision is closed'); END;
