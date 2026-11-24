import type { AuthoringGroup } from '../../../../contracts/authoring-routes.js';
import type {
  ProjectOverviewContent,
  SystemDiagram,
} from '../../../../contracts/content/overview.js';
import { ObjectValidationError } from '../../../modules/project-content/errors.js';
import type { Batch } from '../batch.js';

type DiagramGroup = Extract<AuthoringGroup, { route: 'overview.system_diagram' }>;
type Edge = SystemDiagram['edges'][number];

// Conceptual endpoints can have multiple labels. A base index survives a rename during
// this batch and keeps before/after evidence attached to the same edge after removals.
export class OverviewDiagramEdits {
  baseIndices?: (number | null)[];
  private replaced = false;

  apply(
    batch: Batch,
    group: DiagramGroup,
    draft: ReturnType<Batch['draft']>,
    prior: SystemDiagram | undefined,
    body: ProjectOverviewContent,
  ) {
    const id = draft.id;
    if (this.replaced || (this.baseIndices && !('edits' in group.input)))
      batch.fail('同一批次只可提交一份完整概览图，或逐条编辑连线。');
    if (!('edits' in group.input)) {
      this.replaced = true;
      body.systemDiagram = group.input;
      batch.cite(draft, batch.evidence(group.citations), '/systemDiagram');
      batch.track('input', id, 'overview');
      return;
    }
    if (!prior?.introductionMd || !body.systemDiagram) {
      const requires = '先一起保存工作方式导读、节点和连线，再编辑单条连线。';
      throw new ObjectValidationError('PREREQUISITE_MISSING', requires, [
        {
          objectType: 'overview',
          id,
          field: 'systemDiagram',
          group: batch.group,
          path: 'edits',
          requires,
        },
      ]);
    }
    const origins = (this.baseIndices ??= prior.edges.map((_, i) => i));
    const edges = body.systemDiagram.edges;
    const groupIndex = batch.group;
    for (const [index, edit] of group.input.edits.entries()) {
      const path = 'edits[' + index + ']';
      const sameEnds = (edge: Edge) => edge.source === edit.source && edge.target === edit.target;
      let baseIndex: number | undefined;
      let after: Edge | undefined;
      if (edit.op === 'add') {
        const { source, target, label } = edit;
        if (prior.edges.some((e) => sameEnds(e) && e.label === label))
          batch.fail(path + ' 已读版本已有这条连线。');
        batch.claim('overview', id, JSON.stringify(['newEdge', source, target, label]));
        after = { source, target, label };
        edges.push(after);
        origins.push(null);
      } else {
        const matches = prior.edges.filter(
          (e) =>
            sameEnds(e) && (edit.previousLabel === undefined || e.label === edit.previousLabel),
        );
        if (matches.length === 0) batch.fail(path + ' 在已读版本中找不到指定连线。');
        if (matches.length > 1)
          batch.fail(path + ' 的两端有多条连线，请用 previousLabel 指定旧标签。');
        baseIndex = prior.edges.indexOf(matches[0]!);
        batch.claim('overview', id, 'systemDiagram/edges/' + baseIndex);
        const at = origins.indexOf(baseIndex);
        if (edit.op === 'remove') {
          edges.splice(at, 1);
          origins.splice(at, 1);
        } else {
          after = edges[at]!;
          after.label = edit.label;
        }
      }
      const evidence = batch.evidence(edit.citations ?? group.citations);
      batch.finalizeEvidence.push(() => {
        for (const citation of evidence) {
          const at = citation.side === 'before' ? baseIndex : after && edges.indexOf(after);
          if (at === undefined || at < 0)
            batch.fail(path + ' 新增连线使用 after 来源，删除连线使用 before 来源。', groupIndex);
          batch.cite(draft, [citation], '/systemDiagram/edges/' + at);
        }
      });
      batch.track(path, id, 'overview');
    }
  }
}
