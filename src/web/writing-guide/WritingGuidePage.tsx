import { useEffect, useState } from 'react';
import { Anchor, Button, Collapse, Dropdown, Menu, Segmented, Table } from 'antd';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Markdown } from '../reading/Markdown.js';
import { foundations } from '../design-system/tokens.js';
import { writingTopics, writingPath, type Agreement } from './content.js';
import './writing-guide.css';

function Evidence({ agreement }: { agreement: Agreement }) {
  return (
    <div className="writing-evidence">
      <p>{agreement.source.label}</p>
      {'file' in agreement.source && <code>{agreement.source.file}</code>}
      <p>
        {agreement.source.kind === 'conversation'
          ? '清单保留原始摘录；页面按 Markdown 排版，条目标题仅用于定位。'
          : '正文直接摘录该文档，不将现有文档记录等同于已逐条找回用户原话。'}
      </p>
    </div>
  );
}
export default function WritingGuidePage() {
  const { topic: topicId = 'overview' } = useParams();
  const topic = writingTopics.find((item) => item.id === topicId);
  const location = useLocation(),
    navigate = useNavigate();
  const [mode, setMode] = useState<'read' | 'review'>('read');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(location.pathname);
      if (target) target.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, mode]);
  if (!topic) return <Navigate replace to={writingPath()} />;
  const sections = topic.sections.map((section) => ({
    key: section.id,
    title: section.title,
    href: `#${writingPath(topic.id, section.id)}`,
  }));
  sections.push({
    key: 'questions',
    title: '待核对',
    href: `#${writingPath(topic.id, 'questions')}`,
  });
  const items = writingTopics.map((item) => ({ key: item.id, label: item.title }));
  return (
    <div className="writing-page">
      <header className="writing-page-heading">
        <div>
          <Link to="/agent-guide">Agent 接入</Link>
          <span className="writing-heading-separator">/</span>
          <span>内容编写规范</span>
        </div>
        <div className="writing-page-title">
          <h1>内容编写规范</h1>
          <span className="writing-review-label">审阅稿</span>
        </div>
        <p>按既有约定整理，供人和 Agent 共同阅读。本版尚未替换 Agent 指南。</p>
      </header>
      <div className="writing-layout">
        <nav className="writing-topic-nav" aria-label="规范主题">
          <Menu
            mode="inline"
            selectedKeys={[topic.id]}
            items={items}
            onClick={({ key }) => navigate(writingPath(key))}
          />
        </nav>
        <div className="writing-document">
          <div className="writing-document-tools">
            <Dropdown
              trigger={['click']}
              menu={{
                items,
                selectedKeys: [topic.id],
                onClick: ({ key }) => navigate(writingPath(key)),
              }}
            >
              <Button className="writing-mobile-topics">{topic.title} ▾</Button>
            </Dropdown>
            <Segmented
              aria-label="规范阅读方式"
              size="small"
              value={mode}
              options={[
                { label: '阅读', value: 'read' },
                { label: '核对约定', value: 'review' },
              ]}
              onChange={(value) => setMode(value as 'read' | 'review')}
            />
            <Dropdown
              trigger={['click']}
              menu={{
                items: sections.map((item) => ({ key: item.key, label: item.title })),
                onClick: ({ key }) => navigate(writingPath(topic.id, key)),
              }}
            >
              <Button type="text" className="writing-mobile-toc">
                目录
              </Button>
            </Dropdown>
          </div>
          <article aria-label={`${topic.title}编写规范`} className="ds-prose writing-article">
            <h2 className="writing-topic-title">{topic.title}</h2>
            <p className="writing-introduction">{topic.introduction}</p>
            {mode === 'read' ? (
              topic.sections.map((section) => (
                <section
                  key={section.id}
                  id={writingPath(topic.id, section.id)}
                  className="writing-section"
                >
                  <h2>{section.title}</h2>
                  {section.agreements.map((agreement) => (
                    <section
                      key={agreement.id}
                      className="writing-agreement"
                      data-agreement-id={agreement.id}
                    >
                      <h3>{agreement.title}</h3>
                      <Markdown text={agreement.excerpt} />
                      {'editorialNote' in agreement && (
                        <p className="writing-replacement">核对说明：{agreement.editorialNote}</p>
                      )}
                      <Collapse
                        ghost
                        size="small"
                        items={[
                          {
                            key: 'evidence',
                            label:
                              agreement.source.kind === 'conversation'
                                ? '核对用户原话出处'
                                : '核对文档出处',
                            children: <Evidence agreement={agreement} />,
                          },
                        ]}
                      />
                    </section>
                  ))}
                </section>
              ))
            ) : (
              <Table<Agreement>
                className="writing-review-table"
                rowKey="id"
                pagination={false}
                size="small"
                dataSource={topic.sections.flatMap((section) => section.agreements)}
                columns={[
                  {
                    title: '约定',
                    key: 'agreement',
                    render: (_, agreement) => (
                      <>
                        <strong>{agreement.title}</strong>
                        <Markdown text={agreement.excerpt} />
                      </>
                    ),
                  },
                  {
                    title: '出处及核对情况',
                    key: 'source',
                    width: 200,
                    render: (_, agreement) => (
                      <>
                        <Evidence agreement={agreement} />
                        {'editorialNote' in agreement && (
                          <p className="writing-replacement">核对说明：{agreement.editorialNote}</p>
                        )}
                      </>
                    ),
                  },
                ]}
              />
            )}
            <section
              className="writing-section writing-questions"
              id={writingPath(topic.id, 'questions')}
            >
              <h2>待核对</h2>
              <ul>
                {topic.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </section>
            <p className="writing-scope-note">
              本版依据当前可见对话和仓库文档整理，尚未完成历史全文核对。未取得的原话与未确认的细节保持缺口，不补成新规则。
            </p>
          </article>
        </div>
        <aside className="ds-toc writing-toc" aria-label="规范章节目录">
          <p>本页目录</p>
          {mode === 'read' ? (
            <Anchor
              affix={false}
              items={sections}
              targetOffset={foundations.layout.pagePadding}
              onClick={(event, link) => {
                event.preventDefault();
                if (link.href) navigate(link.href.slice(1));
              }}
            />
          ) : (
            <p>逐条核对摘录及出处；切换“阅读”返回正文。</p>
          )}
        </aside>
      </div>
    </div>
  );
}
