# CoSeed 工程入口

CoSeed 是通过 Web 和客户端无关的 MCP 提供入口的项目认知工作台。当前实现仍为本机服务；后续部署与存储方向见 ADR 0003。正式业务功能仍在逐步实现，禁止把前期 Claude Monitor 示例当成 CoSeed 的真实数据。

## 项目技术约定

前端控件优先使用已确定的 Ant Design，动态图标使用 AnimateIcons，并接入全局设计系统。正式工作台不设顶栏，全局入口放在左侧栏。主题入口位于左下角，采用太阳／月亮动态图标按钮，无 Tooltip，点击直接切换浅色和深色；首次使用默认浅色，之后记住用户选择，不提供跟随系统模式。

## 先读什么

- 开发、分支、提交与发布：[CONTRIBUTING.md](CONTRIBUTING.md)。初始化基线之后使用功能分支，按可验收功能或阶段通过 PR 合并到 main；默认 squash，发布用 Tag。

- 当前实现与边界：[ARCHITECTURE.md](ARCHITECTURE.md)
- 业务规则及未决问题：[docs/requirements/product.md](docs/requirements/product.md)
- 技术决策：[当前初始化技术栈](docs/adr/0001-local-service-stack.md)；[数据库权威内容与 Agent 本地读取副本](docs/adr/0003-database-and-agent-cache.md)，数据库及 MCP 工具已实现，Agent 宿主落盘仍待验证；[成功操作与图快照解析](docs/adr/0004-operation-snapshot-resolution.md)细化保存模型；ADR 0002 的 Git 存储方向已被替代
- 数据模型进度与各模块提案：[docs/database/README.md](docs/database/README.md)；区分首批库表、综述、需求推进和业务设计，正式迁移和内部共同保存／查询服务已实现，MCP 工具已接入，业务页面待接入；实现边界见 [存储实现](docs/database/storage-implementation.md)。
- 项目快照和共同保存模型：[docs/database/snapshot-save-model.md](docs/database/snapshot-save-model.md)；SQL 以 `migrations/` 为权威，由 Drizzle 顺序执行；查询列映射不用于自动覆盖 DDL。
- 配置、启动和排错：[docs/operations/local-development.md](docs/operations/local-development.md)
- Agent 接入与使用：[简版指南草稿](docs/operations/agent-integration.md)，人类阅读版；Agent 通过 MCP read_guide 读取按需规范
- MCP 工具及提示词：[工具和提示词规范](docs/requirements/mcp-tools-design.md)，九个工具、一次直接保存、临时引用与幂等、快照文件协议；[直接保存决策](docs/adr/0005-direct-mcp-save.md)；实际发现契约见 docs/api/mcp-tools.json
- 前端设计与动效的全局约束：[docs/ui/design-system.md](docs/ui/design-system.md)
- 图形选型及性能验收：[docs/research/diagram-engines-2026.md](docs/research/diagram-engines-2026.md)

## 命令

使用 `.nvmrc` / `.node-version` 指定的 Node，npm 版本以 `package.json` 为准。

```bash
npm ci
npm run dev
npm run check
npm run test:e2e
npm run verify:package
```

HTTP 状态契约由共享 Zod 生成，MCP 契约从实际 SDK 工具发现生成：`npm run api:generate`；检查同步：`npm run api:check`。依赖使用正式稳定版本，直接依赖精确锁定，保留 lockfile；升级后实际验证，不只修改版本号。

设计稿样板：`npm run design:preview`；修改设计 Token 后执行 `npm run design:build`，核对颜色配对和独立样板构建；明暗模式行为验证使用 `npm run test:design`。

## 修改位置

- `src/web/`：阅读页面、组件和图形呈现。所有视觉与动效修改使用 `src/web/design-system/` 的权威 Token、共享样式和 Provider；样板同样消费该入口，不另建主题或字体数值源。
- `src/server/modules/`：按业务能力组织的规则和服务。
- `src/server/config/`、`database/`、`security/`：对应基础设施职责。
- `src/server/mcp/`：协议入口，不复制业务规则。
- `src/cli/`：命令行参数和启动，不承载业务。
- `src/contracts/`：共享 Schema 和协议数据类型，不放服务实现或通用杂物。

业务模块导出必要能力，避免通过跨模块访问内部文件形成隐式依赖。前端不得导入服务端代码；测试使用临时数据目录，不能使用个人默认数据库。MCP 已复用、Web 后续写入必须共享项目隔离、来源校验和修订保存规则。

项目创建、业务表和回顾数据的内部保存已实现，MCP 公开工具已接入，业务页面仍待接入。涉及产品文档中的待定规则时，不能用默认值替用户决定。
