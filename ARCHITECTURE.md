# CoSeed 当前架构

本文记录已运行实现。后续已确认方向见 [ADR 0002](docs/adr/0002-agent-workspace-sync.md)：Agent 直接接入部署服务的 MCP，服务内部用 Git 管理资料及历史；没有要求本地连接器。该方向尚未实现，不等同于下面的现有本机服务已具备远程业务能力。

## 交付与进程

单仓库、单个 npm 发布包。`coseed start` 启动一个 NestJS 应用，使用 Fastify 同时提供构建后的 Web、HTTP 接口和 MCP Streamable HTTP。React/Vite 的开发服务器仅用于开发。

构建后的 `dist/cli`、`dist/server`、`dist/contracts` 和 `dist/web` 一起打包。资源位置相对于安装包定位，不依赖启动时的工作目录。当前包设为 private，尚未发布；开源许可证待确定。

## 当前职责

| 位置                      | 职责                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------- |
| src/cli                   | 解析启动参数、加载配置、启动和退出                                                    |
| src/server/config         | 合并配置、路径解析、Zod 校验，产出只读运行配置                                        |
| src/server/database       | 一个 SQLite 连接及 Drizzle 客户端，随应用生命周期打开和关闭                           |
| src/server/modules/system | 真实服务状态检查                                                                      |
| src/server/mcp            | 官方 SDK 的无会话 Streamable HTTP 适配；目前支持初始化和 ping，无业务工具             |
| src/server/security       | 本机 Host 和同源 Origin 检查                                                          |
| src/contracts             | 服务状态 Zod 契约及派生类型                                                           |
| src/web                   | 左侧导航、空工作台和 Agent 接入说明阅读页，读取真实服务状态；说明页和连接弹窗按需加载 |
| src/web/design-system     | 唯一的字体、布局、主题和动效 Token；统一 CSS、Ant Design、Motion 及明暗偏好           |

配置在创建 Nest 应用之前校验，CLI 参数覆盖环境变量，环境变量覆盖配置文件，文件覆盖默认值。Nest ConfigService 提供已经解析的配置，不再从调用者的仓库自动读取 `.env`。

数据库目录在应用初始化时创建。连接开启外键和 WAL，数据库文件为 `coseed.sqlite`。目前没有业务表、自动迁移或种子数据；未来迁移须在服务可写前完成，并保持可 review 的迁移文件。

## 请求边界

当前 HTTP 契约为 `GET /api/status`，通过实际查询数据库确认就绪；其响应结构以 `src/contracts/service-status.ts` 为权威定义，OpenAPI 由脚本生成。

`POST /mcp` 由官方服务端 SDK 和 Node 传输处理，每次请求建立独立实例，使用 JSON 响应。`GET /mcp` 和 `DELETE /mcp` 返回 405；当前不提供 SSE 订阅或会话状态。未来需要这些能力时须重新设计生命周期。

服务仅绑定回环地址，检查请求 Host 和存在的 Origin，不启用任意来源 CORS。当前请求体上限为 1 MiB。项目隔离、写入来源与修订原子性属于后续业务层责任，不由 MCP 或 HTTP 框架自动实现。

## 图形和性能

X6、React 节点适配包和 ELK 已安装，尚未迁入完整业务图，也未进行图形容量或交互性能测试。它们不进入当前首页导入链。图形的内容模型独立于渲染引擎，迁移遵循既有图形调研和验收文档。

状态检查、MCP 握手、驱动运行与安装包验证，只能说明初始化基础链路成立，不等同于完整业务验收或跨平台性能结论。

## 前端设计系统

正式 Web 和独立设计样板共用 `src/web/design-system/` 的类型化入口及 Provider。中文使用系统字体，主题固定松针绿，支持明暗及跟随系统；样板与应用分别保存显示偏好。构建插件从同一主题和偏好读取函数生成首帧脚本，英文字标及 OFL 随 Web 包交付。页面布局和组件样式只消费该系统，基础设计不依赖业务模块。当前工作台已接入该系统，项目业务阅读功能仍未接入。

## 接入说明阅读页

`#/agent-guide` 是正式前端的静态文档页，内容唯一来源为 `docs/operations/agent-integration.md`，由 Vite 按需打包导入；页面不复制维护另一份正文。`src/web/agent-guide/` 负责文档分节、Markdown 呈现、章节定位、右侧目录和复制全文。Markdown 禁用原始 HTML，仓库内的本地运行参考文档作为可打开的构建资源交付。

桌面沿用全局阅读宽度和右侧目录，窄屏把目录移至顶栏；支持章节直达、刷新定位、滚动高亮和明暗模式。正文标明草稿及业务工具未接入，显示说明不代表 MCP 项目读写或服务端 Git 保存已实现。
