import React, { useState } from 'react';
import { Button, Drawer, Dropdown } from 'antd';
import { MenuIcon } from '@animateicons/react/lucide/menu-icon';
import { BookOpenIcon } from '@animateicons/react/lucide/book-open-icon';
import { HistoryIcon } from '@animateicons/react/lucide/history-icon';
import { GitBranchIcon } from '@animateicons/react/lucide/git-branch-icon';
import { SproutIcon } from '@animateicons/react/lucide/sprout-icon';
import { ArrowLeftIcon } from '@animateicons/react/lucide/arrow-left-icon';
import { foundations } from '../../../src/web/design-system/tokens.ts';
import { AppearanceSelect } from '../../../src/web/design-system/DesignSystemProvider.tsx';
import './reading-study.css';

const sections = [
  ['what', '项目是什么'],
  ['concepts', '核心概念'],
  ['usage', '如何使用'],
];

export function ReadingStudy() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [active, setActive] = useState('what');
  const navigation = (
    <nav className="study-nav" aria-label="项目导航">
      <a
        className="ds-nav-item study-nav-current"
        href="#what"
        title="项目综述"
        onClick={() => setDrawerOpen(false)}
      >
        <BookOpenIcon
          className="ds-icon"
          size={foundations.size.navIcon}
          isAnimated={false}
          aria-hidden="true"
        />
        <span>项目综述</span>
      </a>
      <span className="ds-nav-item" title="需求推进">
        <HistoryIcon
          className="ds-icon"
          size={foundations.size.navIcon}
          isAnimated={false}
          aria-hidden="true"
        />
        <span>需求推进</span>
      </span>
      <span className="ds-nav-item" title="业务设计">
        <GitBranchIcon
          className="ds-icon"
          size={foundations.size.navIcon}
          isAnimated={false}
          aria-hidden="true"
        />
        <span>业务设计</span>
      </span>
    </nav>
  );
  return (
    <div className="reading-study">
      <aside className="study-sidebar">
        <a className="study-wordmark" href="#what" aria-label="CoSeed 首页">
          <span className="study-wordmark-name">
            CoSeed<span>.</span>
          </span>
          <SproutIcon
            className="ds-icon study-rail-brand"
            size={foundations.size.brandIcon}
            isAnimated={false}
            aria-hidden="true"
          />
        </a>
        <p className="study-project">项目认知工作台</p>
        {navigation}
        <a
          className="ds-nav-item study-back"
          href="./"
          title="返回设计样板"
          aria-label="返回设计样板"
        >
          <ArrowLeftIcon
            className="ds-icon"
            size={foundations.size.navIcon}
            isAnimated={false}
            aria-hidden="true"
          />
          <span>返回设计样板</span>
        </a>
      </aside>
      <div className="study-body">
        <header className="study-header">
          <button
            className="study-menu"
            aria-label="打开项目导航"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon
              className="ds-icon"
              size={foundations.size.navIcon}
              isAnimated={false}
              aria-hidden="true"
            />
          </button>
          <span className="study-breadcrumb">
            CoSeed <span>/</span> 项目综述
          </span>
          <div className="study-controls">
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              classNames={{ root: 'study-toc-popup' }}
              menu={{
                selectedKeys: [active],
                items: sections.map(([id, name]) => ({
                  key: id,
                  label: <a href={`#${id}`}>{name}</a>,
                })),
                onClick: ({ key }) => setActive(key),
              }}
            >
              <Button type="text" className="study-toc-trigger" aria-label="打开阅读目录">
                目录
              </Button>
            </Dropdown>
            <span className="study-font-note">系统字体</span>
            <AppearanceSelect />
          </div>
        </header>
        <main className="study-main">
          <div className="ds-reading-layout">
            <article className="ds-prose study-article">
              <div className="study-document-heading">
                <p className="study-preview-label">阅读页设计预览</p>
                <h1>理解项目，跟上每一次推进</h1>
                <p className="study-lead">
                  把需求、变化的来由和实现设计放在一起，帮助人持续参与 Agent 开发。
                </p>
              </div>
              <section id="what" className="study-section">
                <h2>项目是什么</h2>
                <p>
                  CoSeed 是一个用于人机协同开发的项目认知工作台。开发者借助 Agent
                  推进代码，同时需要理解项目要解决什么问题、业务如何实现，以及关键方案为什么这样选择。
                </p>
                <p>
                  随着开发推进，对话越来越长，早先的需求和设计细节容易被遗忘。CoSeed 把
                  <span className="study-marker">已经明确的项目知识</span>
                  持续保存下来，让人能够重新接上思路，也让后续协作有共同的依据。
                </p>
              </section>
              <section id="concepts" className="study-section">
                <h2>核心概念</h2>
                <dl className="study-concepts">
                  <div>
                    <dt>项目综述</dt>
                    <dd>描述当前一致的需求：产品是什么，为谁服务，以及如何使用。</dd>
                  </div>
                  <div>
                    <dt>需求推进</dt>
                    <dd>保留阶段回顾中的变化和结论，解释需求是怎样一步步明确的。</dd>
                  </div>
                  <div>
                    <dt>业务设计</dt>
                    <dd>通过可下钻的图，理解业务模块、内部组成以及它们之间的关系。</dd>
                  </div>
                </dl>
                <p className="study-handnote">先理解，再推进。</p>
              </section>
              <section id="usage" className="study-section">
                <h2>如何使用</h2>
                <p>
                  开始一项开发任务时，先阅读项目综述，了解已有需求；再进入对应的业务模块，查看它的职责、数据和实现设计。
                </p>
                <p>
                  与 Agent
                  完成一段工作后，发起一次阶段回顾，把已经确认的内容补进项目。综述保留当前结论，推进记录保留变化的来由，设计图反映项目如何实现。
                </p>
              </section>
              <footer className="study-review-note">
                只读设计预览。中文使用系统字体，主题采用松针绿，排版来自全局设计系统。
              </footer>
            </article>
            <aside className="ds-toc study-toc">
              <span>本页内容</span>
              <nav aria-label="阅读目录">
                {sections.map(([id, name]) => (
                  <a
                    key={id}
                    className={active === id ? 'study-toc-current' : ''}
                    href={`#${id}`}
                    onClick={() => setActive(id)}
                  >
                    {name}
                  </a>
                ))}
              </nav>
              <a className="study-reference" href="./#palette">
                查看全局样式
              </a>
            </aside>
          </div>
        </main>
      </div>
      <Drawer
        title="CoSeed"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="left"
        size={foundations.layout.mobileDrawerWidth}
        classNames={{ root: 'study-navigation-drawer' }}
      >
        {navigation}
      </Drawer>
    </div>
  );
}
