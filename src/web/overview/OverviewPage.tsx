import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { Alert, Anchor, Button, Dropdown, Skeleton, Space } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { RefreshCwIcon } from '@animateicons/react/lucide/refresh-cw-icon';
import { overviewQuery, projectPath } from '../projects/queries.js';
import { Markdown } from '../reading/Markdown.js';
import { ChapterHeading } from '../reading/ChapterHeading.js';
import { foundations } from '../design-system/tokens.js';
import { conceptsModel, useCaseModel } from './diagrams/model.js';
import type { DiagramModel } from './diagrams/model.js';
import './overview.css';

const Canvas = lazy(() =>
  import('./diagrams/OverviewDiagram.js').then((module) => ({ default: module.OverviewDiagram })),
);
function OverviewDiagram(props: { model: DiagramModel; label: string }) {
  return (
    <Suspense
      fallback={
        <div className="overview-diagram-placeholder" role="status">
          <Skeleton active title={false} paragraph={{ rows: 2 }} />
        </div>
      }
    >
      <Canvas {...props} />
    </Suspense>
  );
}

export default function OverviewPage({ onSelect }: { onSelect: () => void }) {
  const { projectId = '' } = useParams();
  const query = useQuery(overviewQuery(projectId));
  const queries = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const lastPath = useRef('');
  const data = query.data;
  const content = data?.overview?.content;
  const conceptGraph = useMemo(
    () => (content ? conceptsModel(content.concepts) : null),
    [content?.concepts],
  );
  const exampleGraphs = useMemo(
    () =>
      content
        ? content.examples.sections.map((section) =>
            useCaseModel(content.examples, section.diagram.useCaseIds, data!.project.name),
          )
        : [],
    [content?.examples, data?.project.name],
  );
  const graphs = useMemo(
    () => (conceptGraph ? { concepts: conceptGraph, examples: exampleGraphs } : null),
    [conceptGraph, exampleGraphs],
  );
  const base = projectPath(projectId);
  const id = (section: string) => `${base}/${section}`;
  const sections = [
    { key: 'product', title: '产品说明', href: `#${id('product')}` },
    { key: 'concepts', title: '核心概念', href: `#${id('concepts')}` },
    {
      key: 'examples',
      title: '使用示例',
      href: `#${id('examples')}`,
      children:
        content?.examples.sections.map((section) => ({
          key: `example:${section.id}`,
          title: section.title,
          href: `#${id(`example/${encodeURIComponent(section.id)}`)}`,
        })) ?? [],
    },
  ];
  const contents = sections.map((section, index) => ({
    ...section,
    title: (
      <span className="overview-toc-chapter">
        <span className="overview-toc-number" aria-hidden="true">
          {index + 1}
        </span>
        {section.title}
      </span>
    ),
  }));
  useEffect(() => {
    if (!data || lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(location.pathname);
      if (target) target.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, location.pathname]);

  if (query.isPending)
    return (
      <div className="overview-page">
        <Skeleton active title paragraph={{ rows: 6 }} />
      </div>
    );
  if (!data)
    return (
      <section className="empty-page">
        <h1>暂时无法打开项目</h1>
        <p className="empty-description">{query.error?.message ?? '没有取得项目资料。'}</p>
        <Space className="project-welcome-actions">
          <Button onClick={() => void query.refetch()}>重新读取</Button>
          <Button onClick={onSelect}>选择其他项目</Button>
        </Space>
      </section>
    );
  if (!content || !graphs)
    return (
      <section className="empty-page">
        <h1>{data.project.name}</h1>
        <p className="empty-description">
          {query.isError ? '上次读取时尚无项目综述' : '还没有项目综述'}
        </p>
        <p className="empty-note">
          让 Agent 通过 CoSeed MCP 梳理项目，并保存产品说明、核心概念和使用示例。
        </p>
        {query.isError && (
          <Alert
            type="warning"
            showIcon
            title="刷新失败，当前为上次读取的项目状态。"
            description={query.error.message}
          />
        )}
        <Space className="project-welcome-actions">
          <Button onClick={() => void query.refetch()} loading={query.isFetching}>
            刷新内容
          </Button>
          <Link to="/agent-guide">查看 Agent 接入说明</Link>
        </Space>
      </section>
    );

  return (
    <div className="overview-page">
      <div className="ds-reading-layout">
        <article className="ds-prose overview-article">
          <header className="overview-heading">
            <div className="overview-title-row">
              <h1>{data.project.name}</h1>
              <div className="overview-actions">
                <div className="overview-mobile-toc">
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: sections.map((section) => ({
                        key: section.key,
                        label: section.title,
                      })),
                      onClick: ({ key }) => navigate(id(key)),
                    }}
                  >
                    <Button type="text" aria-label="打开阅读目录">
                      目录
                    </Button>
                  </Dropdown>
                </div>
                <Button
                  type="text"
                  aria-label="刷新项目综述"
                  loading={query.isFetching}
                  icon={
                    <RefreshCwIcon
                      className="ds-icon"
                      size={foundations.size.icon}
                      aria-hidden="true"
                    />
                  }
                  onClick={() =>
                    void queries.invalidateQueries({ queryKey: ['projects', projectId] })
                  }
                >
                  刷新
                </Button>
              </div>
            </div>
            <p className="overview-meta">
              项目综述<span>项目版本 {data.project.version}</span>
              <span>
                保存于{' '}
                {new Intl.DateTimeFormat('zh-CN', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(data.overview!.savedAt)}
              </span>
            </p>
            {query.isError && (
              <Alert
                type="warning"
                showIcon
                title={`读取更新失败，当前显示上次取得的版本 ${data.project.version}。`}
                description={query.error.message}
                action={
                  <Button size="small" onClick={() => void query.refetch()}>
                    重新读取
                  </Button>
                }
              />
            )}
          </header>
          <section id={id('product')} className="overview-section">
            <ChapterHeading number={1} title="产品说明" />
            <Markdown text={content.product.markdown} />
          </section>
          <section id={id('concepts')} className="overview-section">
            <ChapterHeading number={2} title="核心概念" />
            {content.concepts.entries.length ? (
              <>
                <OverviewDiagram model={graphs.concepts} label="核心概念关系图" />
                <dl className="overview-concepts">
                  {content.concepts.entries.map((entry) => (
                    <div key={entry.id}>
                      <dt>{entry.name}</dt>
                      <dd>
                        <Markdown text={entry.descriptionMd} headingStart={4} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="overview-missing">尚未整理核心概念。</p>
            )}
          </section>
          <section id={id('examples')} className="overview-section">
            <ChapterHeading number={3} title="使用示例" />
            {content.examples.introductionMd && <Markdown text={content.examples.introductionMd} />}
            {content.examples.sections.length ? (
              content.examples.sections.map((section, index) => (
                <section
                  className="overview-example"
                  id={id(`example/${encodeURIComponent(section.id)}`)}
                  key={section.id}
                >
                  <h3>
                    <span className="overview-scene-label" aria-hidden="true">
                      场景 {index + 1}
                    </span>
                    <span>{section.title}</span>
                  </h3>
                  <OverviewDiagram
                    model={graphs.examples[index]!}
                    label={`${section.title}：用例图`}
                  />
                  <Markdown text={section.markdown} headingStart={4} />
                </section>
              ))
            ) : (
              <p className="overview-missing">尚未整理使用示例。</p>
            )}
          </section>
        </article>
        <aside className="ds-toc overview-toc" aria-label="本页目录">
          <p>本页目录</p>
          <Anchor
            affix={false}
            styles={{
              itemTitle: { whiteSpace: 'normal', textOverflow: 'clip', overflow: 'visible' },
            }}
            items={contents}
            targetOffset={foundations.layout.pagePadding}
            onClick={(event, link) => {
              event.preventDefault();
              if (link.href) navigate(link.href.slice(1));
            }}
          />
        </aside>
      </div>
    </div>
  );
}
