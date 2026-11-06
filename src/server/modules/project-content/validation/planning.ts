import type { SaveProjectInput, StoredRevision } from '../../../../contracts/project-content.js';
import { ensure } from '../errors.js';
import { objectKey, objectTypes } from '../persistence/definitions.js';
import { normalizeContent, type PlannedRevision } from '../persistence/revisions.js';
import type { SnapshotRepository } from '../persistence/snapshots.js';
import type { PendingOperation } from '../persistence/sources.js';
import { json } from '../persistence/sql.js';

export function planChanges(
  repository: SnapshotRepository,
  input: SaveProjectInput,
  pending: PendingOperation,
): PlannedRevision[] {
  const current = new Map(
    objectTypes
      .flatMap((type) =>
        repository.readType(type, {
          projectId: input.projectId,
          version: input.baseVersion,
          includeDeleted: true,
        }),
      )
      .map((value) => [objectKey(value.objectType, value.id), value]),
  );
  const seen = new Set<string>();
  return input.changes.flatMap((change, ordinal) => {
    const key = objectKey(change.objectType, change.id);
    ensure(!seen.has(key), 'INVALID_INPUT', '一批修改中，同一对象只能出现一次。');
    seen.add(key);
    if (change.objectType === 'project' || change.objectType === 'overview') {
      ensure(change.id === input.projectId, 'INVALID_INPUT', '项目基本资料和综述使用项目 ID。');
    }
    const before = current.get(key) ?? null;
    ensure(
      (before?.revisionNo ?? null) === change.expectedRevision,
      'CONFLICT',
      '对象修订已变化，请先读取当前版本。',
    );
    if (change.action !== 'upsert') ensure(before, 'NOT_FOUND', '待移除或恢复的对象不存在。');
    if (change.action === 'remove') ensure(!before!.isDeleted, 'NO_CHANGES', '对象已经移除。');
    if (change.action === 'upsert')
      ensure(!before?.isDeleted, 'CONFLICT', '已移除的对象须使用恢复操作。');
    const restored =
      change.action === 'restore'
        ? repository.revision(
            input.projectId,
            change.objectType,
            change.id,
            change.fromRevisionNo,
            input.baseVersion,
          )
        : null;
    if (restored) ensure(!restored.isDeleted, 'INVALID_INPUT', '不能从已移除的修订恢复内容。');
    const body = change.action === 'upsert' ? change.content : (restored ?? before)!.content;
    const content = normalizeContent(change.objectType, body);
    if (change.objectType === 'entity' && before)
      ensure(
        before.content.kind === content.kind,
        'INVALID_INPUT',
        '对象种类不可改变；请创建新的对象。',
      );
    const after: StoredRevision = {
      objectType: change.objectType,
      id: change.id,
      revisionNo: (before?.revisionNo ?? 0) + 1,
      operationId: pending.id,
      projectVersion: pending.version,
      savedAt: pending.savedAt,
      createdAt: before?.createdAt ?? pending.savedAt,
      isDeleted: change.action === 'remove',
      content,
      citations: change.citations,
      links:
        change.action === 'upsert' && 'links' in change
          ? (change.links ?? before?.links ?? [])
          : ((restored ?? before)?.links ?? []),
      inputSourceIds:
        change.action === 'upsert' && 'inputSourceIds' in change
          ? (change.inputSourceIds ?? before?.inputSourceIds ?? [])
          : ((restored ?? before)?.inputSourceIds ?? []),
      statusChange: null,
      captureOrdinal: change.objectType === 'record' ? (before?.captureOrdinal ?? ordinal) : null,
      captureVersion:
        change.objectType === 'record' ? (before?.captureVersion ?? pending.version) : null,
    };
    const statusChange = 'statusChange' in change ? change.statusChange : null;
    if (change.objectType !== 'requirement')
      ensure(!statusChange, 'INVALID_INPUT', '只有需求可以记录状态变化。');
    else if (change.action !== 'remove') {
      if (!before) {
        ensure(!statusChange, 'INVALID_INPUT', '新需求记录初始状态，无须提供状态迁移。');
        after.statusChange = {
          kind: 'initial',
          reasonMd: change.citations.map((value) => value.explanationMd).join('\n\n'),
          records: [],
        };
      } else if (before.content.status !== content.status) {
        ensure(statusChange, 'MISSING_EVIDENCE', '需求状态变化需要说明原因和依据。');
        after.statusChange = statusChange;
      } else ensure(!statusChange, 'INVALID_INPUT', '状态未变化，不能新增状态迁移。');
    }
    const comparable = (value: StoredRevision) =>
      json({
        content: value.content,
        isDeleted: value.isDeleted,
        links: value.links,
        inputSourceIds: value.inputSourceIds,
        citations: [...value.citations].sort((a, b) =>
          json(a) < json(b) ? -1 : json(a) > json(b) ? 1 : 0,
        ),
      });
    if (before && comparable(before) === comparable(after)) return [];
    return [{ before, after, action: change.action }];
  });
}
