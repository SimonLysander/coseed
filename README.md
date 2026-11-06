# CoSeed

CoSeed 帮助开发者与 Coding Agent 共同理解、设计和推进软件项目，将需求、设计及其演变整理成可以阅读、核对和修正的项目知识。

项目名称统一使用 **CoSeed**；仓库、包及命令名称使用小写 `coseed`。中文辅助名称为“共芽”。

## 当前进度

工程初始化已实现：React 工作台框架、Agent 接入说明阅读页、NestJS/Fastify 服务、CLI、分层配置、SQLite/Drizzle 连接和 MCP 标准握手。项目创建、业务数据、回顾读写工具以及完整业务图仍待实现。此前已经验证过项目综述、业务设计图等阅读原型；原型仍在前期工作目录，尚未迁入本仓库。Claude Monitor 是原型的示例项目，不是 CoSeed 本身。

当前运行实现是提供 Web 和 MCP 入口的本机服务。后续已确认方向为：Agent 使用已有 MCP 能力直接连接 CoSeed 服务，服务内部用 Git 管理项目资料及历史，数据库提供查询索引；无需本地连接器，也不要求业务仓库保存 CoSeed 资料。该方向尚未实现。一个实例可管理多个项目，各项目的内容、来源引用及更正历史独立，默认不跨项目读写。CoSeed 不依赖特定 Coding Agent，不内置执行器或模型 SDK。前端组件方向已确定为 Ant Design + Motion + AnimateIcons；其他推荐和待验证事项见技术选型文档。

## 开始开发

先使用 `.nvmrc` 指定的 Node 和 `package.json` 指定的 npm；当前基线为 Node.js 26.13.0 LTS 和 npm 12.2.2。

```bash
npm ci
cp .env.example .env
npm run dev
```

开发页面：`http://127.0.0.1:5173`。开发配置默认服务端口 4310，MCP 地址为 `http://127.0.0.1:4310/mcp`。正式构建使用 `npm run build` 和 `npm start`，页面与 MCP 由同一服务提供。

```bash
npm run check
npm exec playwright install --no-shell chromium
npm run test:e2e
npm run verify:package
```

运行配置支持启动参数、`COSEED_*` 环境变量及 JSON 文件，首次运行无需配置文件。默认使用操作系统对应的用户目录，开发数据通过 `.env` 放入仓库内被忽略的 `.coseed/development`。详见[本地开发与配置](docs/operations/local-development.md)。当前包为 private，尚未发布，开源许可证待确定。

## 参与开发

分支、提交、PR 检查与版本发布规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。采用 GitHub Flow，按可验收功能分批推进；CI 配置随仓库提交，远程分支保护需单独启用。

## 设计入口

- [Agent 接入与使用指南](docs/operations/agent-integration.md)：简版草稿已显示在正式前端 `#/agent-guide`，业务工具及远程配置尚未接入。

- [当前架构](ARCHITECTURE.md)：已实现的模块边界、生命周期和交付方式。
- [工程上下文入口](AGENTS.md)：目录职责、验证命令及知识入口。
- [全局设计系统](docs/ui/design-system.md)：轻手绘基调、紧凑布局、具体 Token 和动态图标规则；正式应用与样板共用系统字体、松针绿和排版；`npm run design:preview` 打开独立样板。
- [技术选型](docs/adr/0001-local-service-stack.md)：首版技术栈、协议边界、依据及待验证事项。
- [2026 图形方案调研](docs/research/diagram-engines-2026.md)：X6、React Flow、G6、Mermaid 的适用性及真实图形验证要求。

- [业务设计](docs/requirements/product.md)：产品范围、核心概念、业务关系、职责边界和验收场景。
- [工作台界面设计](docs/ui/workbench.md)：项目选择、阅读布局、需求详情和回顾入口的第一版草案。
- [真实讨论的回顾示例](docs/requirements/retrospective-example.md)：用 CoSeed 自身的讨论说明需求、记录、修订及回顾怎样区分。
- [HTTP 接口契约](docs/api/openapi.json)：由共享 Zod 定义生成；MCP 遵循官方协议。

以上文档区分已确定的方向、首版建议与尚待确认的问题。业务概念用于统一理解，不直接等同于数据库表。
