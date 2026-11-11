import { useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, List, Select, Skeleton, Space, Timeline } from 'antd';
import { Link, useParams } from 'react-router';
import { RefreshCwIcon } from '@animateicons/react/lucide/refresh-cw-icon';
import { ArrowLeftIcon } from '@animateicons/react/lucide/arrow-left-icon';
import { Markdown } from '../reading/Markdown.js';
import { foundations } from '../design-system/tokens.js';
import {
  requirementStatusLabels,
  type RequirementStatus,
} from '../../contracts/content/requirements.js';
import { recordsQuery, requirementQuery, requirementsPath, requirementsQuery } from './queries.js';
import { HistoryReader, RelatedRecords, type Inspection } from './HistoryReader.js';
import { StatusTag, date } from './StatusTag.js';
import type { CurrentLink } from '../../contracts/project-content.js';
import './requirements.css';

function Refresh({ projectId, busy }: { projectId: string; busy: boolean }) {
  const queries = useQueryClient();
  return (
    <Button
      type="text"
      aria-label="刷新需求推进"
      loading={busy}
      icon={<RefreshCwIcon className="ds-icon" size={foundations.size.icon} aria-hidden="true" />}
      onClick={() => void queries.invalidateQueries({ queryKey: ['projects', projectId] })}
    >
      刷新
    </Button>
  );
}
function Failure({
  message,
  retry,
  stale = false,
}: {
  message: string;
  retry: () => void;
  stale?: boolean;
}) {
  return (
    <Alert
      type={stale ? 'warning' : 'error'}
      showIcon
      title={stale ? '读取更新失败，当前显示上次取得的内容。' : '无法读取需求内容'}
      description={message}
      action={
        <Button size="small" onClick={retry}>
          重新读取
        </Button>
      }
    />
  );
}
function CurrentLinks({ projectId, links }: { projectId: string; links: CurrentLink[] }) {
  if (!links.length) return null;
  return (
    <ul className="requirement-related">
      {links.map((link, index) => {
        const target = link.target;
        const section =
          target.kind === 'overview'
            ? target.part.kind === 'product'
              ? 'product'
              : target.part.kind === 'examples_introduction'
                ? 'examples'
                : target.part.kind === 'example' || target.part.kind === 'example_diagram'
                  ? `example/${encodeURIComponent(target.part.id)}`
                  : target.part.kind === 'concept' || target.part.kind === 'concept_relation'
                    ? 'concepts'
                    : 'examples'
            : null;
        return (
          <li key={index}>
            {section ? (
              <Link to={`/projects/${encodeURIComponent(projectId)}/overview/${section}`}>
                查看对应综述
              </Link>
            ) : (
              <span className="requirement-meta">关联业务设计</span>
            )}
            <Markdown text={link.explanationMd} headingStart={4} />
          </li>
        );
      })}
    </ul>
  );
}
function RequirementList({
  projectId,
  name,
  status,
  setName,
  setStatus,
  onSelect,
}: {
  projectId: string;
  name: string;
  status: RequirementStatus | 'all';
  setName: (name: string) => void;
  setStatus: (status: RequirementStatus | 'all') => void;
  onSelect: () => void;
}) {
  const query = useInfiniteQuery(requirementsQuery(projectId, name, status));
  const data = query.data?.pages[0];
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <article className="requirements-reading ds-prose">
      <header className="requirements-heading">
        <div className="requirements-title-row">
          <h1>需求推进</h1>
          <Refresh projectId={projectId} busy={query.isFetching} />
        </div>
        {data && (
          <p className="requirement-meta">
            {data.project.name} · 项目版本 {data.project.version}
          </p>
        )}
      </header>
      <div className="requirements-filters">
        <Input.Search
          aria-label="搜索需求"
          placeholder="搜索需求"
          allowClear
          defaultValue={name}
          onSearch={(value) => setName(value.trim())}
        />
        <Select<RequirementStatus | 'all'>
          virtual={false}
          aria-label="按需求状态筛选"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: '全部状态' },
            ...Object.entries(requirementStatusLabels).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      {query.isPending ? (
        <Skeleton active />
      ) : !data ? (
        <>
          <Failure
            message={query.error?.message ?? '暂时无法读取项目。'}
            retry={() => void query.refetch()}
          />
          <Button onClick={onSelect}>选择其他项目</Button>
        </>
      ) : (
        <>
          {query.isError && (
            <Failure stale message={query.error.message} retry={() => void query.refetch()} />
          )}
          <List
            rowKey="id"
            dataSource={items}
            locale={{
              emptyText: (
                <div className="requirements-empty">
                  <p>{name || status !== 'all' ? '没有匹配的需求' : '还没有需求'}</p>
                  {!name && status === 'all' && (
                    <>
                      <p>让 Agent 在阶段回顾后整理需求和推进记录，保存到 CoSeed。</p>
                      <Link to="/agent-guide">查看 Agent 接入说明</Link>
                    </>
                  )}
                </div>
              ),
            }}
            renderItem={(item) => (
              <List.Item>
                <Link className="requirement-list-row" to={requirementsPath(projectId, item.id)}>
                  <div className="requirement-list-title">
                    <span>{item.title}</span>
                    <StatusTag status={item.status} />
                  </div>
                  <span className="requirement-meta">
                    {item.recordCount} 条推进记录 · 更新于 {date(item.savedAt)}
                  </span>
                </Link>
              </List.Item>
            )}
          />
          {query.hasNextPage && (
            <Button
              className="requirements-more"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              更多需求
            </Button>
          )}
        </>
      )}
    </article>
  );
}
function ProgressRecords({
  projectId,
  requirementId,
  version,
  onInspect,
}: {
  projectId: string;
  requirementId: string;
  version: number;
  onInspect: (target: Inspection) => void;
}) {
  const query = useInfiniteQuery(recordsQuery(projectId, requirementId, version));
  if (query.isPending) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (!query.data)
    return (
      <Failure
        message={query.error?.message ?? '无法读取推进记录。'}
        retry={() => void query.refetch()}
      />
    );
  const records = query.data.pages.flatMap((page) => page.items);
  return (
    <>
      {query.isError && (
        <Failure stale message={query.error.message} retry={() => void query.refetch()} />
      )}
      {!records.length ? (
        <p className="requirement-meta">还没有推进记录。</p>
      ) : (
        <Timeline
          className="requirements-timeline"
          items={records.map((record) => ({
            key: record.id,
            color: 'var(--ds-color-accent-solid)',
            content: (
              <article className="progress-record" aria-label={record.content.title}>
                <h3>{record.content.title}</h3>
                <p className="requirement-meta">收录于 {date(record.createdAt)}</p>
                <p className="requirement-meta">
                  {record.content.occurredAt === null
                    ? '发生时间未知'
                    : `发生于 ${date(record.content.occurredAt)}`}
                  {record.revisionNo > 1
                    ? ` · 第 ${record.revisionNo} 版，修订于 ${date(record.savedAt)}`
                    : ''}
                </p>
                <Markdown text={record.content.markdown} headingStart={4} />
                <div className="progress-record-actions">
                  <Button
                    type="link"
                    size="small"
                    onClick={() => onInspect({ type: 'record', id: record.id })}
                  >
                    修订历史与来源
                  </Button>
                </div>
                <RelatedRecords links={record.links} onInspect={onInspect} />
              </article>
            ),
          }))}
        />
      )}
      {query.hasNextPage && (
        <Button
          className="requirements-more"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          更早的记录
        </Button>
      )}
    </>
  );
}
function RequirementDetail({
  projectId,
  requirementId,
  onSelect,
}: {
  projectId: string;
  requirementId: string;
  onSelect: () => void;
}) {
  const query = useQuery(requirementQuery(projectId, requirementId));
  const [inspection, setInspection] = useState<(Inspection & { version: number }) | null>(null);
  const data = query.data;
  if (query.isPending)
    return (
      <div className="requirements-reading">
        <Skeleton active />
      </div>
    );
  if (!data)
    return (
      <div className="requirements-reading">
        <Link to={requirementsPath(projectId)}>返回需求列表</Link>
        <Failure
          message={query.error?.message ?? '无法读取需求。'}
          retry={() => void query.refetch()}
        />
        <Button onClick={onSelect}>选择其他项目</Button>
      </div>
    );
  const inspect = (target: Inspection) =>
    setInspection({ ...target, version: data.project.version });
  const requirement = data.requirement;
  return (
    <article className="requirements-reading ds-prose">
      <Link className="requirement-back" to={requirementsPath(projectId)}>
        <ArrowLeftIcon className="ds-icon" size={foundations.size.icon} aria-hidden="true" />
        需求列表
      </Link>
      <header className="requirements-heading">
        <div className="requirements-title-row">
          <h1>{requirement.content.title}</h1>
          <Refresh projectId={projectId} busy={query.isFetching} />
        </div>
        <div className="requirement-current-status">
          <StatusTag status={requirement.content.status} />
          <span className="requirement-meta">状态更新于 {date(data.statusChangedAt)}</span>
        </div>
        <p className="requirement-meta">
          {data.project.name} · 项目版本 {data.project.version}
        </p>
        {query.isError && (
          <Failure stale message={query.error.message} retry={() => void query.refetch()} />
        )}
      </header>
      <section className="requirement-description">
        <h2>需求说明</h2>
        <Markdown text={requirement.content.markdown} />
        <Button
          type="link"
          size="small"
          onClick={() => inspect({ type: 'requirement', id: requirement.id })}
        >
          需求修订与状态依据
        </Button>
        <CurrentLinks projectId={projectId} links={requirement.links} />
      </section>
      <section aria-label="推进记录">
        <div className="requirements-section-title">
          <h2>推进记录</h2>
          <span className="requirement-meta">{data.recordCount} 条 · 最新收录在前</span>
        </div>
        <ProgressRecords
          key={data.project.version}
          projectId={projectId}
          requirementId={requirementId}
          version={data.project.version}
          onInspect={inspect}
        />
      </section>
      {inspection && (
        <HistoryReader
          key={`${inspection.type}:${inspection.id}:${inspection.revisionNo ?? 'all'}:${inspection.version}`}
          projectId={projectId}
          version={inspection.version}
          target={inspection}
          onClose={() => setInspection(null)}
        />
      )}
    </article>
  );
}
export default function RequirementsPage({ onSelect }: { onSelect: () => void }) {
  const { projectId = '', requirementId } = useParams();
  const [name, setName] = useState('');
  const [status, setStatus] = useState<RequirementStatus | 'all'>('all');
  return (
    <div className="requirements-page">
      {requirementId ? (
        <RequirementDetail
          key={`${projectId}:${requirementId}`}
          projectId={projectId}
          requirementId={requirementId}
          onSelect={onSelect}
        />
      ) : (
        <RequirementList
          projectId={projectId}
          name={name}
          status={status}
          setName={setName}
          setStatus={setStatus}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
