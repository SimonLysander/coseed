import jsonpointer from 'jsonpointer';
import type { StoredRevision } from '../../../../contracts/project-content.js';
import { ensure } from '../errors.js';
import { json } from '../persistence/sql.js';
import type { PlannedRevision } from '../persistence/revisions.js';

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

export function validateEvidence(plan: PlannedRevision): void {
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
  ensure(
    citations.some((value) => value.side === 'after'),
    'MISSING_EVIDENCE',
    '保存内容需要有支持修改后内容的来源。',
  );
  // Enumerating own JSON locations before library lookup excludes inherited keys,
  // invalid escapes and array properties such as /items/length.
  for (const path of new Set([...beforePaths, ...afterPaths])) {
    const previous = beforePaths.has(path)
      ? (jsonpointer.get(before!, path) as unknown)
      : undefined;
    const next = afterPaths.has(path) ? (jsonpointer.get(after, path) as unknown) : undefined;
    const isContainer = (value: unknown) =>
      value !== null && typeof value === 'object' && Object.keys(value).length > 0;
    if (isContainer(previous) || isContainer(next)) continue;
    if (previous === undefined && next === undefined) continue;
    if (previous !== undefined && next !== undefined && json(previous) === json(next)) continue;
    const covered = citations.some(
      (citation) =>
        (citation.path === '' || path === citation.path || path.startsWith(`${citation.path}/`)) &&
        (citation.side === 'before' ? beforePaths : afterPaths).has(path),
    );
    ensure(covered, 'MISSING_EVIDENCE', `修改缺少对应位置的依据：${path || '整个对象'}。`);
  }
}
