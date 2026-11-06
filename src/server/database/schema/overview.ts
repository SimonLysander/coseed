// Query-column mapping only. Reviewed SQL migrations own constraints and triggers.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const sources = sqliteTable('sources', {
  id: text().primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  capturedByOperationId: text('captured_by_operation_id').notNull(),
  kind: text().notNull(),
  rawText: text('raw_text').notNull(),
  contentHash: text('content_hash').notNull(),
  locatorJson: text('locator_json').default('{}').notNull(),
  occurredAt: integer('occurred_at'),
});

export const projectRevisions = sqliteTable('project_revisions', {
  projectId: text('project_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  previousRevisionNo: integer('previous_revision_no'),
  operationId: text('operation_id').notNull(),
  name: text().notNull(),
  repositoryLocatorJson: text('repository_locator_json'),
});

export const projectOverviews = sqliteTable('project_overviews', {
  projectId: text('project_id').primaryKey().notNull(),
  currentRevisionNo: integer('current_revision_no'),
});

export const overviewRevisions = sqliteTable('overview_revisions', {
  projectId: text('project_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  previousRevisionNo: integer('previous_revision_no'),
  operationId: text('operation_id').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  isDeleted: integer('is_deleted').default(0).notNull(),
  contentJson: text('content_json').notNull(),
  contentHash: text('content_hash').notNull(),
});

export const projectRevisionSources = sqliteTable('project_revision_sources', {
  projectId: text('project_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  sourceId: text('source_id').notNull(),
  targetSide: text('target_side').notNull(),
  targetPath: text('target_path').notNull(),
  explanationMd: text('explanation_md').notNull(),
});

export const overviewRevisionSources = sqliteTable('overview_revision_sources', {
  projectId: text('project_id').notNull(),
  revisionNo: integer('revision_no').notNull(),
  sourceId: text('source_id').notNull(),
  targetSide: text('target_side').notNull(),
  targetPath: text('target_path').notNull(),
  explanationMd: text('explanation_md').notNull(),
});
