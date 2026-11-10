import { lazy, Suspense, useMemo } from 'react';
import { Alert, Button, List, Skeleton, Space } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { RefreshCwIcon } from '@animateicons/react/lucide/refresh-cw-icon';
import { businessPath, businessIndexQuery, businessDiagramQuery } from './queries.js';
import { overviewQuerySchema } from '../../contracts/projects-http.js';
import { businessModel } from './graph/model.js';
import { foundations } from '../design-system/tokens.js';
import './business.css';
const Canvas = lazy(() => import('./graph/BusinessCanvas.js'));
function DiagramPage({
  projectId,
  diagramId,
  version,
}: {
  projectId: string;
  diagramId: string;
  version?: number;
}) {
  const query = useQuery(businessDiagramQuery(projectId, diagramId, version));
  const navigate = useNavigate(),
    queries = useQueryClient();
  const data = query.data;
  const model = useMemo(
    () => (data ? businessModel(data) : null),
    [
      data?.bundle.entities,
      data?.bundle.relationships,
      data?.bundle.notes,
      data?.bundle.diagrams,
      data?.sourcePaths,
      data?.diagram.scopeName,
    ],
  );
  if (query.isPending) return <Skeleton active />;
  if (!data || !model)
    return (
      <>
        <Alert
          type="error"
          title="无法打开业务设计图"
          description={query.error?.message}
          action={<Button onClick={() => void query.refetch()}>重新读取</Button>}
        />
        <Link to={businessPath(projectId)}>返回图纸列表</Link>
      </>
    );
  const open = (id: string) => navigate(businessPath(projectId, id, data.project.version));
  return (
    <>
      <header className="business-heading">
        <div className="business-breadcrumb">
          <Link to={businessPath(projectId, undefined, version)}>业务设计</Link>
          <span>/</span>
          <span>{data.diagram.scopeName}</span>
        </div>
        <div className="business-title-row">
          <h1>{data.diagram.title}</h1>
          <Space wrap>
            {data.diagram.scope.kind === 'module' && data.projectDiagrams.length === 1 && (
              <Button onClick={() => open(data.projectDiagrams[0]!.id)}>返回全景</Button>
            )}
            {version !== undefined ? (
              <Button onClick={() => navigate(businessPath(projectId, diagramId))}>
                查看当前版本
              </Button>
            ) : (
              <Button
                type="text"
                aria-label="刷新业务设计"
                loading={query.isFetching}
                icon={<RefreshCwIcon className="ds-icon" size={foundations.size.icon} />}
                onClick={() =>
                  void queries.invalidateQueries({ queryKey: ['projects', projectId] })
                }
              >
                刷新
              </Button>
            )}
          </Space>
        </div>
        <p className="business-meta">
          {data.project.name} · 项目版本 {data.project.version}
          {version === undefined ? '' : ' · 固定版本'}
        </p>
        {query.isError && (
          <Alert
            type="warning"
            title="读取更新失败，以下仍为上次取得的项目版本。"
            description={query.error.message}
            action={<Button onClick={() => void query.refetch()}>重新读取</Button>}
          />
        )}
      </header>
      <Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
        <Canvas model={model} moduleDiagrams={data.moduleDiagrams} onOpen={open} />
      </Suspense>
    </>
  );
}
function IndexPage({
  projectId,
  version,
  onSelect,
}: {
  projectId: string;
  version?: number;
  onSelect: () => void;
}) {
  const query = useQuery(businessIndexQuery(projectId, version));
  if (query.isPending) return <Skeleton active />;
  if (!query.data)
    return (
      <Alert
        type="error"
        title="无法读取业务设计"
        description={query.error?.message}
        action={
          <Space>
            <Button onClick={() => void query.refetch()}>重新读取</Button>
            <Button onClick={onSelect}>选择其他项目</Button>
          </Space>
        }
      />
    );
  const data = query.data;
  if (data.landingDiagramId)
    return <Navigate replace to={businessPath(projectId, data.landingDiagramId, version)} />;
  return (
    <div className="business-index ds-prose">
      <h1>业务设计</h1>
      <p className="business-meta">
        {data.project.name} · 项目版本 {data.project.version}
      </p>
      {query.isError && (
        <Alert
          type="warning"
          title="刷新失败，以下为上次读取的图纸清单。"
          description={query.error.message}
        />
      )}
      {data.diagrams.length ? (
        <List
          rowKey="id"
          dataSource={data.diagrams}
          renderItem={(diagram) => (
            <List.Item>
              <Link to={businessPath(projectId, diagram.id, data.project.version)}>
                {diagram.title}
                <span className="business-meta">
                  {diagram.scope.kind === 'project' ? '项目全景' : diagram.scopeName}
                </span>
              </Link>
            </List.Item>
          )}
        />
      ) : (
        <div className="business-empty">
          <h2>还没有业务设计图</h2>
          <p>让 Agent 根据项目事实整理模块、内部组成和关系，再通过 CoSeed MCP 保存。</p>
          <Link to="/agent-guide">查看 Agent 接入说明</Link>
        </div>
      )}
      <Button loading={query.isFetching} onClick={() => void query.refetch()}>
        刷新图纸
      </Button>
    </div>
  );
}
export default function BusinessPage({ onSelect }: { onSelect: () => void }) {
  const { projectId = '', diagramId } = useParams();
  const [search] = useSearchParams();
  const parsed = overviewQuerySchema.safeParse(
    search.has('version') ? { version: search.get('version') } : {},
  );
  if (!parsed.success)
    return (
      <div className="business-page">
        <Alert type="error" title="项目版本无效" />
        <Link to={businessPath(projectId)}>查看当前业务设计</Link>
      </div>
    );
  return (
    <div className="business-page">
      {diagramId ? (
        <DiagramPage
          projectId={projectId}
          diagramId={diagramId}
          {...(parsed.data.version === undefined ? {} : { version: parsed.data.version })}
        />
      ) : (
        <IndexPage
          projectId={projectId}
          {...(parsed.data.version === undefined ? {} : { version: parsed.data.version })}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
