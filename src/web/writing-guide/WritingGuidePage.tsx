import { useEffect } from 'react';
import { Anchor, Button, Dropdown, Menu, Table } from 'antd';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Markdown } from '../reading/Markdown.js';
import { foundations } from '../design-system/tokens.js';
import { writingTopics, writingPath, writingBasis, type Agreement } from './content.js';
import './writing-guide.css';

function Evidence({
  agreement,
  showExcerpt = true,
}: {
  agreement: Agreement;
  showExcerpt?: boolean;
}) {
  return (
    <div className="writing-evidence">
      <p>{agreement.source.label}</p>
      {'file' in agreement.source && <code>{agreement.source.file}</code>}
      <p>
        {agreement.source.kind === 'conversation'
          ? '以下保留可见用户原话；原话中的提问、修正和口语不作为规范正文。'
          : '以下保留文档记录，原始确认尚待核对；不将文档提案自动认定为用户定论。'}
      </p>
      {showExcerpt && (
        <blockquote>
          <Markdown text={agreement.excerpt} />
        </blockquote>
      )}
      {showExcerpt && 'editorialNote' in agreement && <p>核对说明：{agreement.editorialNote}</p>}
    </div>
  );
}
export default function WritingGuidePage() {
  const { topic: topicId = 'overview' } = useParams();
  const topic = writingTopics.find((item) => item.id === topicId);
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(location.pathname);
      if (target) target.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);
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
          <span>历史约定及出处</span>
        </div>
        <div className="writing-page-title">
          <h1>历史约定及出处</h1>
          <span className="writing-review-label">核对资料</span>
        </div>
        <p>这里只保留历史摘录供核对。接入和写作正文已统一在 Agent 指南，不在此维护第二份规范。</p>
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
            {topic.sections.map((section) => (
              <section
                key={section.id}
                id={writingPath(topic.id, section.id)}
                className="writing-section"
              >
                <h2>{section.title}</h2>
                <Table<Agreement>
                  className="writing-review-table"
                  rowKey="id"
                  pagination={false}
                  size="small"
                  dataSource={section.agreements}
                  columns={[
                    {
                      title: '原始摘录',
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
                          <p className="writing-basis">{writingBasis([agreement])}</p>
                          <Evidence agreement={agreement} showExcerpt={false} />
                          {'editorialNote' in agreement && (
                            <p className="writing-replacement">
                              核对说明：{agreement.editorialNote}
                            </p>
                          )}
                        </>
                      ),
                    },
                  ]}
                />
              </section>
            ))}
            <section
              className="writing-section writing-questions"
              id={writingPath(topic.id, 'questions')}
            >
              <h2>待核对</h2>
              <ul>
                {topic.questions.map((question) => (
                  <li key={question}>
                    {question}
                    {question.includes('当前 MCP read_guide 仍使用原有简版') && (
                      <p>进度更正：接入和写作指南现已同源，这条保留为原审阅稿记录，不再是待办。</p>
                    )}
                  </li>
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
          <Anchor
            affix={false}
            items={sections}
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
