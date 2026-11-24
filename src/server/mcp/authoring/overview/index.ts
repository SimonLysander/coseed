import type { AuthoringGroup } from '../../../../contracts/authoring-routes.js';
import type { ProjectOverviewContent } from '../../../../contracts/content/overview.js';
import type { Citation } from '../../../../contracts/project-content.js';
import { objectKey } from '../../../modules/project-content/persistence/definitions.js';
import { ObjectValidationError } from '../../../modules/project-content/errors.js';
import { Batch } from '../batch.js';
import { OverviewDiagramEdits } from './system-diagram.js';
import { editExampleSelections } from './example-selections.js';

type OverviewGroup = Extract<AuthoringGroup, { route: `overview.${string}` }>;
type Member = { id: string; citations?: Citation[] | undefined };
export function writeOverview(
  batch: Batch,
  group: OverviewGroup,
  diagramEdits: OverviewDiagramEdits,
) {
  const id = batch.base.projectId;
  const empty: ProjectOverviewContent = {
    product: { markdown: '' },
    concepts: { entries: [], relations: [] },
    examples: { introductionMd: null, actors: [], useCases: [], sections: [] },
  };
  const draft = batch.draft('overview', id, empty);
  const body = draft.content as ProjectOverviewContent;
  const original = batch.original.get(objectKey('overview', id));
  if (!original && group.route !== 'overview.product') {
    const requires = '先单独保存产品说明正文。';
    throw new ObjectValidationError('PREREQUISITE_MISSING', requires, [
      { objectType: 'overview', id, field: 'product', group: batch.group, path: 'input', requires },
    ]);
  }
  const prior = (original?.content ?? empty) as ProjectOverviewContent;
  if (group.route === 'overview.system_diagram') {
    diagramEdits.apply(batch, group, draft, prior.systemDiagram, body);
    return;
  }
  if (group.route === 'overview.product' || group.route === 'overview.example_context') {
    batch.claim('overview', id, group.route);
    if (group.route === 'overview.product') body.product = group.input;
    else body.examples.introductionMd = group.input.introductionMd;
    const evidence = batch.evidence(group.citations);
    if (group.route === 'overview.product') batch.cite(draft, evidence, '/product');
    else
      for (const citation of evidence) {
        const path = citation.path === '' ? '/introductionMd' : citation.path;
        if (path !== '/introductionMd') batch.fail('示例背景的来源只能指向 introductionMd。');
        batch.cite(draft, [{ ...citation, path }], '/examples');
      }
    batch.track('input', id, 'overview');
    return;
  }

  const removals: Member[] = group.input.remove;
  function members<T extends { id: string }>(
    field: string,
    collection: T[],
    base: T[],
    upserts: (T & Member)[],
    remove: Member[],
    listName: string,
  ) {
    const groupIndex = batch.group;
    const update = (member: Member, index: number, deleting: boolean) => {
      const memberId = member.id;
      batch.claim('overview', id, field + '/' + memberId);
      const position = collection.findIndex((v) => v.id === memberId);
      if (deleting) {
        if (position < 0) batch.fail('找不到要移除的综述成员 ' + memberId);
        collection.splice(position, 1);
      } else {
        const { citations: _, ...data } = member;
        if (position < 0) collection.push(data as T);
        else collection[position] = data as T;
      }
      const evidence = batch.evidence(member.citations ?? group.citations);
      batch.finalizeEvidence.push(() => {
        for (const c of evidence) {
          const at = (c.side === 'before' ? base : collection).findIndex((v) => v.id === memberId);
          if (at < 0)
            batch.fail('来源的 before/after 与综述成员的变动方向不符：' + memberId, groupIndex);
          batch.cite(draft, [c], field + '/' + at);
        }
      });
      batch.track((deleting ? 'remove' : listName) + '[' + index + ']', memberId, 'overview', id);
    };
    upserts.forEach((m, i) => update(m, i, false));
    remove.forEach((m) => update(m, removals.indexOf(m), true));
    if (
      (field === '/concepts/entries' || field === '/examples/sections') &&
      upserts.length === collection.length &&
      upserts.some((member, i) => collection[i]?.id !== member.id)
    ) {
      // A complete reading list specifies an order. Partial edits retain their positions.
      const orderEvidence = group.citations?.filter((c) => c.side === 'after' && c.path === '');
      if (orderEvidence?.length) batch.cite(draft, orderEvidence, field);
      const byId = new Map(collection.map((member) => [member.id, member]));
      collection.splice(0, collection.length, ...upserts.map((member) => byId.get(member.id)!));
    }
  }

  switch (group.route) {
    case 'overview.concepts':
      members(
        '/concepts/entries',
        body.concepts.entries,
        prior.concepts.entries,
        group.input.items,
        group.input.remove,
        'items',
      );
      break;
    case 'overview.concept_relations':
      members(
        '/concepts/relations',
        body.concepts.relations,
        prior.concepts.relations,
        group.input.items,
        group.input.remove,
        'items',
      );
      break;
    case 'overview.examples': {
      const { actors, useCases, sections, remove } = group.input;
      members(
        '/examples/actors',
        body.examples.actors,
        prior.examples.actors,
        actors,
        remove.filter((m) => m.kind === 'actor'),
        'actors',
      );
      members(
        '/examples/useCases',
        body.examples.useCases,
        prior.examples.useCases,
        useCases,
        remove.filter((m) => m.kind === 'use_case'),
        'useCases',
      );
      members(
        '/examples/sections',
        body.examples.sections,
        prior.examples.sections,
        sections,
        remove.filter((m) => m.kind === 'example'),
        'sections',
      );
      editExampleSelections(batch, group, draft, prior.examples.sections, body.examples.sections);
      break;
    }
  }
}
