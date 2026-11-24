import type {
  CurrentLink,
  HistoricalLink,
  OverviewPart,
  ObjectType,
  StoredRevision,
} from '../../../../contracts/project-content.js';
import { currentLinkSchema, historicalLinkSchema } from '../../../../contracts/project-content.js';
import { insert, type QueryConnection } from './sql.js';

export type Row = Record<string, unknown>;
const partFromRow = (row: Row): OverviewPart =>
  row.overview_part_id === null
    ? ({ kind: row.overview_part } as OverviewPart)
    : ({ kind: row.overview_part, id: row.overview_part_id } as OverviewPart);

export function decodeCurrentLink(row: Row): CurrentLink {
  if (row.overview_id !== null)
    return currentLinkSchema.parse({
      target: { kind: 'overview', part: partFromRow(row) },
      explanationMd: row.explanation_md,
    });
  const kind = (['entity', 'relationship', 'diagram', 'note'] as const).find(
    (name) => row[`${name}_id`] !== null,
  );
  return currentLinkSchema.parse({
    target: { kind, id: row[`${kind}_id`] },
    explanationMd: row.explanation_md,
  });
}
export function decodeHistoricalLink(row: Row): HistoricalLink {
  let target: unknown;
  if (row.overview_revision_no !== null)
    target = { kind: 'overview', revisionNo: row.overview_revision_no, part: partFromRow(row) };
  else if (row.target_record_id !== null)
    target = {
      kind: 'record',
      id: row.target_record_id,
      revisionNo: row.target_record_revision_no,
    };
  else if (row.diagram_id !== null)
    target = { kind: 'diagram', id: row.diagram_id, projectVersion: row.diagram_project_version };
  else {
    const kind = (['entity', 'relationship', 'note'] as const).find(
      (name) => row[`${name}_id`] !== null,
    );
    target = { kind, id: row[`${kind}_id`], revisionNo: row[`${kind}_revision_no`] };
  }
  return historicalLinkSchema.parse({ target, explanationMd: row.explanation_md });
}

export function writeLinks(
  connection: QueryConnection,
  projectId: string,
  revision: StoredRevision,
): void {
  if (revision.objectType === 'requirement') {
    revision.links.forEach((value, position) => {
      const link = currentLinkSchema.parse(value);
      const target = link.target;
      const targetValues: Row =
        target.kind === 'overview'
          ? {
              overview_id: projectId,
              overview_part: target.part.kind,
              overview_part_id: 'id' in target.part ? target.part.id : null,
            }
          : { [`${target.kind}_id`]: target.id };
      insert(connection, 'requirement_revision_links', {
        project_id: projectId,
        requirement_id: revision.id,
        revision_no: revision.revisionNo,
        position,
        explanation_md: link.explanationMd,
        ...targetValues,
      });
    });
  } else if (revision.objectType === 'record') {
    revision.links.forEach((value, position) => {
      const link = historicalLinkSchema.parse(value);
      const target = link.target;
      let targetValues: Row;
      if (target.kind === 'overview')
        targetValues = {
          overview_revision_no: target.revisionNo,
          overview_part: target.part.kind,
          overview_part_id: 'id' in target.part ? target.part.id : null,
        };
      else if (target.kind === 'record')
        targetValues = {
          target_record_id: target.id,
          target_record_revision_no: target.revisionNo,
        };
      else if (target.kind === 'diagram')
        targetValues = { diagram_id: target.id, diagram_project_version: target.projectVersion };
      else
        targetValues = {
          [`${target.kind}_id`]: target.id,
          [`${target.kind}_revision_no`]: target.revisionNo,
        };
      insert(connection, 'progress_record_revision_links', {
        project_id: projectId,
        progress_record_id: revision.id,
        revision_no: revision.revisionNo,
        position,
        explanation_md: link.explanationMd,
        ...targetValues,
      });
    });
  }
}

export const memberDefinitions: Partial<
  Record<ObjectType, { table: string; field: string; key: string }[]>
> = {
  diagram: [
    { table: 'diagram_revision_entities', field: 'entityIds', key: 'entity_id' },
    { table: 'diagram_revision_relationships', field: 'relationshipIds', key: 'relationship_id' },
    { table: 'diagram_revision_notes', field: 'noteIds', key: 'note_id' },
  ],
  note: [{ table: 'technical_note_revision_entities', field: 'entityIds', key: 'entity_id' }],
};
