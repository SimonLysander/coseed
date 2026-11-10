import { lazy, Suspense, useEffect, useState } from 'react';
import { Alert, Button, Drawer, Menu } from 'antd';
import { matchPath, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FolderOpenIcon } from '@animateicons/react/lucide/folder-open-icon';
import { ProjectWelcome } from '../projects/ProjectWelcome.js';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import { CreateProjectDialog } from '../projects/CreateProjectDialog.js';
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
import { PlugIcon } from '@animateicons/react/lucide/plug-icon';
import { useServiceStatus } from './use-service-status.js';

const AgentGuidePage = lazy(() => import('../agent-guide/AgentGuidePage.js'));
const OverviewPage = lazy(() => import('../overview/OverviewPage.js'));

const ServiceConnectionDialog = lazy(() => import('./ServiceConnectionDialog.js'));

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const guideOpen = location.pathname.startsWith('/agent-guide');
  const routeId = matchPath('/projects/:projectId/overview/*', location.pathname)?.params.projectId;
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
    navigate(projectPath(id));
    window.scrollTo(0, 0);
  };
  const openPicker = () => {
    setNavigationOpen(false);
    setPickerOpen(true);
  };
  const openCreate = () => {
    setPickerOpen(false);
    setCreateOpen(true);
  };
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
      <Button
        type="text"
        className="project-slot"
        aria-label={project.data ? `切换项目，当前：${project.data.project.name}` : '选择项目'}
        icon={
          <FolderOpenIcon className="ds-icon" size={foundations.size.navIcon} aria-hidden="true" />
        }
        onClick={openPicker}
      >
        <span className="project-slot-label">
          {project.data?.project.name ?? (projectId ? '当前项目' : '选择项目')}
        </span>
      </Button>
      <nav aria-label="主导航">
        <Menu
          mode="inline"
          selectedKeys={guideOpen ? [] : ['overview']}
          onClick={({ key }) => {
            navigate(key === 'overview' && projectId ? projectPath(projectId) : `/${key}`);
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
              path="/overview"
              element={
                projectId ? (
                  <Navigate replace to={projectPath(projectId)} />
                ) : (
                  <ProjectWelcome onSelect={openPicker} onCreate={openCreate} />
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
        onClose={() => setNavigationOpen(false)}
        placement="left"
        size={foundations.layout.mobileDrawerWidth}
      >
        {sidebarContent}
      </Drawer>
      <ProjectPicker
        open={pickerOpen}
        selectedId={projectId}
        onClose={() => setPickerOpen(false)}
        onSelect={selectProject}
        onCreate={openCreate}
      />
      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={selectProject}
      />
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
