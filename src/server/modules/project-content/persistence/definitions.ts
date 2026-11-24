import type { z } from 'zod';
import type { ObjectType } from '../../../../contracts/project-content.js';
import { projectMetadataSchema } from '../../../../contracts/project-content.js';
import { projectOverviewContentSchema } from '../../../../contracts/content/overview.js';
import {
  requirementContentSchema,
  progressRecordContentSchema,
  retrospectiveContentSchema,
} from '../../../../contracts/content/requirements.js';
import {
  businessEntityContentSchema,
  businessRelationshipContentSchema,
  designDiagramContentSchema,
  technicalNoteContentSchema,
} from '../../../../contracts/content/business-design.js';

export interface Definition {
  identity: string;
  revisions: string;
  key: string;
  citations: string;
  schema: z.ZodType<Record<string, unknown>>;
  singleton: boolean;
  removable: boolean;
}

export const definitions: Record<ObjectType, Definition> = {
  project: {
    identity: 'projects',
    revisions: 'project_revisions',
    key: 'project_id',
    citations: 'project_revision_sources',
    schema: projectMetadataSchema,
    singleton: true,
    removable: false,
  },
  overview: {
    identity: 'project_overviews',
    revisions: 'overview_revisions',
    key: 'project_id',
    citations: 'overview_revision_sources',
    schema: projectOverviewContentSchema,
    singleton: true,
    removable: true,
  },
  requirement: {
    identity: 'requirements',
    revisions: 'requirement_revisions',
    key: 'requirement_id',
    citations: 'requirement_revision_sources',
    schema: requirementContentSchema,
    singleton: false,
    removable: true,
  },
  record: {
    identity: 'progress_records',
    revisions: 'progress_record_revisions',
    key: 'progress_record_id',
    citations: 'progress_record_revision_sources',
    schema: progressRecordContentSchema,
    singleton: false,
    removable: true,
  },
  retrospective: {
    identity: 'retrospectives',
    revisions: 'retrospective_revisions',
    key: 'retrospective_id',
    citations: 'retrospective_revision_sources',
    schema: retrospectiveContentSchema,
    singleton: false,
    removable: true,
  },
  entity: {
    identity: 'business_entities',
    revisions: 'business_entity_revisions',
    key: 'entity_id',
    citations: 'business_entity_revision_sources',
    schema: businessEntityContentSchema,
    singleton: false,
    removable: true,
  },
  relationship: {
    identity: 'business_relationships',
    revisions: 'business_relationship_revisions',
    key: 'relationship_id',
    citations: 'business_relationship_revision_sources',
    schema: businessRelationshipContentSchema,
    singleton: false,
    removable: true,
  },
  diagram: {
    identity: 'design_diagrams',
    revisions: 'design_diagram_revisions',
    key: 'diagram_id',
    citations: 'design_diagram_revision_sources',
    schema: designDiagramContentSchema,
    singleton: false,
    removable: true,
  },
  note: {
    identity: 'technical_notes',
    revisions: 'technical_note_revisions',
    key: 'note_id',
    citations: 'technical_note_revision_sources',
    schema: technicalNoteContentSchema,
    singleton: false,
    removable: true,
  },
};
export const objectTypes = Object.keys(definitions) as ObjectType[];
export const objectKey = (type: ObjectType, id: string): string => JSON.stringify([type, id]);
