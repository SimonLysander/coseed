import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { Alert, Button, Drawer, Menu } from 'antd';
import { matchPath, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { businessPath } from '../business/queries.js';
import { requirementsPath } from '../requirements/queries.js';
import { ProjectWelcome } from '../projects/ProjectWelcome.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import { useProjectCreation } from '../projects/use-project-creation.js';
import {
  projectQuery,
  agentGuidePath,
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
const BusinessPage = lazy(() => import('../business/BusinessPage.js'));

const projectSections = [
  { key: 'overview', label: '概览', Icon: BookOpenIcon },
  { key: 'business', label: '结构设计', Icon: GitBranchIcon },
  { key: 'requirements', label: '时间线', Icon: HistoryIcon },
] as const;

const guideLabel = '接入指南';

function HomeLink({ onClick, labelId }: { onClick: () => void; labelId?: string }) {
  return (
    <a className="brand" href="#/overview" aria-label="CoSeed 首页" onClick={onClick}>
      <span className="brand-mark" aria-hidden="true">
        <SproutIcon className="ds-icon" size={foundations.size.brandIcon} isAnimated={false} />
      </span>
      <span id={labelId}>CoSeed</span>
    </a>
  );
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = matchPath('/projects/:projectId/:section/*', location.pathname);
  const guideOpen =
    location.pathname.startsWith('/agent-guide') || route?.params.section === 'agent-guide';
  const routeId = route?.params.projectId;
  const sectionKey = route?.params.section ?? location.pathname.split('/')[1];
  const activeSection = projectSections.find(({ key }) => key === sectionKey) ?? projectSections[0];
  const [selectedId, setSelectedId] = useState(readSelectedProject);
  const projectId = routeId ?? selectedId;
  const pageLabel = guideOpen ? guideLabel : projectId ? activeSection.label : '选择项目';
  useEffect(() => {
    document.title = `${pageLabel} · CoSeed`;
  }, [pageLabel]);
  const project = useQuery({ ...projectQuery(projectId ?? ''), enabled: Boolean(projectId) });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const drawerTitleId = useId();
  const closeNavigation = () => {
    setNavigationOpen(false);
    setPickerOpen(false);
  };
  useEffect(() => {
    if (routeId) {
      setSelectedId(routeId);
      saveSelectedProject(routeId);
    }
  }, [routeId]);
  const selectProject = (id: string) => {
    setSelectedId(id);
    saveSelectedProject(id);
    setCreateOpen(false);
    closeNavigation();
    navigate(
      guideOpen
        ? agentGuidePath(id)
        : activeSection.key === 'requirements'
          ? requirementsPath(id)
          : activeSection.key === 'business'
            ? businessPath(id)
            : projectPath(id),
    );
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
  const { connection, retry } = useServiceStatus();

  const guide = (
    <AgentGuidePage
      key={projectId}
      projectId={projectId}
      name={project.data?.project.name}
      onSelect={openPicker}
    />
  );
  const sidebarContent = (inDrawer = false) => (
    <div className="sidebar-content">
      {!inDrawer && <HomeLink onClick={closeNavigation} />}
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
          selectedKeys={guideOpen ? [] : [activeSection.key]}
          onClick={({ key }) => {
            navigate(
              projectId
                ? key === 'requirements'
                  ? requirementsPath(projectId)
                  : key === 'business'
                    ? businessPath(projectId)
                    : projectPath(projectId)
                : `/${key}`,
            );
            closeNavigation();
          }}
          items={projectSections.map(({ key, label, Icon }) => ({
            key,
            label,
            className: 'ds-nav-item',
            icon: <Icon isAnimated={false} className="ds-icon" size={foundations.size.navIcon} />,
            'aria-current': !guideOpen && activeSection.key === key ? 'page' : undefined,
          }))}
        />
      </nav>
      <div className="sidebar-bottom">
        <Button
          className="ds-nav-item sidebar-guide-link"
          color={guideOpen ? 'primary' : 'default'}
          variant={guideOpen ? 'filled' : 'text'}
          href={'#' + agentGuidePath(projectId)}
          aria-label={guideLabel}
          aria-current={guideOpen ? 'page' : undefined}
          icon={
            <FileTextIcon
              isAnimated={false}
              className="ds-icon"
              size={foundations.size.navIcon}
              aria-hidden="true"
            />
          }
          onClick={closeNavigation}
        >
          <span className="sidebar-action-label">{guideLabel}</span>
        </Button>
        <AppearanceToggle />
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
            <Route path="/agent-guide/*" element={guide} />
            <Route path="/projects/:projectId/agent-guide/*" element={guide} />
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
              path="/projects/:projectId/business"
              element={<BusinessPage onSelect={openPicker} />}
            />
            <Route
              path="/projects/:projectId/business/diagrams/:diagramId"
              element={<BusinessPage onSelect={openPicker} />}
            />
            <Route
              path="/business"
              element={
                projectId ? (
                  <Navigate replace to={businessPath(projectId)} />
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
      </main>

      <Drawer
        title={<HomeLink onClick={closeNavigation} labelId={drawerTitleId} />}
        aria-labelledby={drawerTitleId}
        closable={{ placement: 'end' }}
        open={navigationOpen}
        onClose={closeNavigation}
        placement="left"
        size={foundations.layout.mobileDrawerWidth}
      >
        {sidebarContent(true)}
      </Drawer>
    </div>
  );
}
