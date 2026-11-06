// Query-column mapping only. Reviewed SQL migrations own constraints and triggers.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text().primaryKey().notNull(),
  currentRevisionNo: integer('current_revision_no').notNull(),
  currentContentVersion: integer('current_content_version').default(0).notNull(),
  createdAt: integer('created_at').notNull(),
});

export const writeOperations = sqliteTable('write_operations', {
  id: text().primaryKey().notNull(),
  projectId: text('project_id').notNull(),
  baseContentVersion: integer('base_content_version'),
  resultContentVersion: integer('result_content_version').generatedAlwaysAs(
    sql`CASE WHEN base_content_version IS NULL THEN 0 ELSE base_content_version + 1 END`,
    { mode: 'stored' },
  ),
  requestHash: text('request_hash').notNull(),
  entrypoint: text().notNull(),
  actorKind: text('actor_kind').notNull(),
  actorLabel: text('actor_label').notNull(),
  clientMetadataJson: text('client_metadata_json').default('{}').notNull(),
  noteMd: text('note_md'),
  savedAt: integer('saved_at').notNull(),
});
