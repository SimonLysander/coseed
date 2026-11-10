import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, Dropdown } from 'antd';
import { CopyIcon } from '@animateicons/react/lucide/copy-icon';
import { foundations } from '../design-system/tokens.js';
import { guideHref, guideSections, guideText, guideTitle } from './guide-content.js';
import '../reading/reading.css';
import './agent-guide.css';

export default function AgentGuidePage() {
  const [active, setActive] = useState(guideSections[0]!.id);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    let frame = 0;
    const updateActive = () => {
      const offset =
        window.innerWidth < foundations.layout.breakpoint.tablet
          ? foundations.size.coarsePointerTarget +
            2 * foundations.space['4'] +
            foundations.layout.mobilePagePadding
          : foundations.layout.pagePadding;
      const visible = guideSections.filter(
        ({ id }) =>
          (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= offset,
      );
      const atEnd =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      setActive((atEnd ? guideSections.at(-1) : visible.at(-1))?.id ?? guideSections[0]!.id);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActive);
    };
    const jumpToHash = () => {
      const id = window.location.hash.split('/')[2];
      const section = guideSections.find((item) => item.id === id);
      if (section) {
        document.getElementById(section.id)?.scrollIntoView({ block: 'start' });
        setActive(section.id);
      }
    };
    frame = requestAnimationFrame(() => {
      jumpToHash();
      updateActive();
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('hashchange', jumpToHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('hashchange', jumpToHash);
    };
  }, []);

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyGuide() {
    try {
      await navigator.clipboard.writeText(guideText);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <div className="guide-page">
      <div className="ds-reading-layout guide-layout">
        <article className="ds-prose guide-article" aria-labelledby="agent-guide-title">
          <header className="guide-heading">
            <div className="guide-title-row">
              <h1 id="agent-guide-title">{guideTitle}</h1>
              <div className="guide-actions">
                <div className="guide-mobile-tools">
                  <Dropdown
                    trigger={['click']}
                    placement="bottomRight"
                    menu={{
                      selectedKeys: [active],
                      items: guideSections.map(({ id, title }) => ({
                        key: id,
                        label: <a href={guideHref(id)}>{title}</a>,
                      })),
                    }}
                  >
                    <Button type="text" aria-label="打开阅读目录">
                      目录
                    </Button>
                  </Dropdown>
                </div>
                <Button
                  className="guide-copy"
                  icon={
                    <CopyIcon
                      className="ds-icon"
                      size={foundations.size.icon}
                      isAnimated={false}
                      aria-hidden="true"
                    />
                  }
                  onClick={() => void copyGuide()}
                >
                  {copyState === 'copied' ? '已复制' : '复制说明'}
                </Button>
              </div>
            </div>
            <p className="guide-lead">
              理解任务、连接项目、整理内容、保存核对。人和 Agent 共用这一篇指南。
            </p>
            <Link to="/writing-guide/overview">核对历史约定及出处</Link>
            {copyState === 'copied' && (
              <span className="guide-copy-result" role="status">
                已复制接入说明全文
              </span>
            )}
            {copyState === 'failed' && (
              <span className="guide-copy-error" role="alert">
                复制失败，请允许剪贴板访问或手动选择正文复制。
              </span>
            )}
          </header>
          {guideSections.map(({ id, headingId, html }) => (
            <section
              key={id}
              id={id}
              className="reading-markdown guide-section"
              aria-labelledby={headingId}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ))}
          <p className="guide-endnote">
            MCP 的 usage 返回本文全文，其他主题提取相应章节；实际 Agent
            的规范遵循和自动落盘仍需单独验证。
          </p>
        </article>
        <aside className="ds-toc guide-toc" aria-label="阅读目录">
          <p>本页目录</p>
          <nav aria-label="文章章节">
            {guideSections.map(({ id, title }, index) => (
              <a
                key={id}
                href={guideHref(id)}
                aria-current={active === id ? 'location' : undefined}
              >
                <span aria-hidden="true">{index + 1}</span>
                {title}
              </a>
            ))}
          </nav>
          <span className="guide-toc-note">按顺序阅读即可</span>
        </aside>
      </div>
    </div>
  );
}
