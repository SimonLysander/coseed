import { useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Select, Skeleton, Space } from 'antd';
import { Link, useParams } from 'react-router';
import { agentGuidePath } from '../projects/queries.js';
import { RefreshCwIcon } from '@animateicons/react/lucide/refresh-cw-icon';
import { ArrowLeftIcon } from '@animateicons/react/lucide/arrow-left-icon';
import { Markdown } from '../reading/Markdown.js';
import { foundations } from '../design-system/tokens.js';
import {
  requirementStatusLabels,
  requirementConcernLabels,
  type RequirementConcern,
  type RequirementStatus,
} from '../../contracts/content/requirements.js';
import { recordsQuery, requirementQuery, requirementsPath, requirementsQuery } from './queries.js';
import { HistoryReader, type Inspection } from './HistoryReader.js';
import { ConcernTag } from './ConcernTag.js';
import { StatusTag, date } from './StatusTag.js';
import { RecordTimeline } from './timeline/RecordTimeline.js';
import { RequirementTimeline } from './timeline/RequirementTimeline.js';
import './requirements.css';

function Refresh({ projectId, busy }: { projectId: string; busy: boolean }) {
  const queries = useQueryClient();
  return (
    <Button
      type="text"
      aria-label="刷新时间线"
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
      title={stale ? '读取更新失败，当前显示上次取得的内容。' : '无法读取时间线内容'}
      description={message}
      action={
        <Button size="small" onClick={retry}>
          重新读取
        </Button>
      }
    />
  );
}
function RequirementsIndex({
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
  const [scope, setScope] = useState('all');
  const [concern, setConcern] = useState<RequirementConcern | 'all' | 'unclassified'>('all');
  const [draft, setDraft] = useState(name);
  const filtered = Boolean(name || status !== 'all' || scope !== 'all' || concern !== 'all');
  const query = useInfiniteQuery(requirementsQuery(projectId, name, status, scope, concern));
  const data = query.data?.pages[0];
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <article className="requirements-reading ds-prose">
      <header className="requirements-heading">
        <div className="requirements-title-row">
          <h1>时间线</h1>
          <Refresh projectId={projectId} busy={query.isFetching} />
        </div>
        {data && <p className="requirement-meta">{data.project.name}</p>}
      </header>
      <div className="requirements-filters" role="search" aria-label="筛选目标">
        <Input.Search
          aria-label="搜索目标"
          placeholder="搜索目标"
          allowClear
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (!event.target.value) setName('');
          }}
          onSearch={(value) => setName(value.trim())}
        />
        <div className="requirements-filter-options">
          <Select<RequirementStatus | 'all'>
            virtual={false}
            aria-label="按目标状态筛选"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: '全部状态' },
              ...Object.entries(requirementStatusLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <Select
            virtual={false}
            aria-label="按涉及范围筛选"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: '全部范围' },
              ...(data?.filters.scopes ?? []),
              ...(data?.filters.hasUnclassified
                ? [{ value: 'unclassified', label: '范围未填写' }]
                : []),
            ]}
          />
          <Select<RequirementConcern | 'all' | 'unclassified'>
            virtual={false}
            aria-label="按主要关注点筛选"
            value={concern}
            onChange={setConcern}
            options={[
              { value: 'all', label: '全部关注点' },
              ...Object.entries(requirementConcernLabels).map(([value, label]) => ({
                value,
                label,
              })),
              ...(data?.filters.hasUnclassified
                ? [{ value: 'unclassified', label: '关注点未填写' }]
                : []),
            ]}
          />
        </div>
      </div>
      <div className="requirements-list-context">
        <p className="requirement-meta">按目标创建时间排列，最新在前</p>
        {filtered && (
          <Button
            type="link"
            size="small"
            onClick={() => {
              setName('');
              setDraft('');
              setStatus('all');
              setScope('all');
              setConcern('all');
            }}
          >
            清除筛选
          </Button>
        )}
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
          {items.length ? (
            <>
              <RequirementTimeline projectId={projectId} requirements={items} />
            </>
          ) : (
            <div className="requirements-empty">
              <p>{filtered ? '没有匹配的目标' : '还没有目标'}</p>
              {!filtered && (
                <>
                  <p>阶段回顾时，可让 Agent 保存目标，并在每项目标下记录进展。</p>
                  <Link to={agentGuidePath(projectId)}>查看接入指南</Link>
                </>
              )}
            </div>
          )}
          {query.hasNextPage && (
            <Button
              className="requirements-more"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              更多目标
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
        message={query.error?.message ?? '无法读取进展记录。'}
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
        <p className="requirement-meta">还没有进展记录。</p>
      ) : (
        <RecordTimeline records={records} onInspect={onInspect} />
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
        <Link to={requirementsPath(projectId)}>返回时间线</Link>
        <Failure
          message={query.error?.message ?? '无法读取目标。'}
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
        时间线
      </Link>
      <header className="requirements-heading">
        <div className="requirements-title-row">
          <h1>{requirement.content.title}</h1>
          <Refresh projectId={projectId} busy={query.isFetching} />
        </div>
        <div className="requirement-current-status">
          <StatusTag status={requirement.content.status} />
          <ConcernTag concern={requirement.content.primaryConcern} />
          {data.scopeNames.length > 0 && (
            <span className="requirement-meta">{data.scopeNames.join('、')}</span>
          )}
          <span className="requirement-meta">状态更新于 {date(data.statusChangedAt)}</span>
        </div>
        <p className="requirement-meta">{data.project.name}</p>
        <div className="requirement-times requirement-meta">
          <span>
            首次收录于{' '}
            <time dateTime={new Date(requirement.createdAt).toISOString()}>
              {date(requirement.createdAt)}
            </time>
          </span>
          <span>
            最近更新于{' '}
            <time dateTime={new Date(requirement.savedAt).toISOString()}>
              {date(requirement.savedAt)}
            </time>
          </span>
        </div>
        {query.isError && (
          <Failure stale message={query.error.message} retry={() => void query.refetch()} />
        )}
      </header>
      <section className="requirement-description">
        <h2>目标说明</h2>
        <Markdown text={requirement.content.markdown} />
      </section>
      <section aria-label="进展记录">
        <div className="requirements-section-title">
          <h2>进展记录</h2>
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
        <RequirementsIndex
          key={projectId}
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
