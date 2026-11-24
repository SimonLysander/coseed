// Query-column mapping only. Reviewed SQL migrations own constraints and triggers.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const businessEntities = sqliteTable('business_entities', {
  id: text().primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  kind: text().notNull(),
  currentRevisionNo: integer('current_revision_no').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const businessRelationships = sqliteTable('business_relationships', {
  id: text().primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  currentRevisionNo: integer('current_revision_no').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const designDiagrams = sqliteTable('design_diagrams', {
  id: text().primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  currentRevisionNo: integer('current_revision_no').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const technicalNotes = sqliteTable('technical_notes', {
  id: text().primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  currentRevisionNo: integer('current_revision_no').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const businessEntityRevisions = sqliteTable('business_entity_revisions', {
  projectId: text('project_id').notNull(),
  entityId: text('entity_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  operationId: text('operation_id').notNull(),
  isDeleted: integer('is_deleted').default(0).notNull(),
  schemaVersion: integer('schema_version').notNull(),
  contentJson: text('content_json').notNull(),
  kind: text()
    .notNull()
    .generatedAlwaysAs(sql`json_extract(content_json, '$.kind')`, { mode: 'stored' }),
  name: text()
    .notNull()
    .generatedAlwaysAs(sql`json_extract(content_json, '$.name')`, { mode: 'stored' }),
  summary: text()
    .notNull()
    .generatedAlwaysAs(sql`json_extract(content_json, '$.summary')`, { mode: 'stored' }),
  ownerEntityId: text('owner_entity_id').generatedAlwaysAs(
    sql`json_extract(content_json, '$.owner.id')`,
    { mode: 'stored' },
  ),
  ownerKind: text('owner_kind').generatedAlwaysAs(sql`json_extract(content_json, '$.owner.kind')`, {
    mode: 'stored',
  }),
  primarySourceId: text('primary_source_id').generatedAlwaysAs(
    sql`json_extract(content_json, '$.primarySourceId')`,
    { mode: 'stored' },
  ),
  typeSourceId: text('type_source_id').generatedAlwaysAs(
    sql`json_extract(content_json, '$.typeSourceId')`,
    { mode: 'stored' },
  ),
});

export const businessRelationshipRevisions = sqliteTable('business_relationship_revisions', {
  projectId: text('project_id').notNull(),
  relationshipId: text('relationship_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  operationId: text('operation_id').notNull(),
  isDeleted: integer('is_deleted').default(0).notNull(),
  schemaVersion: integer('schema_version').notNull(),
  contentJson: text('content_json').notNull(),
  kind: text()
    .notNull()
    .generatedAlwaysAs(sql`json_extract(content_json, '$.kind')`, { mode: 'stored' }),
  sourceEntityId: text('source_entity_id')
    .notNull()
    .generatedAlwaysAs(sql`json_extract(content_json, '$.sourceId')`, { mode: 'stored' }),
  targetEntityId: text('target_entity_id')
    .notNull()
    .generatedAlwaysAs(sql`json_extract(content_json, '$.targetId')`, { mode: 'stored' }),
  summary: text()
    .notNull()
    .generatedAlwaysAs(sql`json_extract(content_json, '$.summary')`, { mode: 'stored' }),
});

export const designDiagramRevisions = sqliteTable('design_diagram_revisions', {
  projectId: text('project_id').notNull(),
  diagramId: text('diagram_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  operationId: text('operation_id').notNull(),
  isDeleted: integer('is_deleted').default(0).notNull(),
  title: text().notNull(),
  scopeKind: text('scope_kind').notNull(),
  scopeModuleId: text('scope_module_id'),
});

export const technicalNoteRevisions = sqliteTable('technical_note_revisions', {
  projectId: text('project_id').notNull(),
  noteId: text('note_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  operationId: text('operation_id').notNull(),
  isDeleted: integer('is_deleted').default(0).notNull(),
  title: text().notNull(),
  problemMd: text('problem_md').notNull(),
});

export const technicalNoteRevisionEntities = sqliteTable('technical_note_revision_entities', {
  projectId: text('project_id').notNull(),
  noteId: text('note_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  entityId: text('entity_id').notNull(),
});

export const diagramRevisionEntities = sqliteTable('diagram_revision_entities', {
  projectId: text('project_id').notNull(),
  diagramId: text('diagram_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  entityId: text('entity_id').notNull(),
});

export const diagramRevisionRelationships = sqliteTable('diagram_revision_relationships', {
  projectId: text('project_id').notNull(),
  diagramId: text('diagram_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  relationshipId: text('relationship_id').notNull(),
});

export const diagramRevisionNotes = sqliteTable('diagram_revision_notes', {
  projectId: text('project_id').notNull(),
  diagramId: text('diagram_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  noteId: text('note_id').notNull(),
});

export const businessEntityRevisionSources = sqliteTable('business_entity_revision_sources', {
  projectId: text('project_id').notNull(),
  entityId: text('entity_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  sourceId: text('source_id').notNull(),
  targetSide: text('target_side').notNull(),
  targetPath: text('target_path').notNull(),
  explanationMd: text('explanation_md').notNull(),
});

export const businessRelationshipRevisionSources = sqliteTable(
  'business_relationship_revision_sources',
  {
    projectId: text('project_id').notNull(),
    relationshipId: text('relationship_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    sourceId: text('source_id').notNull(),
    targetSide: text('target_side').notNull(),
    targetPath: text('target_path').notNull(),
    explanationMd: text('explanation_md').notNull(),
  },
);

export const designDiagramRevisionSources = sqliteTable('design_diagram_revision_sources', {
  projectId: text('project_id').notNull(),
  diagramId: text('diagram_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  sourceId: text('source_id').notNull(),
  targetSide: text('target_side').notNull(),
  targetPath: text('target_path').notNull(),
  explanationMd: text('explanation_md').notNull(),
});

export const technicalNoteRevisionSources = sqliteTable('technical_note_revision_sources', {
  projectId: text('project_id').notNull(),
  noteId: text('note_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  sourceId: text('source_id').notNull(),
  targetSide: text('target_side').notNull(),
  targetPath: text('target_path').notNull(),
  explanationMd: text('explanation_md').notNull(),
});
