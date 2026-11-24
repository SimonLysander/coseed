import type { AuthoringGroup } from '../../../contracts/authoring-routes.js';
import { objectKey } from '../../modules/project-content/persistence/definitions.js';
import { Batch } from './batch.js';

type RequirementsGroup = Extract<AuthoringGroup, { route: `requirements.${string}` }>;
export function writeRequirements(
  batch: Batch,
  group: RequirementsGroup,
  records: ReadonlySet<string>,
) {
  if (group.route === 'requirements.items') {
    group.input.items.forEach(({ id, citations, initialStatus, links, ...content }, index) => {
      const draft = batch.draft('requirement', id);
      const prior = batch.original.get(objectKey('requirement', id));
      if (prior && initialStatus !== undefined)
        batch.fail('已有需求通过推进记录或状态纠错改变状态。');
      if (!prior && !initialStatus) batch.fail('新需求缺少 initialStatus。');
      const status = draft.content.status ?? initialStatus;
      batch.claim('requirement', id, 'body');
      Object.assign(draft.content, content, { status });
      if (links !== undefined) draft.links = links;
      batch.cite(draft, batch.evidence(citations ?? group.citations));
      batch.track('items[' + index + ']', id, 'requirement');
    });
    return;
  }
  group.input.items.forEach((item, index) => {
    const id = item.requirementId;
    const prefix = 'items[' + index + ']';
    if (!item.records.length && !item.statusChange)
      batch.fail(prefix + ' 需要包含记录或状态变化。');
    for (const [i, { id: recordId, citations, links, ...body }] of item.records.entries()) {
      const draft = batch.full(
        'record',
        recordId,
        { ...body, requirementId: id },
        batch.evidence(citations ?? item.citations ?? group.citations),
        prefix + '.records[' + i + ']',
      );
      if (links !== undefined) draft.links = links;
    }
    const change = item.statusChange;
    if (!change) return;
    batch.claim('requirement', id, 'status');
    const draft = batch.draft('requirement', id);
    if (!batch.original.has(objectKey('requirement', id)))
      batch.fail('状态变化需要已经保存的需求。');
    draft.content.status = change.to;
    draft.statusChange = {
      kind: change.kind,
      reasonMd: change.reasonMd,
      records: change.records.map((ref) => {
        if (ref.kind === 'saved') return { id: ref.id, revisionNo: ref.revisionNo };
        if (!records.has(ref.id)) batch.fail('in_batch 必须引用本批提交的记录。');
        return {
          id: ref.id,
          revisionNo: (batch.original.get(objectKey('record', ref.id))?.revisionNo ?? 0) + 1,
        };
      }),
    };
    batch.cite(draft, batch.evidence(change.citations ?? item.citations ?? group.citations));
    batch.track(prefix + '.statusChange', id, 'requirement');
  });
}
