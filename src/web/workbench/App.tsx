import { lazy, Suspense, useEffect, useState } from 'react';
import { Alert, Button, Drawer, Menu } from 'antd';
import { matchPath, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { requirementsPath } from '../requirements/queries.js';
import { ProjectWelcome } from '../projects/ProjectWelcome.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import { useProjectCreation } from '../projects/use-project-creation.js';
import {
  projectQuery,
  projectPath,
  readSelectedProject,
  saveSelectedProject,
} from '../projects/queries.js';
import '../projects/projects.css';
import { MenuIcon } from '@animateicons/react/lucide/menu-icon';
import { AppearanceToggle } from '../design-system/AppearanceToggle.js';
import { foundations } from '../design-system/tokens.js';
import { BookOpenIcon } from '@animateicons/react/lucide/book-open-icon';
import { GitBranchIcon } from '@animateicons/react/lucide/git-branch-icon';
import { HistoryIcon } from '@animateicons/react/lucide/history-icon';
import { SproutIcon } from '@animateicons/react/lucide/sprout-icon';
import { FileTextIcon } from '@animateicons/react/lucide/file-text-icon';
import { useServiceStatus } from './use-service-status.js';

const AgentGuidePage = lazy(() => import('../agent-guide/AgentGuidePage.js'));
const OverviewPage = lazy(() => import('../overview/OverviewPage.js'));
const RequirementsPage = lazy(() => import('../requirements/RequirementsPage.js'));

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const guideOpen = location.pathname.startsWith('/agent-guide');
  const route = matchPath('/projects/:projectId/:section/*', location.pathname);
  const routeId = route?.params.projectId;
  const activeSection =
    route?.params.section === 'requirements' || location.pathname === '/requirements'
      ? 'requirements'
      : 'overview';
  const [selectedId, setSelectedId] = useState(readSelectedProject);
  const projectId = routeId ?? selectedId;
  const project = useQuery({ ...projectQuery(projectId ?? ''), enabled: Boolean(projectId) });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => {
    if (routeId) {
      setSelectedId(routeId);
      saveSelectedProject(routeId);
    }
  }, [routeId]);
  const selectProject = (id: string) => {
    setSelectedId(id);
    saveSelectedProject(id);
    setPickerOpen(false);
    setCreateOpen(false);
    setNavigationOpen(false);
    navigate(activeSection === 'requirements' ? requirementsPath(id) : projectPath(id));
    window.scrollTo(0, 0);
  };
  const openPicker = () => {
    setNavigationOpen(window.innerWidth < foundations.layout.breakpoint.tablet);
    setPickerOpen(true);
  };
  const creation = useProjectCreation(selectProject);
  const openCreate = (name = '') => {
    creation.begin(name);
    openPicker();
    setCreateOpen(true);
  };
  const cancelCreate = () => {
    if (creation.cancel()) setCreateOpen(false);
  };
  const changePickerOpen = (open: boolean) => {
    setPickerOpen(open);
    if (!open) setCreateOpen(false);
  };
  const [navigationOpen, setNavigationOpen] = useState(false);
  const { connection, retry } = useServiceStatus();

  const sidebarContent = (inDrawer = false) => (
    <div className="sidebar-content">
      <a className="brand" href="#/overview" aria-label="CoSeed 首页">
        <span className="brand-mark">
          <SproutIcon className="ds-icon" size={foundations.size.brandIcon} />
        </span>
        <span>
          CoSeed<span className="brand-caption">共同理解，一起生长</span>
        </span>
      </a>
      <ProjectPicker
        open={pickerOpen && navigationOpen === inDrawer}
        selectedId={projectId}
        selectedName={project.data?.project.name ?? null}
        onOpenChange={changePickerOpen}
        creating={createOpen && navigationOpen === inDrawer}
        creation={creation}
        onCancelCreate={cancelCreate}
        onSelect={selectProject}
        onCreate={openCreate}
      />
      <nav aria-label="主导航">
        <Menu
          mode="inline"
          selectedKeys={guideOpen ? [] : [activeSection]}
          onClick={({ key }) => {
            navigate(
              projectId
                ? key === 'requirements'
                  ? requirementsPath(projectId)
                  : projectPath(projectId)
                : `/${key}`,
            );
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
        <div className="sidebar-utilities">
          <AppearanceToggle />
        </div>
        <span className="sidebar-note">项目认知工作台</span>
      </div>
    </div>
  );

  return (
    <div className={`workbench${guideOpen ? ' workbench-guide' : ''}`}>
      <aside className="sidebar">{sidebarContent()}</aside>

      <main className="main-area">
        <Button
          className="workbench-menu"
          type="text"
          aria-label="打开主导航"
          onClick={() => setNavigationOpen(true)}
          icon={<MenuIcon className="ds-icon" size={foundations.size.navIcon} aria-hidden="true" />}
        />
        {connection.state === 'error' && (
          <div className="workbench-connection-error">
            <Alert
              type="error"
              showIcon
              title={connection.message}
              action={<Button onClick={retry}>重新连接</Button>}
            />
          </div>
        )}
        <Suspense
          fallback={
            <p className="guide-loading" role="status">
              正在读取页面…
            </p>
          }
        >
          <Routes>
            <Route path="/agent-guide/*" element={<AgentGuidePage />} />
            <Route
              path="/projects/:projectId/overview/*"
              element={<OverviewPage onSelect={openPicker} />}
            />
            <Route
              path="/projects/:projectId/requirements/:requirementId?"
              element={<RequirementsPage onSelect={openPicker} />}
            />
            <Route
              path="/requirements"
              element={
                projectId ? (
                  <Navigate replace to={requirementsPath(projectId)} />
                ) : (
                  <ProjectWelcome onSelect={openPicker} onCreate={() => openCreate()} />
                )
              }
            />
            <Route
              path="/overview"
              element={
                projectId ? (
                  <Navigate replace to={projectPath(projectId)} />
                ) : (
                  <ProjectWelcome onSelect={openPicker} onCreate={() => openCreate()} />
                )
              }
            />
            <Route path="*" element={<Navigate replace to="/overview" />} />
          </Routes>
        </Suspense>
        <footer className="page-footer">
          <span>CoSeed</span>
          <span>让理解跟得上开发</span>
        </footer>
      </main>

      <Drawer
        title="CoSeed"
        open={navigationOpen}
        onClose={() => {
          setNavigationOpen(false);
          setPickerOpen(false);
        }}
        placement="left"
        size={foundations.layout.mobileDrawerWidth}
      >
        {sidebarContent(true)}
      </Drawer>
    </div>
  );
}
