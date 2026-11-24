import { useEffect, useState } from 'react';
import { Button, Dropdown } from 'antd';
import { useParams } from 'react-router';
import { ChapterHeading } from '../reading/ChapterHeading.js';
import { Markdown } from '../reading/Markdown.js';
import { agentGuidePath } from '../projects/queries.js';
import { ProjectConnection } from './ProjectConnection.js';
import { WritingGuideResource } from './WritingGuideResource.js';
import { foundations } from '../design-system/tokens.js';
import {
  connectionStepId,
  guideIntroduction,
  guideSteps,
  writingGuidePath,
} from './guide-content.js';
import '../reading/reading.css';
import './agent-guide.css';

export default function AgentGuidePage({
  projectId,
  name,
  onSelect,
}: {
  projectId: string | null;
  name: string | undefined;
  onSelect: () => void;
}) {
  const basePath = agentGuidePath(projectId);
  const { '*': route = '' } = useParams();
  // Published writing-guide bookmarks now open the Markdown resource.
  const legacyReference = /^(?:reference(?:\/|$)|guide-section-[345]$|chapter-[1267]$)/.test(route);
  const sectionId = route === 'guide-section-7' ? 'guide-section-6' : route;
  const guideHref = (id: string) => '#' + basePath + '/' + id;
  const [active, setActive] = useState(guideSteps[0]!.id);

  useEffect(() => {
    let frame = 0;
    const updateActive = () => {
      const offset =
        window.innerWidth < foundations.layout.breakpoint.tablet
          ? foundations.size.coarsePointerTarget +
            2 * foundations.space['4'] +
            foundations.layout.mobilePagePadding
          : foundations.layout.pagePadding;
      const visible = guideSteps.filter(
        ({ id }) =>
          (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= offset,
      );
      const atEnd =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      setActive((atEnd ? guideSteps.at(-1) : visible.at(-1))?.id ?? guideSteps[0]!.id);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActive);
    };
    frame = requestAnimationFrame(updateActive);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useEffect(() => {
    if (legacyReference) {
      window.location.replace(writingGuidePath);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const target = guideSteps.find(({ id }) => id === sectionId);
      if (target) {
        document.getElementById(target.id)?.scrollIntoView({ block: 'start' });
      } else {
        window.scrollTo(0, 0);
      }
      setActive(target?.id ?? guideSteps[0]!.id);
    });
    return () => cancelAnimationFrame(frame);
  }, [sectionId, legacyReference]);

  if (legacyReference) return null;
  return (
    <div className="guide-page">
      <div className="ds-reading-layout guide-layout">
        <article className="ds-prose guide-article" aria-labelledby="agent-guide-title">
          <header className="guide-heading">
            <div className="guide-title-row">
              <h1 id="agent-guide-title">接入指南</h1>
              <div className="guide-mobile-tools">
                <Dropdown
                  trigger={['click']}
                  placement="bottomRight"
                  menu={{
                    selectedKeys: [active],
                    items: guideSteps.map(({ id, title }) => ({
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
            </div>
            <div className="guide-lead">
              <Markdown text={guideIntroduction} />
            </div>
            <WritingGuideResource />
          </header>
          {guideSteps.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className="guide-section"
              aria-label={section.title}
            >
              <ChapterHeading number={index + 1} title={section.title} />
              <Markdown text={section.body} />
              {section.id === connectionStepId && (
                <ProjectConnection projectId={projectId} name={name} onSelect={onSelect} />
              )}
              {section.afterConnection && <Markdown text={section.afterConnection} />}
              {section.note && <blockquote className="guide-note">{section.note}</blockquote>}
            </section>
          ))}
        </article>
        <aside className="ds-toc guide-toc" aria-label="阅读目录">
          <p>本页目录</p>
          <nav aria-label="文章章节">
            {guideSteps.map(({ id, title }, index) => (
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
        </aside>
      </div>
    </div>
  );
}
