import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Alert, Button, Collapse, Drawer, Empty, Skeleton, Space } from 'antd';
import { Markdown } from '../reading/Markdown.js';
import { foundations } from '../design-system/tokens.js';
import { historyQuery, revisionQuery } from './queries.js';
import { StatusTag, date } from './StatusTag.js';
import type {
  HistoryResponse,
  RecordView,
  RequirementView,
} from '../../contracts/requirements-http.js';

export interface Inspection {
  type: 'requirement' | 'record';
  id: string;
  revisionNo?: number;
}
function RevisionBody({
  value,
  onInspect,
}: {
  value: HistoryResponse['items'][number];
  onInspect: (target: Inspection) => void;
}) {
  return (
    <section className="requirement-history-body ds-prose">
      <h3>{value.content.title}</h3>
      {value.isDeleted && (
        <Alert type="warning" title="此版本已移除该对象，以下为当时保留的内容。" />
      )}
      {'status' in value.content && <StatusTag status={value.content.status} />}
      {'occurredAt' in value.content && (
        <p className="requirement-meta">
          {value.content.occurredAt === null
            ? '发生时间未知'
            : `发生于 ${date(value.content.occurredAt)}`}
        </p>
      )}
      <Markdown text={value.content.markdown} headingStart={4} />
      <p className="requirement-meta">
        保存于 {date(value.savedAt)} · {value.actor.actorLabel} · {value.actor.entrypoint}
      </p>
      {value.actor.noteMd && <Markdown text={value.actor.noteMd} headingStart={4} />}
      {value.objectType === 'requirement' && value.statusChange && (
        <div className="requirement-state-reason">
          <h4>
            {value.statusChange.kind === 'initial'
              ? '初始状态'
              : value.statusChange.kind === 'correction'
                ? '状态更正'
                : '状态变化'}
          </h4>
          <Markdown text={value.statusChange.reasonMd} headingStart={5} />
          {value.statusChange.records.map((record) => (
            <Button
              key={`${record.id}:${record.revisionNo}`}
              type="link"
              onClick={() => onInspect({ type: 'record', ...record })}
            >
              支撑记录 · 第 {record.revisionNo} 版
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
function Evidence({
  projectId,
  value,
  version,
}: {
  projectId: string;
  value: RequirementView | RecordView;
  version: number;
}) {
  const type = 'status' in value.content ? 'requirement' : 'record';
  const query = useQuery(revisionQuery(projectId, type, value.id, value.revisionNo, version));
  if (query.isPending) return <Skeleton active paragraph={{ rows: 2 }} />;
  if (!query.data)
    return (
      <Alert
        type="error"
        title="无法读取来源"
        description={query.error?.message}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  const sources = new Map(query.data.sources.map((source) => [source.id, source]));
  const sourceIds = [...new Set(value.citations.map((citation) => citation.sourceId))];
  return (
    <div className="requirement-evidence">
      {query.isError && (
        <Alert
          type="warning"
          title="刷新来源失败，以下为已取得的固定版本材料。"
          description={query.error.message}
        />
      )}
      {sourceIds.map((id) => {
        const source = sources.get(id);
        return (
          <section key={id}>
            {value.citations
              .filter((citation) => citation.sourceId === id)
              .map((citation, index) => (
                <div key={index}>
                  <p className="requirement-meta">
                    {citation.side === 'before' ? '更正前的依据' : '本版内容的依据'} ·{' '}
                    {citation.path || '整体内容'}
                  </p>
                  <Markdown text={citation.explanationMd} headingStart={4} />
                </div>
              ))}
            {source ? (
              <>
                <pre className="requirement-source">{source.rawText}</pre>
                <p className="requirement-meta">
                  收录于 {date(source.capturedAt)} · {source.kind}
                </p>
                {Object.keys(source.locator).length > 0 && (
                  <pre className="requirement-source">
                    {JSON.stringify(source.locator, null, 2)}
                  </pre>
                )}
              </>
            ) : (
              <Alert type="error" title="来源缺失，无法展示原始材料。" />
            )}
          </section>
        );
      })}
    </div>
  );
}
function RevisionItem({
  projectId,
  version,
  value,
  onInspect,
}: {
  projectId: string;
  version: number;
  value: HistoryResponse['items'][number];
  onInspect: (target: Inspection) => void;
}) {
  return (
    <>
      <RevisionBody value={value} onInspect={onInspect} />
      <Collapse
        ghost
        size="small"
        items={[
          {
            key: 'sources',
            label: '原始来源',
            children: <Evidence projectId={projectId} value={value} version={version} />,
          },
        ]}
      />
    </>
  );
}
function ExactRevision({
  projectId,
  version,
  target,
  onInspect,
}: {
  projectId: string;
  version: number;
  target: Inspection & { revisionNo: number };
  onInspect: (target: Inspection) => void;
}) {
  const query = useQuery(
    revisionQuery(projectId, target.type, target.id, target.revisionNo, version),
  );
  if (query.isPending) return <Skeleton active />;
  if (!query.data)
    return (
      <Alert
        type="error"
        title="无法读取此修订"
        description={query.error?.message}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  return (
    <>
      {query.isError && (
        <Alert
          type="warning"
          title="更新读取失败，以下为已取得的固定修订。"
          description={query.error.message}
        />
      )}
      <p className="requirement-meta">
        第 {target.revisionNo} 版 · 项目版本 {query.data.revision.projectVersion}
      </p>
      <RevisionItem
        projectId={projectId}
        version={version}
        value={query.data.revision}
        onInspect={onInspect}
      />
    </>
  );
}
function RevisionList({
  projectId,
  version,
  target,
  onInspect,
}: {
  projectId: string;
  version: number;
  target: Inspection;
  onInspect: (target: Inspection) => void;
}) {
  const query = useInfiniteQuery(historyQuery(projectId, target.type, target.id, version));
  if (query.isPending) return <Skeleton active />;
  if (!query.data)
    return (
      <Alert
        type="error"
        title="无法读取修订历史"
        description={query.error?.message}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  const items = query.data.pages.flatMap((page) => page.items);
  return (
    <>
      {query.isError && (
        <Alert
          type="warning"
          title="无法读取更多历史，以下为已取得的版本。"
          description={query.error.message}
        />
      )}
      {items.length ? (
        <Collapse
          accordion
          ghost
          defaultActiveKey={[String(items[0]!.revisionNo)]}
          items={items.map((value) => ({
            key: String(value.revisionNo),
            label: (
              <span>
                第 {value.revisionNo} 版 · {date(value.savedAt)}
                {value.isDeleted ? ' · 已移除' : ''}
              </span>
            ),
            children: (
              <RevisionItem
                projectId={projectId}
                version={version}
                value={value}
                onInspect={onInspect}
              />
            ),
          }))}
        />
      ) : (
        <Empty description="没有可读取的修订" />
      )}
      {query.hasNextPage && (
        <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          更早的版本
        </Button>
      )}
    </>
  );
}
export function HistoryReader({
  projectId,
  version,
  target,
  onClose,
}: {
  projectId: string;
  version: number;
  target: Inspection;
  onClose: () => void;
}) {
  const [trail, setTrail] = useState<Inspection[]>([target]);
  const active = trail.at(-1)!;
  const inspect = (next: Inspection) => setTrail((before) => [...before, next]);
  return (
    <Drawer
      title={
        active.type === 'requirement'
          ? '需求修订历史'
          : active.revisionNo
            ? '记录历史版本'
            : '记录修订历史'
      }
      open
      onClose={onClose}
      size={foundations.size.modalWide}
      classNames={{ body: 'requirement-history-reader' }}
      extra={
        trail.length > 1 ? (
          <Button type="text" onClick={() => setTrail((before) => before.slice(0, -1))}>
            返回上一级
          </Button>
        ) : undefined
      }
    >
      <div key={`${active.type}:${active.id}:${active.revisionNo ?? 'all'}`}>
        {active.revisionNo === undefined ? (
          <RevisionList
            projectId={projectId}
            version={version}
            target={active}
            onInspect={inspect}
          />
        ) : (
          <ExactRevision
            projectId={projectId}
            version={version}
            target={{ ...active, revisionNo: active.revisionNo }}
            onInspect={inspect}
          />
        )}
      </div>
    </Drawer>
  );
}
