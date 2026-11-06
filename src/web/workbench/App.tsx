import { lazy, Suspense, useEffect, useState } from 'react';
import { Button, Drawer, Menu } from 'antd';
import { MenuIcon } from '@animateicons/react/lucide/menu-icon';
import { AppearanceToggle } from '../design-system/AppearanceToggle.js';
import { foundations } from '../design-system/tokens.js';
import { BookOpenIcon } from '@animateicons/react/lucide/book-open-icon';
import { GitBranchIcon } from '@animateicons/react/lucide/git-branch-icon';
import { HistoryIcon } from '@animateicons/react/lucide/history-icon';
import { SproutIcon } from '@animateicons/react/lucide/sprout-icon';
import { FileTextIcon } from '@animateicons/react/lucide/file-text-icon';
import { PlugIcon } from '@animateicons/react/lucide/plug-icon';
import { motion } from 'motion/react';
import { useServiceStatus } from './use-service-status.js';

const AgentGuidePage = lazy(() => import('../agent-guide/AgentGuidePage.js'));
const isGuideRoute = () => window.location.hash.split('/')[1] === 'agent-guide';

const ServiceConnectionDialog = lazy(() => import('./ServiceConnectionDialog.js'));

export function App() {
  const [guideOpen, setGuideOpen] = useState(isGuideRoute);
  useEffect(() => {
    const onHashChange = () => {
      setGuideOpen(isGuideRoute());
      if (!isGuideRoute()) window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const { connection, retry } = useServiceStatus();

  const sidebarContent = (
    <div className="sidebar-content">
      <a className="brand" href="#/overview" aria-label="CoSeed 首页">
        <span className="brand-mark">
          <SproutIcon className="ds-icon" size={foundations.size.brandIcon} />
        </span>
        <span>
          CoSeed<span className="brand-caption">共同理解，一起生长</span>
        </span>
      </a>
      <div className="project-slot">
        <span className="project-dot" />
        尚未选择项目
      </div>
      <nav aria-label="主导航">
        <Menu
          mode="inline"
          selectedKeys={guideOpen ? [] : ['overview']}
          onClick={({ key }) => {
            window.location.hash = `/${key}`;
            setNavigationOpen(false);
          }}
          items={[
            {
              key: 'overview',
              className: 'ds-nav-item',
              icon: <BookOpenIcon className="ds-icon" size={foundations.size.navIcon} />,
              label: '项目综述',
            },
            {
              key: 'requirements',
              className: 'ds-nav-item',
              icon: <HistoryIcon className="ds-icon" size={foundations.size.navIcon} />,
              label: '需求推进',
              disabled: true,
            },
            {
              key: 'business',
              className: 'ds-nav-item',
              icon: <GitBranchIcon className="ds-icon" size={foundations.size.navIcon} />,
              label: '业务设计',
              disabled: true,
            },
          ]}
        />
      </nav>
      <div className="sidebar-bottom">
        <Button
          className="ds-nav-item sidebar-guide-link"
          color={guideOpen ? 'primary' : 'default'}
          variant="text"
          href="#/agent-guide"
          aria-label="Agent 接入"
          aria-current={guideOpen ? 'page' : undefined}
          icon={
            <FileTextIcon className="ds-icon" size={foundations.size.navIcon} aria-hidden="true" />
          }
          onClick={() => setNavigationOpen(false)}
        >
          <span className="sidebar-action-label">Agent 接入</span>
        </Button>
        <Button
          className="ds-nav-item"
          type="text"
          aria-label="服务连接"
          icon={<PlugIcon className="ds-icon" size={foundations.size.navIcon} />}
          onClick={() => {
            setNavigationOpen(false);
            setConnectionOpen(true);
          }}
        >
          <span className="sidebar-action-label">服务连接</span>
        </Button>
        <div className="sidebar-utilities">
          <AppearanceToggle />
        </div>
        <span className="sidebar-note">项目认知工作台</span>
      </div>
    </div>
  );

  return (
    <div className={`workbench${guideOpen ? ' workbench-guide' : ''}`}>
      <aside className="sidebar">{sidebarContent}</aside>

      <main className="main-area">
        <Button
          className="workbench-menu"
          type="text"
          aria-label="打开主导航"
          onClick={() => setNavigationOpen(true)}
          icon={<MenuIcon className="ds-icon" size={foundations.size.navIcon} aria-hidden="true" />}
        />
        {guideOpen ? (
          <Suspense
            fallback={
              <p className="guide-loading" role="status">
                正在打开接入说明…
              </p>
            }
          >
            <AgentGuidePage />
          </Suspense>
        ) : (
          <motion.section
            className="empty-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: foundations.motion.durationMs.reveal / 1000 }}
          >
            <div className="empty-illustration" aria-hidden="true">
              <svg viewBox="0 0 220 160" fill="none">
                <path
                  d="M48 30 168 24 177 131 54 137Z"
                  fill="var(--ds-color-surface-paper)"
                  stroke="var(--ds-color-border-subtle)"
                  strokeWidth="1.5"
                />
                <path
                  d="m57 23 120 8-7 108-122-8Z"
                  fill="var(--ds-color-surface-paper)"
                  stroke="var(--ds-color-border-interactive)"
                  strokeWidth="1.5"
                />
                <path
                  d="m73 58 67 4M71 73l86 5M70 88l46 3"
                  stroke="var(--ds-color-border-subtle)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M147 120c-2-16 3-30 10-41m-8 28c-13 1-20-5-21-15 13-1 21 4 21 15Zm5-15c-1-11 4-19 16-22 2 12-3 20-16 22Z"
                  fill="var(--ds-color-accent-soft)"
                  stroke="var(--ds-color-accent-solid)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="m39 144 140 2"
                  stroke="var(--ds-color-border-subtle)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h1>先从一个项目开始</h1>
            <p className="empty-description">
              把项目的业务、需求和设计留在一起。
              <br />
              每次继续开发，都能接上之前的理解。
            </p>
            <div className="empty-rule" />
            <p className="empty-note">工作台已建立，项目内容尚未接入。</p>
            {connection.state === 'error' && (
              <div className="connection-error" role="alert">
                <p>{connection.message}</p>
                <Button onClick={retry}>重新连接</Button>
              </div>
            )}
          </motion.section>
        )}
        <footer className="page-footer">
          <span>CoSeed</span>
          <span>让理解跟得上开发</span>
        </footer>
      </main>

      <Drawer
        title="CoSeed"
        open={navigationOpen}
        onClose={() => setNavigationOpen(false)}
        placement="left"
        size={foundations.layout.mobileDrawerWidth}
      >
        {sidebarContent}
      </Drawer>
      {connectionOpen && (
        <Suspense fallback={<span role="status">正在打开连接信息…</span>}>
          <ServiceConnectionDialog
            connection={connection}
            onClose={() => setConnectionOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
