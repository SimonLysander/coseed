import type { AuthoringGroup } from '../../../../contracts/authoring-routes.js';
import type { ProjectOverviewContent } from '../../../../contracts/content/overview.js';
import type { Batch } from '../batch.js';

type Sections = ProjectOverviewContent['examples']['sections'];
type ExamplesGroup = Extract<AuthoringGroup, { route: 'overview.examples' }>;
export function editExampleSelections(
  batch: Batch,
  group: ExamplesGroup,
  draft: ReturnType<Batch['draft']>,
  prior: Sections,
  sections: Sections,
) {
  for (const [i, edit] of (group.input.selections ?? []).entries()) {
    const path = 'selections[' + i + ']';
    const id = edit.sectionId;
    batch.claim('overview', draft.id, '/examples/sections/' + id);
    const before = prior.findIndex((section) => section.id === id);
    const section = sections.find((s) => s.id === id);
    if (before < 0 || !section) batch.fail(path + ' 找不到已保存的示例小节 ' + id);
    const changedIds = [...edit.attach, ...edit.detach];
    if (!changedIds.length) batch.fail(path + ' 至少指定一个要加入或移出的用例。');
    if (new Set(changedIds).size !== changedIds.length)
      batch.fail(path + ' 同一用例在该小节中只能变更一次。');
    const selected = new Set(section.diagram.useCaseIds);
    for (const caseId of edit.detach) {
      if (!selected.delete(caseId)) batch.fail(path + ' 小节尚未选用用例 ' + caseId);
    }
    for (const caseId of edit.attach) {
      if (selected.has(caseId)) batch.fail(path + ' 小节已选用用例 ' + caseId);
      selected.add(caseId);
    }
    section.diagram.useCaseIds = [...selected];
    const evidence = batch.evidence(edit.citations ?? group.citations);
    batch.finalizeEvidence.push(() => {
      const after = sections.findIndex((s) => s.id === id);
      for (const c of evidence)
        batch.cite(
          draft,
          [c],
          '/examples/sections/' + (c.side === 'before' ? before : after) + '/diagram/useCaseIds',
        );
    });
    batch.track(path, id, 'overview', draft.id);
  }
}
