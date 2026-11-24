import jsonpointer from 'jsonpointer';
import type { Citation, StoredRevision } from '../../../../contracts/project-content.js';
import type { ProjectOverviewContent } from '../../../../contracts/content/overview.js';
import { ensure } from '../errors.js';
import { json } from '../persistence/sql.js';
import type { PlannedRevision } from '../persistence/revisions.js';

// Local edits identify surviving array members. Whole-document writes retain
// their original positional citation rules, including field-level evidence.
export type OverviewEditLocations = {
  edgeBaseIndices?: readonly (number | null)[] | undefined;
  selectionSectionIds: ReadonlySet<string>;
};

function document(value: StoredRevision): Record<string, unknown> {
  const content = { ...value.content };
  if (value.objectType === 'requirement' || value.objectType === 'record')
    content.links = value.links;
  if (value.objectType === 'retrospective') content.inputSourceIds = value.inputSourceIds;
  return content;
}

function paths(value: unknown): Set<string> {
  const result = new Set<string>();
  const stack: [unknown, string][] = [[value, '']];
  while (stack.length) {
    const [item, path] = stack.pop()!;
    result.add(path);
    if (item !== null && typeof item === 'object')
      for (const [key, child] of Object.entries(item)) {
        stack.push([child, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`]);
      }
  }
  return result;
}

// Overview members retain their identity when a preceding entry is removed. Compare
// their fields by ID while keeping each citation's real before/after JSON Pointer.
function locations(
  value: Record<string, unknown> | null,
  actual: Set<string>,
  type: StoredRevision['objectType'],
  side: 'before' | 'after',
  edits?: OverviewEditLocations,
) {
  const result = new Map<string, string>();
  if (!value) return result;
  const memberPath =
    /^(\/(?:concepts\/(?:entries|relations)|examples\/(?:actors|useCases|sections)))\/(\d+)(\/.*)?$/;
  const edgeOrigins = type === 'overview' && side === 'after' ? edits?.edgeBaseIndices : undefined;
  for (const path of actual) {
    const match = type === 'overview' && memberPath.exec(path);
    const systemEdge = edgeOrigins && /^\/systemDiagram\/edges\/(\d+)(\/.*)?$/.exec(path);
    const diagramField =
      type === 'diagram' && /^(\/(?:entityIds|relationshipIds|noteIds))\/\d+$/.exec(path);
    if (match) {
      const member = jsonpointer.get(value, match[1] + '/' + match[2]) as { id: string };
      const suffix = match[3] ?? '';
      if (
        match[1] === '/examples/sections' &&
        edits?.selectionSectionIds.has(member.id) &&
        /^\/diagram\/useCaseIds\/\d+$/.test(suffix)
      )
        result.set(
          JSON.stringify([
            match[1],
            member.id,
            '/diagram/useCaseIds',
            jsonpointer.get(value, path),
          ]),
          path,
        );
      else result.set(JSON.stringify([match[1], member.id, suffix]), path);
    } else if (systemEdge && edgeOrigins) {
      const at = Number(systemEdge[1]);
      const origin = edgeOrigins[at];
      const suffix = systemEdge[2] ?? '';
      result.set(
        origin == null
          ? JSON.stringify(['newEdge', at, suffix])
          : '/systemDiagram/edges/' + origin + suffix,
        path,
      );
    } else if (diagramField)
      result.set(JSON.stringify([diagramField[1], jsonpointer.get(value, path)]), path);
    else result.set(path, path);
  }
  return result;
}
const emptyOverviewFields = new Set([
  '/concepts/entries',
  '/concepts/relations',
  '/examples/actors',
  '/examples/useCases',
  '/examples/sections',
  '/examples/introductionMd',
]);
function covers(path: string, location: string) {
  return path === '' || path === location || location.startsWith(path + '/');
}
function validateOrder(old: string[], next: string[], path: string, citations: Citation[]) {
  const oldSet = new Set(old),
    nextSet = new Set(next);
  if (json(old.filter((id) => nextSet.has(id))) !== json(next.filter((id) => oldSet.has(id))))
    ensure(
      citations.some((c) => c.side === 'after' && covers(c.path, path)),
      'MISSING_EVIDENCE',
      '调整综述成员顺序需要对应集合的来源。',
    );
}
export function validateEvidence(plan: PlannedRevision, edits?: OverviewEditLocations): void {
  const before = plan.before ? document(plan.before) : null;
  const after = document(plan.after);
  const beforePaths = before ? paths(before) : new Set<string>();
  const afterPaths = paths(after);
  const citations = plan.after.citations;
  const keys = new Set<string>();
  for (const citation of citations) {
    const key = json([citation.sourceId, citation.side, citation.path]);
    ensure(!keys.has(key), 'INVALID_INPUT', '同一来源和内容位置的引用重复。');
    keys.add(key);
    ensure(
      (citation.side === 'before' ? beforePaths : afterPaths).has(citation.path),
      'INVALID_REFERENCE',
      '来源引用的位置在对应的修改前／后内容中不存在。',
    );
  }
  if (plan.action === 'remove') {
    ensure(
      citations.some((value) => value.side === 'before'),
      'MISSING_EVIDENCE',
      '移除内容需要引用修改前的具体对象。',
    );
    return;
  }
  const stable = plan.after.objectType === 'overview';
  const left = locations(before, beforePaths, plan.after.objectType, 'before', edits),
    right = locations(after, afterPaths, plan.after.objectType, 'after', edits);
  let needsAfter = !before || !(stable || plan.after.objectType === 'diagram');
  if (stable && before) {
    for (const path of [
      '/concepts/entries',
      '/concepts/relations',
      '/examples/actors',
      '/examples/useCases',
      '/examples/sections',
    ]) {
      const old = (jsonpointer.get(before, path) as { id: string }[]).map((m) => m.id);
      const next = (jsonpointer.get(after, path) as { id: string }[]).map((m) => m.id);
      validateOrder(old, next, path, citations);
    }
  }
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const oldPath = left.get(key),
      newPath = right.get(key);
    const previous =
      oldPath !== undefined ? (jsonpointer.get(before!, oldPath) as unknown) : undefined;
    const next = newPath !== undefined ? (jsonpointer.get(after, newPath) as unknown) : undefined;
    // Empty collections and the absent example introduction are created by the server with the first product description.
    if (
      !before &&
      stable &&
      newPath &&
      emptyOverviewFields.has(newPath) &&
      (next === null || (Array.isArray(next) && next.length === 0))
    )
      continue;
    const isContainer = (value: unknown) =>
      value !== null && typeof value === 'object' && Object.keys(value).length > 0;
    if (isContainer(previous) || isContainer(next)) continue;
    if (previous === undefined && next === undefined) continue;
    if (previous !== undefined && next !== undefined && json(previous) === json(next)) continue;
    if (next !== undefined) needsAfter = true;
    let survivingSelection: string | undefined;
    if (stable && edits?.selectionSectionIds.size && oldPath && !newPath) {
      const selection = /^\/examples\/sections\/(\d+)\/diagram\/useCaseIds\/\d+$/.exec(oldPath);
      if (selection) {
        const sectionId = (before as ProjectOverviewContent).examples.sections[
          Number(selection[1])
        ]!.id;
        if (edits.selectionSectionIds.has(sectionId))
          survivingSelection = right.get(
            JSON.stringify(['/examples/sections', sectionId, '/diagram/useCaseIds']),
          );
      }
    }
    const covered = citations.some((c) => {
      if (survivingSelection && c.side === 'after' && covers(c.path, survivingSelection))
        return true;
      // The updated selection also proves a removal when the cited list itself survives.
      if (plan.after.objectType === 'diagram' && !newPath && c.side === 'after' && oldPath) {
        const removed = /^(\/(?:entityIds|relationshipIds|noteIds))\/\d+$/.exec(oldPath);
        if (removed && (c.path === '' || c.path === removed[1])) return true;
      }
      const path = c.side === 'before' ? oldPath : newPath;
      return path !== undefined && covers(c.path, path);
    });
    ensure(
      covered,
      'MISSING_EVIDENCE',
      '修改缺少对应位置的依据：' + (newPath ?? oldPath ?? '整个对象'),
    );
  }
  ensure(
    !needsAfter || citations.some((value) => value.side === 'after'),
    'MISSING_EVIDENCE',
    '保存内容需要有支持修改后内容的来源。',
  );
}
