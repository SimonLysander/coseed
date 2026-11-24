import {
  contentChangeSchema,
  type Citation,
  type CurrentLink,
  type HistoricalLink,
  type ObjectType,
  type ProjectSnapshot,
  type StoredRevision,
} from '../../../contracts/project-content.js';
import { ContentError, ensure } from '../../modules/project-content/errors.js';
import { objectKey } from '../../modules/project-content/persistence/definitions.js';

type Draft = {
  action: 'upsert' | 'remove' | 'restore';
  objectType: ObjectType;
  id: string;
  expectedRevision: number | null;
  content?: Record<string, unknown>;
  citations: Citation[];
  inputSourceIds?: string[];
  links?: CurrentLink[] | HistoricalLink[];
  fromRevisionNo?: number;
  statusChange?: unknown;
};
export type LogicalItem = {
  group: number;
  path: string;
  id: string;
  objectType: ObjectType;
  objectId: string;
};
export class Batch {
  readonly original: Map<string, StoredRevision>;
  private readonly drafts = new Map<string, Draft>();
  private readonly claims = new Set<string>();
  readonly items: LogicalItem[] = [];
  readonly finalizeEvidence: (() => void)[] = [];
  group = 0;
  constructor(readonly base: ProjectSnapshot) {
    this.original = new Map(
      [base.project, ...base.objects].map((row) => [objectKey(row.objectType, row.id), row]),
    );
  }
  fail(message: string, group = this.group): never {
    throw new ContentError('INVALID_INPUT', 'changes[' + group + '] ' + message);
  }
  evidence(citations: Citation[] | undefined): Citation[] {
    if (!citations?.length)
      throw new ContentError(
        'MISSING_EVIDENCE',
        'changes[' + this.group + '] 需要该条目或组的来源。',
      );
    return citations;
  }
  claim(type: ObjectType, id: string, field: string) {
    const key = JSON.stringify([type, id, field]);
    if (this.claims.has(key)) this.fail(type + ' ' + id + ' 的同一字段或成员被重复提交：' + field);
    this.claims.add(key);
  }
  draft(
    type: ObjectType,
    id: string,
    fallback: Record<string, unknown> = {},
  ): Draft & { content: Record<string, unknown> } {
    const key = objectKey(type, id);
    const existing = this.drafts.get(key);
    if (existing && existing.action !== 'upsert') this.fail('同一对象不能同时编辑、移除或恢复。');
    if (existing) return existing as Draft & { content: Record<string, unknown> };
    const prior = this.original.get(key);
    if (!prior && !id.startsWith('$') && !(type === 'overview' && id === this.base.projectId))
      throw new ContentError(
        'INVALID_REFERENCE',
        'changes[' + this.group + '] 未在已读版本找到 ' + type + ' ' + id,
      );
    const draft = {
      action: 'upsert' as const,
      objectType: type,
      id,
      expectedRevision: prior?.revisionNo ?? null,
      citations: [] as Citation[],
      content: structuredClone(prior?.content ?? fallback),
    };
    this.drafts.set(key, draft);
    return draft;
  }
  cite(draft: Draft, items: Citation[], prefix = '') {
    for (const citation of items) {
      const entry = { ...citation, path: prefix + citation.path };
      const existing = draft.citations.find(
        (c) => c.sourceId === entry.sourceId && c.side === entry.side && c.path === entry.path,
      );
      if (!existing) draft.citations.push(entry);
      else if (
        existing.explanationMd !== entry.explanationMd &&
        !existing.explanationMd.split('\n\n').includes(entry.explanationMd)
      )
        existing.explanationMd += '\n\n' + entry.explanationMd;
    }
  }
  track(path: string, id: string, objectType: ObjectType, objectId = id) {
    this.items.push({ group: this.group, path, id, objectType, objectId });
  }
  full(
    type: ObjectType,
    id: string,
    content: Record<string, unknown>,
    citations: Citation[],
    path: string,
  ) {
    this.claim(type, id, 'body');
    const draft = this.draft(type, id);
    draft.content = content;
    this.cite(draft, citations);
    this.track(path, id, type);
    return draft;
  }
  lifecycle(draft: Draft, path: string) {
    const key = objectKey(draft.objectType, draft.id);
    if (this.drafts.has(key)) this.fail('同一对象不能同时编辑、移除或恢复。');
    this.drafts.set(key, draft);
    this.track(path, draft.id, draft.objectType);
  }
  finish() {
    for (const fn of this.finalizeEvidence) fn();
    ensure(this.items.length, 'INVALID_INPUT', '批次没有条目。');
    return [...this.drafts.values()].map((draft) => contentChangeSchema.parse(draft));
  }
}
