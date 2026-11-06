# CoSeed 当前架构

本文记录已运行实现。后续已确认方向见 [ADR 0003](docs/adr/0003-database-and-agent-cache.md)：数据库保存权威内容，Agent 经 MCP 拉取本地读取副本，正式修改通过 MCP 提交；没有要求本地连接器或资料 Git 仓库。数据库及内部保存／查询服务已实现；MCP 业务工具和本地文件副本尚未接入，现有本机服务不具备远程授权能力。

## 交付与进程

单仓库、单个 npm 发布包。`coseed start` 启动一个 NestJS 应用，使用 Fastify 同时提供构建后的 Web、HTTP 接口和 MCP Streamable HTTP。React/Vite 的开发服务器仅用于开发。

构建后的 `dist/cli`、`dist/server`、`dist/contracts`、`dist/web` 和 `migrations/` 一起打包。资源位置相对于安装包定位，不依赖启动时的工作目录。当前包设为 private，尚未发布；开源许可证待确定。

## 当前职责

| 位置                               | 职责                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| src/cli                            | 解析启动参数、加载配置、启动和退出                                                    |
| src/server/config                  | 合并配置、路径解析、Zod 校验，产出只读运行配置                                        |
| src/server/database                | SQLite/Drizzle 生命周期、正式迁移和查询列映射                                         |
| src/server/modules/project-content | 项目及业务内容的原子保存、来源、修订和固定快照查询，尚无公开接口                      |
| src/server/modules/system          | 真实服务状态检查                                                                      |
| src/server/mcp                     | 官方 SDK 的无会话 Streamable HTTP 适配；目前支持初始化和 ping，无业务工具             |
| src/server/security                | 本机 Host 和同源 Origin 检查                                                          |
| src/contracts                      | 服务状态、业务内容 Schema 及内部保存／读取契约                                        |
| src/web                            | 左侧导航、空工作台和 Agent 接入说明阅读页，读取真实服务状态；说明页和连接弹窗按需加载 |
| src/web/design-system              | 唯一的字体、布局、主题和动效 Token；统一 CSS、Ant Design、Motion 及明暗偏好           |

配置在创建 Nest 应用之前校验，CLI 参数覆盖环境变量，环境变量覆盖配置文件，文件覆盖默认值。Nest ConfigService 提供已经解析的配置，不再从调用者的仓库自动读取 `.env`。

数据库目录在应用初始化时创建。连接开启外键和 WAL，数据库文件为 `coseed.sqlite`。服务可写前由 Drizzle 完成 `migrations/` 中的正式迁移，检查已应用 SQL 的校验和及顺序；不接受未知业务表或新版本数据库的自动重置。没有种子业务数据。原生 SQL 定义延迟外键、生成列和触发器，`database/schema/` 只提供查询列映射，不能用普通自动 DDL 生成覆盖原生约束。

## 请求边界

当前 HTTP 契约为 `GET /api/status`，通过实际查询数据库确认就绪；其响应结构以 `src/contracts/service-status.ts` 为权威定义，OpenAPI 由脚本生成。

`POST /mcp` 由官方服务端 SDK 和 Node 传输处理，每次请求建立独立实例，使用 JSON 响应。`GET /mcp` 和 `DELETE /mcp` 返回 405；当前不提供 SSE 订阅或会话状态。未来需要这些能力时须重新设计生命周期。

服务仅绑定回环地址，检查请求 Host 和存在的 Origin，不启用任意来源 CORS。当前请求体上限为 1 MiB。内部共同保存服务已保证数据项目归属、来源引用及修订原子性；MCP 和 Web 后续接入它，不复制规则。远程授权属于入口责任，尚未实现。

## 图形和性能

X6、React 节点适配包和 ELK 已安装，尚未迁入完整业务图，也未进行图形容量或交互性能测试。它们不进入当前首页导入链。图形的内容模型独立于渲染引擎，迁移遵循既有图形调研和验收文档。

状态检查、MCP 握手、驱动运行与安装包验证，只能说明初始化基础链路成立，不等同于完整业务验收或跨平台性能结论。

## 前端设计系统

正式 Web 和独立设计样板共用 `src/web/design-system/` 的类型化入口及 Provider。中文使用系统字体，主题固定松针绿，支持明暗及跟随系统；样板与应用分别保存显示偏好。构建插件从同一主题和偏好读取函数生成首帧脚本，英文字标及 OFL 随 Web 包交付。页面布局和组件样式只消费该系统，基础设计不依赖业务模块。当前工作台已接入该系统，项目业务阅读功能仍未接入。

## 接入说明阅读页

`#/agent-guide` 是正式前端的静态文档页，内容唯一来源为 `docs/operations/agent-integration.md`，由 Vite 按需打包导入；页面不复制维护另一份正文。`src/web/agent-guide/` 负责文档分节、Markdown 呈现、章节定位、右侧目录和复制全文。Markdown 禁用原始 HTML，仓库内的本地运行参考文档作为可打开的构建资源交付。

桌面沿用全局阅读宽度和右侧目录，窄屏把目录移至顶栏；支持章节直达、刷新定位、滚动高亮和明暗模式。正文标明草稿及业务工具未接入，显示说明不代表 MCP 项目读写或本地副本拉取已实现。业务内容保存已在内部服务实现，页面未接入。

## 项目内容保存

`ProjectContentModule` 导出 `ProjectContentService`，内部按 persistence 和 validation 职责组织。逻辑输入与可信入口提供的写入上下文分开；目前没有新增 HTTP 路由或 MCP 工具。数据库是内容、来源和历史的唯一权威，不读写业务仓库 Git。

一个成功操作承载一个项目版本。来源、完整修订、关联和当前对象指针同事务写入，完整校验后最后插入操作封存，再推进项目指针。失败整批回滚；重试先查原操作；旧基准拒绝覆盖。历史不可修改，恢复追加新修订。

快照在一致读事务内按同一项目版本批量解析所有对象和图成员，共享节点变化不复制图成员修订；旧图依旧解析旧项目版本。需求关联当前对象，推进依据固定具体修订，历史图引用固定项目版本。详细字段和测试入口见 [存储实现](docs/database/storage-implementation.md)。
