# ADR 0001：本地服务技术栈与 MCP 协议边界

状态：技术基线已用于工程初始化，直接依赖和 lockfile 已生成。配置、SQLite、Web、MCP 标准握手已有基础实现；业务模型及完整图形迁移仍待实现。当前结构见 ARCHITECTURE.md。

核对日期：2026-11-05。

## 背景

CoSeed 是个人本地使用、按项目隔离内容的项目认知工作台。Web 页面和 MCP 提供两个入口，共用业务规则及持久化内容。每次更正必须保留修改前后、操作者、修改时间和具体来源。

CoSeed 的能力通过 MCP 提供。当前开发对话使用 Codex，并不意味着产品需要依赖 Codex 的 SDK、会话存储或执行环境。

## 首版推荐

| 部分           | 选型                                                                              | 在本项目中的作用                                                                  |
| -------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 语言           | TypeScript，开启严格类型检查                                                      | 前端、服务、协议输入与业务逻辑使用同一语言                                        |
| 运行时         | Node.js 26 LTS，ESM                                                               | 遵循用户要求采用当前最新稳定运行时，本地服务和 CLI 使用 ESM                       |
| 前端           | React 19 + Vite 8                                                                 | 项目工作台、阅读、管理及记录编辑                                                  |
| 组件和样式     | Ant Design 6 + 主题 Token + CSS                                                   | 提供通用交互组件，保留浅色纸面、低饱和手绘风和阅读布局                            |
| 动效           | Motion，使用 motion/react                                                         | 页面状态切换与轻量反馈，避免改变图布局几何                                        |
| 图标           | AnimateIcons：@animateicons/react，优先 Lucide 风格                               | 统一图标外观，按需使用动效                                                        |
| 服务框架       | NestJS 12 + @nestjs/platform-fastify / Fastify 5                                  | 组织业务模块与依赖，提供 HTTP 和静态页面入口                                      |
| MCP            | 官方 TypeScript SDK v2：@modelcontextprotocol/server + @modelcontextprotocol/node | 使用 Streamable HTTP，适配同一 Nest 应用；参考官方 Fastify 适配包，不另起业务服务 |
| 存储           | SQLite + better-sqlite3                                                           | 保存项目内容、来源及修订历史，无须用户另装数据库服务                              |
| 数据访问和迁移 | Drizzle ORM + Drizzle Kit                                                         | 使用类型化 SQL 维护结构，并保留可 review 的迁移文件                               |
| 输入校验       | Zod 4                                                                             | Web 和 MCP 入口共用数据结构及校验规则                                             |
| 图形           | 推荐 AntV X6 3 + @antv/x6-react-shape 3 + ELK.js                                  | X6 负责图元与交互，ELK 负责通用布局；须通过真实业务图验证后锁定                   |
| Markdown       | markdown-it                                                                       | 复用已验证的正文解析，默认禁用原始 HTML                                           |
| 测试           | Vitest + Playwright                                                               | 业务、真实 SQLite 集成及浏览器交互验证                                            |
| 分发和构建     | npm；服务端 tsc，前端 Vite                                                        | 一个 npm 包携带 CLI、服务和构建后的页面资源                                       |

首版采用单仓库、单个发布包和模块化单体服务。业务逻辑、持久化与 Web/MCP 适配层保持职责区分，但不提前拆成多个服务。

## 运行关系

```text
浏览器                        MCP 客户端
  │                              │
  ▼                              ▼
Web / HTTP 入口              MCP 协议入口
  └─────────────┬────────────────┘
                ▼
        CoSeed 业务逻辑
      项目隔离、内容更新、来源、更正历史
                │
                ▼
       Drizzle + better-sqlite3
                │
                ▼
              SQLite
```

CLI 负责初始化、启动及必要配置。本地服务同时提供页面和 MCP；页面无需第二个长期运行的应用服务。Vite 开发服务器只用于前端开发，发布包使用构建产物。

## 协议边界

- 不内置 Coding Agent 执行器、模型调用 SDK 或 Agent 编排框架。
- 不使用某个客户端的私有数据库、日志格式或会话 API 作为核心数据来源。
- 外部 Agent 负责理解讨论及整理回顾；通过 MCP 提交项目标识、内容变化和来源材料。CoSeed 负责验证、保存、追溯和展示。
- 客户端兼容性由 MCP 协议版本、传输方式及所用标准能力决定，不以客户端品牌决定；具体客户端的可用性仍须集成测试。
- 原始对话不是 MCP 自动提供的材料。来源输入由调用方提供，应保留原始片段及可用定位信息；平台特有的定位信息属于可选元数据。
- Web 和 MCP 都调用同一业务能力，不在协议适配层各写一套项目隔离或修订逻辑。

## 重要取舍

### 正式稳定版本

用户要求所有选型采用最新稳定版本，初始化因此使用 Node.js 26.13.0 LTS、npm 12.2.2 和 TypeScript 7.0.2。Node 27 的 Alpha 即使出现在 npm latest 标签也不采用；ELK 0.13.0 已被废弃，采用当前未废弃的稳定版 0.12.1。直接依赖精确锁定，完整安装结果以 package-lock.json 为权威。

本机原默认 Node 为 v22.22.2，本次使用独立缓存中的项目运行时，没有修改全局默认值。项目级选择方式见 `.nvmrc` 和运行文档。后续升级同样先排除预发布和废弃版本，再验证兼容性及实际运行。

### NestJS 和 Fastify

原先推荐 Hono，主要考虑轻量本地服务和较少的启动代码。Hono 也能组织模块，并非无法实现本产品。重新评估后，CoSeed 的项目、需求、设计、来源和修订等能力需要长期演进，Web/MCP 两种入口需要共享同一套业务服务，因此推荐 NestJS 的模块和依赖注入机制。代价是更多框架依赖、装饰器和启动配置。

NestJS 是应用框架，Fastify 是其 HTTP 适配器。选择 Fastify 侧重成熟插件生态及官方 MCP Fastify 集成参考，不基于未实测的吞吐性能。2026 年当前 Nest 官方文档已开始推荐 v12.3 的 NodeAdapter；它是后续可评估的替代适配器，不把 Fastify 称为官方默认或性能最优方案。

项目隔离、来源完整性和修订规则必须在共同的业务服务中成立，不能假定 Nest 的 HTTP Guard/Pipe 会自动保护 MCP 工具回调。

### 官方 MCP v2

官方 SDK 已发布 v2，服务端拆分为 `@modelcontextprotocol/server`，Node.js Streamable HTTP 传输位于 `@modelcontextprotocol/node`。新项目采用这条正式版本线，不照搬旧示例中的 v1 单包导入路径。

官方 `@modelcontextprotocol/fastify` 提供创建 Fastify 应用和 Host 校验等辅助能力，不是 NestJS 插件。实现时须接入 Nest 已有实例，验证请求体、原始响应、连接关闭和应用生命周期；不能直接调用其工厂再创建第二个服务。

### SQLite 与事务

当前场景是本地进程管理项目内容。一次更正的当前内容、修订和来源引用需要在同一保存边界中成立。SQLite 支持这一需求；具体表结构、项目归属约束和冲突检测机制另行设计。

`better-sqlite3` 包含原生模块，安装与打包需实际验证。当前 macOS ARM64 上已用 Node.js 26 执行真实读写；不能只凭这一结果宣称其他平台均可安装。

### 前端主题

Ant Design 提供表单、菜单、弹窗等通用能力，通过 ConfigProvider 的主题 Token 和局部 CSS 延续已经认可的视觉。AnimateIcons 可直接使用 React 包，不因此引入另一套组件库。Motion 用于适量状态反馈，避免与 Ant Design 或图形引擎同时控制同一元素的位置和 transform；尊重减少动态效果设置。

### 图形迁移

现有阅读原型已经使用 `elkjs@0.12.1`、`markdown-it@15.0.3` 以及 SVG / Canvas。优先迁移内容模型、布局规则、视觉资源和行为验证，不整段保留原型的全局脚本结构。

图形引擎推荐改为 X6 3，React Flow 12 为主要备选。理由、适配方式和验证门槛见[图形方案调研](../research/diagram-engines-2026.md)。推荐来自官方能力核对，尚不等同于完成实际集成。

独立业务图原型另有 Graphviz/Viz 参与布局；是否保留为特定图型的后备引擎，需要在迁移时对照效果和质量检查确定。业务图模型、布局输入及质量检查优先迁移，避免把 X6 的坐标或 Cell 实例作为业务内容的权威格式。综述页继续固定适应画布，不开放缩放、拖动或连线编辑。

## 已核对与尚未验证

### 性能也是选型验收条件

除功能和安装验证外，搭建时实际测量以下场景；当前尚无跑分或容量结论：

- 图形：按[图形方案调研的性能验收](../research/diagram-engines-2026.md#性能验收)分别测量加载、布局、绘制、交互及连续使用。
- 本地服务：从进程启动到页面/MCP 可用的耗时、空闲内存、回顾更新过程的 CPU 和内存峰值。
- 内容规模：构造多项目和逐步增长的需求、来源及修订数据，测量分页读取和完整更新事务的 P50/P95；Web 阅读与 MCP 更新同时发生时，验证响应及数据正确性。
- 分发：在目标系统上验证安装、首次启动、重启和升级；记录包体积及依赖安装成本。

先在固定环境建立基线并定位瓶颈，再确定数值预算和优化。框架的空路由吞吐量不能代替真实业务性能；性能优化必须保留项目隔离、修订原子性及完整图形语义。

### 资料及版本核对

已检查当前原型依赖、正式仓库状态、官方资料和 npm 元数据：

- `@nestjs/core@12.3.3`；`@nestjs/platform-fastify@12.3.3`，后者依赖 Fastify `5.12.8`。
- `@modelcontextprotocol/server@2.4.0`；官方 Fastify 适配包 `2.0.1` 声明兼容 `fastify ^5.2.0` 和服务端 SDK `^2.3.0`。这不代表已验证 Nest 集成。
- `antd@6.7.0`、`motion@14.9.1`、`@animateicons/react@0.13.0` 的 peer 范围覆盖 React 19；AnimateIcons 仓库及包声明为 MIT。
- `@antv/x6@3.1.8`、`@antv/x6-react-shape@3.0.1`，后者要求 X6 3 和 React 18+；图形备选及其版本见调研文档。
- `better-sqlite3@13.0.3` 声明 Node.js `>=22`；Drizzle ORM `0.45.4` 声明兼容 better-sqlite3 `>=7`；Drizzle Kit 当前稳定版 `0.31.11`。
- React `19.3.1`、Vite `8.3.6`、Zod `4.6.7` 当前均有正式发布元数据。

上面的资料版本是本次核对记录。初始化后的精确直接依赖见 package.json，完整依赖树见 package-lock.json，不在本文重复维护全部版本。基础检查覆盖配置合并、错误退出、真实 SQLite 读写、Web 资源及官方 MCP 客户端握手和 ping；安装包和浏览器验证按运行文档执行。

当前 HTTP 仅有服务状态接口，MCP 仅接入标准握手和 ping，没有业务工具，也未验证特定 Coding Agent 产品的实际连接。不能据此声明项目隔离或需求回顾业务已经完成。

## 资料

- [Node.js 发布状态](https://nodejs.org/en/about/previous-releases)
- [NestJS 模块](https://docs.nestjs.com/modules)
- [NestJS HTTP 适配器，包括 Fastify 与 NodeAdapter](https://docs.nestjs.com/techniques/performance)
- [官方 MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP 的 Fastify 适配](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/packages/middleware/fastify)
- [Ant Design](https://ant.design/docs/react/introduce/)
- [Motion for React](https://motion.dev/docs/react)
- [AnimateIcons](https://animateicons.in/icons/docs)
- [Drizzle SQLite 支持](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [React](https://react.dev/learn)
- [Vite](https://vite.dev/guide/)
