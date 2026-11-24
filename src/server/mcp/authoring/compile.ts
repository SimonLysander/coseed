import type { AuthoringGroup } from '../../../contracts/authoring-routes.js';
import type { AuthoringInput } from '../../../contracts/mcp.js';
import type { OperationReceipt, ProjectSnapshot } from '../../../contracts/project-content.js';
import { resolveChanges } from '../changes.js';
import { ObjectValidationError } from '../../modules/project-content/errors.js';
import type { ProjectContentService } from '../../modules/project-content/project-content.service.js';
import type { WriteContext } from '../../../contracts/project-content.js';
import { Batch, type LogicalItem } from './batch.js';
import { writeOverview } from './overview/index.js';
import { OverviewDiagramEdits } from './overview/system-diagram.js';
import { writeDesign, diagramDefinitions } from './design.js';
import { writeRequirements } from './requirements.js';
import { objectKey } from '../../modules/project-content/persistence/definitions.js';
import { fingerprint } from '../identity.js';

// Multiple overview routes can produce one revision. Attribute its validation
// error to the submitted section that failed.
const overviewSections: Partial<Record<AuthoringGroup['route'], string>> = {
  'overview.product': 'product',
  'overview.system_diagram': 'systemDiagram',
  'overview.concepts': 'concepts',
  'overview.concept_relations': 'concepts',
  'overview.example_context': 'examples',
  'overview.examples': 'examples',
};
export function compileSave(input: AuthoringInput, base: ProjectSnapshot) {
  const batch = new Batch(base);
  const overviewDiagram = new OverviewDiagramEdits();
  const definitions = diagramDefinitions(input.changes);
  const records = new Set(
    input.changes.flatMap((group) =>
      group.route === 'requirements.progress'
        ? group.input.items.flatMap((item) => item.records.map((r) => r.id))
        : [],
    ),
  );
  for (const [index, group] of input.changes.entries()) {
    batch.group = index;
    const count = batch.items.length;
    switch (group.route) {
      case 'overview.product':
      case 'overview.system_diagram':
      case 'overview.concepts':
      case 'overview.concept_relations':
      case 'overview.example_context':
      case 'overview.examples':
        writeOverview(batch, group, overviewDiagram);
        break;
      case 'design.panorama.nodes':
      case 'design.panorama.edges':
      case 'design.module.nodes':
      case 'design.module.edges':
      case 'design.module.notes':
        writeDesign(batch, group, definitions);
        break;
      case 'requirements.items':
      case 'requirements.progress':
        writeRequirements(batch, group, records);
        break;
      case 'review.summary': {
        const { id, inputSourceIds, ...content } = group.input;
        const draft = batch.full(
          'retrospective',
          id,
          content,
          batch.evidence(group.citations),
          'input',
        );
        draft.inputSourceIds = inputSourceIds;
        break;
      }
      case 'project.settings': {
        if (!Object.keys(group.input).length) batch.fail('需提供要修改的项目设置。');
        const draft = batch.draft('project', input.projectId);
        for (const key of Object.keys(group.input)) batch.claim('project', input.projectId, key);
        Object.assign(draft.content, group.input);
        batch.cite(draft, batch.evidence(group.citations));
        batch.track('input', input.projectId, 'project');
        break;
      }
      case 'objects.remove':
        group.input.items.forEach(({ citations, ...item }, i) =>
          batch.lifecycle(
            { ...item, action: 'remove', citations: batch.evidence(citations ?? group.citations) },
            'items[' + i + ']',
          ),
        );
        break;
      case 'objects.restore':
        group.input.items.forEach(({ citations, statusChange, ...item }, i) =>
          batch.lifecycle(
            {
              ...item,
              action: 'restore',
              statusChange: statusChange ?? null,
              citations: batch.evidence(citations ?? group.citations),
            },
            'items[' + i + ']',
          ),
        );
        break;
    }
    if (count === batch.items.length) batch.fail('该组没有提交任何条目。');
  }
  const resolved = resolveChanges({ ...input, changes: batch.finish() });
  return {
    ...resolved,
    items: batch.items,
    digest: fingerprint(input),
    overviewEdits: {
      edgeBaseIndices: overviewDiagram.baseIndices,
      selectionSectionIds: new Set(
        input.changes.flatMap((g) =>
          g.route === 'overview.examples' ? (g.input.selections ?? []).map((s) => s.sectionId) : [],
        ),
      ),
    },
  };
}

export function itemResults(
  items: LogicalItem[],
  resolved: ReturnType<typeof compileSave>,
  receipt: OperationReceipt,
) {
  const revisions = new Map(receipt.changes.map((row) => [objectKey(row.objectType, row.id), row]));
  const ids = new Map(resolved.allocations.map((row) => [row.localRef, row.id]));
  const bases = new Map(
    resolved.input.changes.map((c) => [objectKey(c.objectType, c.id), c.expectedRevision]),
  );
  return items.map(({ id, objectType, objectId, group, path }) => {
    const officialId = ids.get(objectId) ?? objectId;
    const key = objectKey(objectType, officialId);
    const revision = revisions.get(key);
    return {
      group,
      path,
      id: objectId === id ? officialId : id,
      objectType,
      objectId: officialId,
      revisionNo: revision?.revisionNo ?? bases.get(key),
      status: revision ? 'saved' : 'unchanged',
    };
  });
}
export function saveAuthoredBatch(
  projects: ProjectContentService,
  input: AuthoringInput,
  context: WriteContext,
) {
  const resolved = compileSave(
    input,
    projects.readSnapshot(input.projectId, input.baseVersion, { includeSources: false }),
  );
  try {
    const receipt = projects.save(resolved.input, context, {
      kind: 'authoring',
      requestDigest: resolved.digest,
      overviewEdits: resolved.overviewEdits,
    });
    return {
      receipt,
      allocations: resolved.allocations,
      items: itemResults(resolved.items, resolved, receipt),
    };
  } catch (error) {
    if (error instanceof ObjectValidationError) {
      const refs = new Map(resolved.allocations.map((r) => [r.id, r.localRef]));
      const issues = error.issues.flatMap((issue) => {
        const ref = refs.get(issue.id) ?? issue.id;
        const matched = resolved.items.filter((item) => {
          if (item.objectType !== issue.objectType || item.objectId !== ref) return false;
          const change = input.changes[item.group]!;
          const section = overviewSections[change.route];
          return !section || !issue.field || issue.field.split('.')[0] === section;
        });
        const local = matched.filter((item) => issue.field.endsWith('.' + item.id));
        return matched.length
          ? (local.length ? local : matched).map((item) => ({
              ...issue,
              id: ref,
              group: item.group,
              path: item.path,
            }))
          : [{ ...issue, id: ref }];
      });
      throw new ObjectValidationError(error.code, error.message, issues);
    }
    throw error;
  }
}
