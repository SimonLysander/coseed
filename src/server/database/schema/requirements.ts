// Query-column mapping only. Reviewed SQL migrations own constraints and triggers.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const requirements = sqliteTable('requirements', {
  id: text().primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  currentRevisionNo: integer('current_revision_no').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const requirementRevisions = sqliteTable('requirement_revisions', {
  projectId: text('project_id').notNull(),
  requirementId: text('requirement_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  operationId: text('operation_id').notNull(),
  isDeleted: integer('is_deleted').default(0).notNull(),
  title: text().notNull(),
  markdown: text().notNull(),
  status: text().notNull(),
  statusChangeKind: text('status_change_kind'),
  statusChangeReasonMd: text('status_change_reason_md'),
});

export const requirementRevisionSources = sqliteTable('requirement_revision_sources', {
  projectId: text('project_id').notNull(),
  requirementId: text('requirement_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  sourceId: text('source_id').notNull(),
  targetSide: text('target_side').notNull(),
  targetPath: text('target_path').notNull(),
  explanationMd: text('explanation_md').notNull(),
});

export const progressRecords = sqliteTable('progress_records', {
  id: text().primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  currentRevisionNo: integer('current_revision_no').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const progressRecordRevisions = sqliteTable('progress_record_revisions', {
  projectId: text('project_id').notNull(),
  progressRecordId: text('progress_record_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  operationId: text('operation_id').notNull(),
  isDeleted: integer('is_deleted').default(0).notNull(),
  requirementId: text('requirement_id').notNull(),
  title: text().notNull(),
  markdown: text().notNull(),
  occurredAt: integer('occurred_at'),
  captureOrdinal: integer('capture_ordinal'),
});

export const progressRecordRevisionSources = sqliteTable('progress_record_revision_sources', {
  projectId: text('project_id').notNull(),
  progressRecordId: text('progress_record_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  sourceId: text('source_id').notNull(),
  targetSide: text('target_side').notNull(),
  targetPath: text('target_path').notNull(),
  explanationMd: text('explanation_md').notNull(),
});

export const retrospectives = sqliteTable('retrospectives', {
  id: text().primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  currentRevisionNo: integer('current_revision_no').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const retrospectiveRevisions = sqliteTable('retrospective_revisions', {
  projectId: text('project_id').notNull(),
  retrospectiveId: text('retrospective_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  operationId: text('operation_id').notNull(),
  isDeleted: integer('is_deleted').default(0).notNull(),
  title: text().notNull(),
  scopeMd: text('scope_md').notNull(),
  summaryMd: text('summary_md').notNull(),
});

export const retrospectiveRevisionSources = sqliteTable('retrospective_revision_sources', {
  projectId: text('project_id').notNull(),
  retrospectiveId: text('retrospective_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  sourceId: text('source_id').notNull(),
  targetSide: text('target_side').notNull(),
  targetPath: text('target_path').notNull(),
  explanationMd: text('explanation_md').notNull(),
});

export const requirementRevisionStatusRecords = sqliteTable('requirement_revision_status_records', {
  projectId: text('project_id').notNull(),
  requirementId: text('requirement_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  recordId: text('record_id').notNull(),
  recordRevisionNo: integer('record_revision_no').notNull(),
});

export const retrospectiveRevisionInputs = sqliteTable('retrospective_revision_inputs', {
  projectId: text('project_id').notNull(),
  retrospectiveId: text('retrospective_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  sourceId: text('source_id').notNull(),
});

export const retrospectiveOperations = sqliteTable('retrospective_operations', {
  projectId: text('project_id').notNull(),
  operationId: text('operation_id').notNull(),
  retrospectiveId: text('retrospective_id').notNull(),
});

export const requirementRevisionLinks = sqliteTable('requirement_revision_links', {
  projectId: text('project_id').notNull(),
  requirementId: text('requirement_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  position: integer().notNull(),
  overviewId: text('overview_id'),
  overviewPart: text('overview_part'),
  overviewPartId: text('overview_part_id'),
  entityId: text('entity_id'),
  relationshipId: text('relationship_id'),
  diagramId: text('diagram_id'),
  noteId: text('note_id'),
  explanationMd: text('explanation_md').notNull(),
});

export const progressRecordRevisionLinks = sqliteTable('progress_record_revision_links', {
  projectId: text('project_id').notNull(),
  progressRecordId: text('progress_record_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  position: integer().notNull(),
  targetRecordId: text('target_record_id'),
  targetRecordRevisionNo: integer('target_record_revision_no'),
  overviewRevisionNo: integer('overview_revision_no'),
  overviewPart: text('overview_part'),
  overviewPartId: text('overview_part_id'),
  entityId: text('entity_id'),
  entityRevisionNo: integer('entity_revision_no'),
  relationshipId: text('relationship_id'),
  relationshipRevisionNo: integer('relationship_revision_no'),
  diagramId: text('diagram_id'),
  diagramProjectVersion: integer('diagram_project_version'),
  noteId: text('note_id'),
  noteRevisionNo: integer('note_revision_no'),
  explanationMd: text('explanation_md').notNull(),
});
