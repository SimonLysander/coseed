import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Checkbox, ConfigProvider, Drawer, Input, Modal, Switch } from 'antd';
import { MotionConfig, useReducedMotion } from 'motion/react';
import { BookOpenIcon } from '@animateicons/react/lucide/book-open-icon';
import { HistoryIcon } from '@animateicons/react/lucide/history-icon';
import { GitBranchIcon } from '@animateicons/react/lucide/git-branch-icon';
import { SaveIcon } from '@animateicons/react/lucide/save-icon';
import { PlusIcon } from '@animateicons/react/lucide/plus-icon';
import { CopyIcon } from '@animateicons/react/lucide/copy-icon';
import { RefreshCwIcon } from '@animateicons/react/lucide/refresh-cw-icon';
import { SettingsIcon } from '@animateicons/react/lucide/settings-icon';
import { MenuIcon } from '@animateicons/react/lucide/menu-icon';
import { SproutIcon } from '@animateicons/react/lucide/sprout-icon';
import {
  foundations as baseTokens,
  themes as themeOptions,
  resolveThemeTokens,
} from '../../../src/web/design-system/tokens.ts';
import {
  DesignSystemProvider,
  AppearanceSelect,
  useAppearance,
} from '../../../src/web/design-system/DesignSystemProvider.tsx';
import { ReadingStudy } from './reading-study.jsx';
import './style.css';

const ReducedContext = createContext(false);
const iconSpecs = {
  reading: { Icon: BookOpenIcon, baseMs: 800 },
  history: { Icon: HistoryIcon, baseMs: 900 },
  graph: { Icon: GitBranchIcon, baseMs: 900 },
  save: { Icon: SaveIcon, baseMs: 600 },
  add: { Icon: PlusIcon, baseMs: 500 },
  copy: { Icon: CopyIcon, baseMs: 900 },
  retry: { Icon: RefreshCwIcon, baseMs: 900 },
  settings: { Icon: SettingsIcon, baseMs: 900 },
};

function Action({
  kind,
  children,
  className = '',
  type,
  onClick,
  disabled,
  href,
  iconSize = baseTokens.size.icon,
}) {
  const { Icon, baseMs } = iconSpecs[kind];
  const ref = useRef(null);
  const lastPlayed = useRef(-Infinity);
  const reduced = useContext(ReducedContext);
  useEffect(() => {
    if (reduced) ref.current?.stopAnimation();
  }, [reduced]);
  const play = () => {
    if (
      reduced ||
      disabled ||
      performance.now() - lastPlayed.current < baseTokens.motion.iconRetriggerDelayMs
    )
      return;
    lastPlayed.current = performance.now();
    ref.current?.startAnimation();
  };
  return (
    <Button
      aria-label={typeof children === 'string' ? children : undefined}
      href={href}
      type={type}
      disabled={disabled}
      className={`sketch-action ${className}`}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') play();
      }}
      onPointerLeave={() => ref.current?.stopAnimation()}
      onFocus={play}
      onBlur={() => ref.current?.stopAnimation()}
      onClick={onClick}
      icon={
        <Icon
          className="ds-icon"
          ref={ref}
          size={iconSize}
          duration={baseTokens.motion.durationMs.iconTarget / baseMs}
          isAnimated={false}
          aria-hidden="true"
        />
      }
    >
      {children}
    </Button>
  );
}

const navigation = [
  ['reading', '#reading', '阅读与布局'],
  ['settings', '#components', '组件状态'],
  ['save', '#icons', '动态图标'],
  ['graph', '#graph', '图形样式'],
  ['history', '#palette', '色彩和字体'],
];

function Navigation({ onNavigate = () => {}, active = '#reading' }) {
  return (
    <nav aria-label="样板目录">
      {navigation.map(([kind, href, label]) => (
        <Action
          key={href}
          kind={kind}
          iconSize={baseTokens.size.navIcon}
          href={href}
          type="text"
          className={`ds-nav-item navigation-item ${active === href ? 'is-selected' : ''}`}
          onClick={() => onNavigate(href)}
        >
          {label}
        </Action>
      ))}
    </nav>
  );
}

function Section({ id, title, note, children }) {
  return (
    <section id={id} className="sample-section">
      <div className="section-heading">
        <h2>{title}</h2>
        {note && <span className="section-note">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Preview() {
  const readingStudy = new URLSearchParams(window.location.search).get('view') === 'reading';
  const { mode } = useAppearance();
  const tokens = resolveThemeTokens(mode);
  const osReduced = useReducedMotion();
  const [forceReduced, setForceReduced] = useState(false);
  const reduced = Boolean(osReduced || forceReduced);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [active, setActive] = useState(window.location.hash || '#reading');
  useEffect(() => {
    const update = () => setActive(window.location.hash || '#reading');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [receipt, setReceipt] = useState('这里的操作只演示反馈，不读写项目。');
  const theme = { token: { motion: !reduced } };
  return (
    <ReducedContext.Provider value={reduced}>
      <ConfigProvider theme={theme} wave={{ disabled: true }}>
        <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>
          {readingStudy ? (
            <ReadingStudy />
          ) : (
            <div className="design-preview" data-reduced={reduced}>
              <aside className="sample-sidebar">
                <a className="wordmark" href="#reading" aria-label="CoSeed 设计样板">
                  <span className="brand-name">CoSeed</span>
                  <SproutIcon
                    className="ds-icon rail-brand"
                    size={tokens.size.brandIcon}
                    isAnimated={false}
                    aria-hidden="true"
                  />
                  <span className="wordmark-dot" />
                </a>
                <div className="sidebar-caption">全局设计样板</div>
                <Navigation active={active} onNavigate={setActive} />
                <p className="sidebar-footer">
                  纸面、笔触与淡彩。
                  <br />
                  紧凑地组织项目理解。
                </p>
              </aside>
              <div className="sample-main">
                <header className="sample-header">
                  <Button
                    className="mobile-menu"
                    type="text"
                    onClick={() => setDrawerOpen(true)}
                    aria-label="打开样板导航"
                    icon={
                      <MenuIcon
                        className="ds-icon"
                        size={tokens.size.standaloneIcon}
                        isAnimated={false}
                        aria-hidden="true"
                      />
                    }
                  />
                  <span className="header-context">CoSeed / 全局设计系统</span>
                  <div className="header-tools">
                    <AppearanceSelect />
                    <span className="draft-label">{mode === 'dark' ? '深色样板' : '浅色样板'}</span>
                  </div>
                </header>
                <main>
                  <div className="page-title">
                    <h1>轻手绘，清晰而紧凑</h1>
                    <p>白色主体、墨绿强调。用留白组织内容，用少量笔触标出重点。</p>
                    <a className="study-entry" href="?view=reading">
                      打开阅读页
                    </a>
                  </div>

                  <Section
                    id="reading"
                    title="阅读与布局"
                    note={`侧栏 ${tokens.layout.sidebarWidth}px · 顶栏 ${tokens.layout.headerHeight}px · 内容留白 ${tokens.layout.pagePadding}px`}
                  >
                    <div className="reading-demo content-demo">
                      <article>
                        <div className="reading-heading">
                          <h3>理解项目，也理解它为什么变成这样</h3>
                          <span className="quiet-label">
                            正文 {tokens.type.reading.size} / {tokens.type.reading.lineHeight}
                          </span>
                        </div>
                        <p>
                          CoSeed
                          把项目的业务表述、需求推进和设计放在一起。开发者先读清楚项目是什么，再沿着业务模块理解实现方式，必要时核对支撑结论的来源。
                        </p>
                        <p>
                          一次阶段回顾，把已经明确的结论补进项目知识。
                          <span className="marker">当前内容保持连贯</span>，推进记录保留变化的来由。
                        </p>
                        <div className="reading-actions">
                          <Action kind="reading" onClick={() => setReceipt('阅读入口样例已触发。')}>
                            查看项目综述
                          </Action>
                          <a href="#graph">看看图中的表达</a>
                        </div>
                      </article>
                      <aside className="reading-toc">
                        <strong>阅读目录</strong>
                        <a className="toc-active" href="#reading">
                          产品是什么
                        </a>
                        <a href="#graph">核心概念</a>
                        <a href="#components">使用示例</a>
                        <span>
                          目录贴近正文，
                          <br />
                          帮助定位，不重复内容。
                        </span>
                      </aside>
                    </div>
                  </Section>

                  <Section
                    id="components"
                    title="组件状态"
                    note={`默认控件 ${tokens.size.control}px · 区域内间距 ${tokens.space['5']}–${tokens.layout.panelPadding}px`}
                  >
                    <div className="component-grid">
                      <div className="sample-panel">
                        <h3>动作与反馈</h3>
                        <div className="button-row">
                          <Action
                            kind="save"
                            type="primary"
                            onClick={() => setReceipt('保存完成反馈样例：未写入任何项目内容。')}
                          >
                            保存
                          </Action>
                          <Action kind="add" onClick={() => setReceipt('新建入口样例已触发。')}>
                            新建
                          </Action>
                          <Action
                            kind="retry"
                            type="text"
                            onClick={() => setReceipt('重试反馈样例已触发。')}
                          >
                            重试
                          </Action>
                          <Action kind="save" disabled>
                            不可用
                          </Action>
                        </div>
                        <div className="receipt" role="status">
                          {receipt}
                        </div>
                        <Button onClick={() => setDialogOpen(true)} className="sketch-action">
                          预览弹窗
                        </Button>
                      </div>
                      <div className="sample-panel">
                        <h3>输入与聚焦</h3>
                        <label className="field-label" htmlFor="example-title">
                          项目名称（样例）
                        </label>
                        <Input id="example-title" defaultValue="CoSeed" />
                        <div className="field-hint">边界清楚，聚焦后补上一圈强调色笔触。</div>
                        <Checkbox defaultChecked>保留这次修改的来源</Checkbox>
                      </div>
                    </div>
                    <div className="state-row">
                      {[
                        ['success', '✓', '已保存'],
                        ['warning', '!', '待核对'],
                        ['error', '×', '保存失败'],
                        ['info', 'i', '仅作说明'],
                      ].map(([kind, symbol, label]) => (
                        <span key={kind} className={`state-chip state-${kind}`}>
                          <span aria-hidden="true">{symbol}</span>
                          {label}
                        </span>
                      ))}
                    </div>
                  </Section>

                  <Section
                    id="icons"
                    title="动态图标，用在动作发生的地方"
                    note="整行或按钮触发，文字和控件位置不动"
                  >
                    <div className="icon-demo content-demo">
                      <div>
                        <h3>将指针移到按钮，或用 Tab 聚焦</h3>
                        <p>
                          图标播放一次，随后安静下来。导航选中态、正文说明和图中的类型标识保持静止。
                        </p>
                        <div className="button-row">
                          <Action
                            kind="copy"
                            onClick={() => setReceipt('复制反馈样例：不读取剪贴板。')}
                          >
                            复制
                          </Action>
                          <Action kind="history" onClick={() => setReceipt('历史入口样例已触发。')}>
                            查看记录
                          </Action>
                          <Action kind="graph" onClick={() => setReceipt('设计入口样例已触发。')}>
                            查看设计
                          </Action>
                        </div>
                      </div>
                      <div className="motion-setting">
                        <label htmlFor="reduce-motion">减少动态效果</label>
                        <Switch
                          id="reduce-motion"
                          checked={reduced}
                          disabled={Boolean(osReduced)}
                          onChange={setForceReduced}
                          aria-label="减少动态效果"
                        />
                        <small>{osReduced ? '已跟随系统设置' : '仅切换本样板的预览'}</small>
                      </div>
                    </div>
                  </Section>

                  <Section
                    id="graph"
                    title="图形样式"
                    note="这里只展示外观，不验证业务结构或自动布局"
                  >
                    <div className="node-samples">
                      <div className="graph-sample node-processing">
                        <h3>处理组件</h3>
                        <p>用完整、凝练的业务说明，解释这一部分负责完成什么事情。</p>
                      </div>
                      <div className="graph-sample node-data">
                        <h3>数据对象</h3>
                        <p>名称和职责直接可读，字段使用 TS 类型和行内注释。</p>
                        <pre>
                          <code>
                            {
                              'type Example = {\n  title: string; // 名称\n  note?: string; // 说明\n};'
                            }
                          </code>
                        </pre>
                      </div>
                      <div className="graph-sample node-external">
                        <h3>外部对象</h3>
                        <p>保留灰色底与明确边界，在完整图中放于模块范围之外。</p>
                      </div>
                    </div>
                    <div className="edge-demo">
                      <svg
                        viewBox="0 0 650 74"
                        role="img"
                        aria-label="语义函数与端点多重性的排版样例"
                      >
                        <defs>
                          <marker
                            id="sample-arrow"
                            markerWidth="8"
                            markerHeight="8"
                            refX="7"
                            refY="4"
                            orient="auto"
                          >
                            <path d="m1 1 6 3-6 3" fill="none" stroke="currentColor" />
                          </marker>
                        </defs>
                        <path
                          d="M16 18H634"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeDasharray="5 4"
                          markerEnd="url(#sample-arrow)"
                        />
                        <rect
                          x="151"
                          y="6"
                          width="348"
                          height="24"
                          fill={tokens.color.graph.labelBackground}
                        />
                        <text x="325" y="22" textAnchor="middle">
                          读取示例（对象标识）：对象信息
                        </text>
                        <path d="M16 58H634" stroke="currentColor" strokeWidth="1.2" />
                        <text x="30" y="49">
                          1
                        </text>
                        <text x="589" y="49">
                          0..*
                        </text>
                        <rect
                          x="277"
                          y="46"
                          width="96"
                          height="24"
                          fill={tokens.color.graph.labelBackground}
                        />
                        <text x="325" y="62" textAnchor="middle">
                          对象关联
                        </text>
                      </svg>
                    </div>
                  </Section>

                  <Section
                    id="palette"
                    title="色彩和字体"
                    note={
                      <span>
                        {mode === 'dark' ? '深色' : '浅色'} / 松针绿　
                        <a href="?view=reading">查看阅读页</a>
                      </span>
                    }
                  >
                    <div className="swatch-grid">
                      {[
                        ['页面', tokens.color.surface.page],
                        ['内容', tokens.color.surface.paper],
                        ['文字', tokens.color.text.primary],
                        ['强调', tokens.color.accent.solid],
                        ['标记', tokens.color.accent.soft],
                        ['提醒', tokens.color.state.warning.background],
                      ].map(([name, color]) => (
                        <div className="swatch" key={name}>
                          <span className="swatch-paint" style={{ background: color }} />
                          <strong>{name}</strong>
                          <code>{color}</code>
                        </div>
                      ))}
                    </div>
                    <div className="type-grid">
                      <div>
                        <span className="type-label">英文字标</span>
                        <span className="wordmark type-wordmark">CoSeed</span>
                        <small>Patrick Hand，仅用于少量品牌文字。</small>
                      </div>
                      <div>
                        <span className="type-label">标题与正文</span>
                        <strong className="type-heading">一眼看清内容的主次</strong>
                        <span>
                          界面 {tokens.type.ui.size} / {tokens.type.ui.lineHeight}，阅读正文{' '}
                          {tokens.type.reading.size} / {tokens.type.reading.lineHeight}。
                        </span>
                        <small>中文采用清晰的系统无衬线字体。</small>
                      </div>
                      <div>
                        <span className="type-label">代码与字段</span>
                        <code className="type-code">
                          title: string; <span>// 名称</span>
                        </code>
                        <small>
                          {tokens.type.code.size} / {tokens.type.code.lineHeight}
                          ，等宽排版，注释保持可读。
                        </small>
                      </div>
                    </div>
                  </Section>
                  <footer className="sample-footer">
                    设计样板，不代表项目管理、保存或图形功能已实现。核心样式读取统一 Token。
                  </footer>
                </main>
              </div>
              <Drawer
                title="样板目录"
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                placement="left"
                size={tokens.layout.mobileDrawerWidth}
              >
                <Navigation
                  active={active}
                  onNavigate={(href) => {
                    setActive(href);
                    setDrawerOpen(false);
                  }}
                />
              </Drawer>
              <Modal
                title="弹窗样式预览"
                open={dialogOpen}
                width={tokens.size.modal}
                onCancel={() => setDialogOpen(false)}
                footer={
                  <>
                    <Button onClick={() => setDialogOpen(false)}>取消</Button>
                    <Button
                      type="primary"
                      onClick={() => {
                        setDialogOpen(false);
                        setReceipt('已确认弹窗样例，未写入项目内容。');
                      }}
                    >
                      确认样例
                    </Button>
                  </>
                }
              >
                <p>用紧凑的留白组织内容，边界有一点手绘笔触，文字保持清晰。</p>
                <p className="dialog-note">这只是交互样例，不会保存或删除项目数据。</p>
              </Modal>
            </div>
          )}
        </MotionConfig>
      </ConfigProvider>
    </ReducedContext.Provider>
  );
}

createRoot(document.getElementById('root')).render(
  <DesignSystemProvider storageKey={themeOptions.preferences.previewKey}>
    <Preview />
  </DesignSystemProvider>,
);
