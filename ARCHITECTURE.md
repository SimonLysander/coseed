# CoSeed 当前架构

本文记录已运行实现。后续已确认方向见 [ADR 0003](docs/adr/0003-database-and-agent-cache.md)：数据库保存权威内容，Agent 经 MCP 拉取本地读取副本，正式修改通过 MCP 提交；没有要求本地连接器或资料 Git 仓库。数据库及内部保存／查询服务已实现；九个 MCP 业务工具及固定版本文件读取已接入；客户端使用自身文件能力落盘，真实 Agent 宿主的自动落盘仍待验证，现有本机服务不具备远程授权能力。

## 交付与进程

单仓库、单个 npm 发布包。`coseed start` 启动一个 NestJS 应用，使用 Fastify 同时提供构建后的 Web、HTTP 接口和 MCP Streamable HTTP。React/Vite 的开发服务器仅用于开发。

构建后的 `dist/cli`、`dist/server`、`dist/contracts`、`dist/web` 和 `migrations/` 一起打包。资源位置相对于安装包定位，不依赖启动时的工作目录。当前包设为 private，尚未发布；开源许可证待确定。

## 当前职责

| 位置                               | 职责                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| src/cli                            | 解析启动参数、加载配置、启动和退出                                                          |
| src/server/config                  | 合并配置、路径解析、Zod 校验，产出只读运行配置                                              |
| src/server/database                | SQLite/Drizzle 生命周期、正式迁移和查询列映射                                               |
| src/server/modules/project-content | 项目及业务内容的原子保存、来源、修订和固定快照查询，由 MCP 复用                             |
| src/server/modules/system          | 真实服务状态检查                                                                            |
| src/server/mcp                     | 官方 SDK 无会话 HTTP；工具、临时引用解析、按需规范、固定快照文件导出                        |
| src/server/security                | 本机 Host 和同源 Origin 检查                                                                |
| src/contracts                      | 服务状态、内容 Schema、内部保存／读取及 MCP 输入输出契约                                    |
| src/web                            | 无顶栏左侧导航、真实项目选择／创建、综述、需求时间线和 Agent 指南；按路由及图形需要加载模块 |
| src/web/design-system              | 唯一的字体、布局、主题和动效 Token；统一 CSS、Ant Design、Motion 及明暗偏好                 |

配置在创建 Nest 应用之前校验，CLI 参数覆盖环境变量，环境变量覆盖配置文件，文件覆盖默认值。Nest ConfigService 提供已经解析的配置，不再从调用者的仓库自动读取 `.env`。

数据库目录在应用初始化时创建。连接开启外键和 WAL，数据库文件为 `coseed.sqlite`。服务可写前由 Drizzle 完成 `migrations/` 中的正式迁移，检查已应用 SQL 的校验和及顺序；不接受未知业务表或新版本数据库的自动重置。没有种子业务数据。原生 SQL 定义延迟外键、生成列和触发器，`database/schema/` 只提供查询列映射，不能用普通自动 DDL 生成覆盖原生约束。

## 请求边界

HTTP 提供 `/api/status` 以及项目列表、空项目创建、元数据、综述、需求和业务设计读取。项目、需求及业务图 HTTP 契约以 `src/contracts/projects-http.ts`、`src/contracts/requirements-http.ts`、`src/contracts/business-http.ts` 为权威，复用已有内容 Schema，OpenAPI 从共享 Schema 生成。综述读取在同一事务固定项目版本和名称，不为阅读综述加载整张业务图；响应不使用浏览器 HTTP 缓存。

`POST /mcp` 由官方服务端 SDK 和 Node 传输处理，每次请求建立独立实例，使用 JSON 响应。`GET /mcp` 和 `DELETE /mcp` 返回 405；当前不提供 SSE 订阅或会话状态。未来需要这些能力时须重新设计生命周期。

服务仅绑定回环地址，检查请求 Host 和存在的 Origin，不启用任意来源 CORS。当前请求体上限为 1 MiB。内部共同保存服务已保证数据项目归属、来源引用及修订原子性；MCP 已接入它，Web 后续沿用，不复制规则。远程授权属于入口责任，尚未实现。

## 图形和性能

X6 和 ELK 已用于综述的概念关系图、分节用例图及业务全景／模块内部图。业务图由同一项目版本解析，目录和外部 owner 为 compound 层次；交叉技术范围独立表达，用 polygon-clipping 裁剪成员轮廓，不改变唯一目录归属。ELK 先计算实测卡片和标签，再由 X6 保留其路径；版本与交互约定见 [业务阅读](docs/requirements/business-reading.md)。已用 100／200 和 300／600 的合成样本进行浏览器可用性抽样；不承诺容量 SLA。重复布局复用有界的内存 LRU，隐藏测量 DOM 测完即移除，内容权威仍为数据库。性能按够用且不阻碍操作收口，不继续追求极限跑分。引擎按需加载，空项目不启动布局 Worker。图形的内容模型独立于渲染引擎，迁移遵循既有图形调研和验收文档。

状态检查、MCP 握手、驱动运行与安装包验证，只能说明初始化基础链路成立，不等同于完整业务验收或跨平台性能结论。

## 前端设计系统

正式 Web 和独立设计样板共用 `src/web/design-system/` 的类型化入口及 Provider。中文使用系统字体，主题固定松针绿，左侧栏底部提供无 Tooltip 的日月按钮直接切换明暗，默认浅色并保存选择；样板与应用分别保存显示偏好。构建插件从同一主题和偏好读取函数生成首帧脚本，英文字标及 OFL 随 Web 包交付。页面布局和组件样式只消费该系统，基础设计不依赖业务模块。当前工作台、项目下拉选择、行内创建、综述和需求阅读共用该系统。

## 接入说明阅读页

`#/agent-guide` 是正式前端的静态文档页，内容唯一来源为 `docs/operations/agent-integration.md`，由 Vite 按需打包导入；页面不复制维护另一份正文。`src/web/agent-guide/` 负责文档分节、Markdown 呈现、章节定位、右侧目录和复制全文。Markdown 禁用原始 HTML，仓库内的本地运行参考文档作为可打开的构建资源交付。

桌面沿用全局阅读宽度和右侧目录，窄屏把目录入口放在文章标题旁；支持章节直达、刷新定位、滚动高亮和明暗模式。正文说明 MCP 工具和业务页面的实际边界。人和 Agent 共用这一份接入与写作正文：read_guide 的 usage 返回全文，其余 topic 通过 markdown-it 的标准源行范围提取对应章节及共同任务背景，并附该主题的共享 Schema。文档随 npm 包交付，服务以模块相对路径读取，不依赖进程工作目录。页面没有复制全套工具 Schema。历史摘录仅在仓库归档，正式前端已移除其入口、路由及页面。项目综述已接入，需求推进页面已接入，业务设计页面已接入。

## 项目内容保存

`ProjectContentModule` 导出 `ProjectContentService`，内部按 persistence 和 validation 职责组织。逻辑输入与可信入口提供的写入上下文分开；MCP 和 HTTP 项目入口都通过该服务读写；HTTP 控制器仅处理协议校验与读取投影。数据库是内容、来源和历史的唯一权威，不读写业务仓库 Git。

一个成功操作承载一个项目版本。来源、完整修订、关联和当前对象指针同事务写入，完整校验后最后插入操作封存，再推进项目指针。失败整批回滚；重试先查原操作；旧基准拒绝覆盖。历史不可修改，恢复追加新修订。

快照在一致读事务内按同一项目版本批量解析所有对象和图成员，共享节点变化不复制图成员修订；旧图依旧解析旧项目版本。需求关联当前对象，推进依据固定具体修订，历史图引用固定项目版本。详细字段和测试入口见 [存储实现](docs/database/storage-implementation.md)。

## MCP 读写和文件副本

`McpModule` 保持官方 SDK 的无会话 HTTP 生命周期。`McpToolsService` 注册九个工具，`src/contracts/mcp.ts` 复用内容 Schema；`read_guide` 仅转换所读主题的 Schema。`api:generate` / `api:check` 用临时实例和官方 MCP 客户端生成／核对 `docs/api/mcp-tools.json`，不维护第二套工具清单。

`save_changes` 一次保存，没有强制准备步骤。调用者提供稳定 requestKey 和 `$临时名称`，入口按命名空间计算操作／新增对象 ID，只解析有类型的引用字段；来源原文、正文和 TS 保持原样。共同服务负责事务、版本冲突、规范请求幂等及修订历史。执行者固定记录为未认证的本机 MCP Agent，不信任请求伪造的入口字段。

导出固定项目版本，补齐当前内容所引用的历史修订、状态依据、历史整图及来源。文件为 UTF-8 规范 JSON，以 SHA-256 生成安全路径和完整性摘要，清单分页、文件按字节分块。使用 lru-cache 限制缓存项数、内容字节和 TTL；首次构建仍读取完整项目及必要历史，尚未验证超大项目峰值内存和吞吐。实例身份写入数据目录 instance.json，备份迁移需保留；损坏时启动失败。

官方客户端测试验证 HTTP 工具读写、固定历史、下载校验和重启重试；不等于已验证实际 Agent 的模型判断、规范遵循和自动落盘。协议细节见 [MCP 规范](docs/requirements/mcp-tools-design.md)。

## 项目入口与综述阅读

`ProjectsHttpModule` 注册项目发现、创建、元数据和综述视图，复用 `ProjectContentService`，不新增库表或另一套写入逻辑。Web 创建保留 UUID 操作标记，执行者明确记录为未认证的本机用户；请求不能覆盖入口身份字段。项目级引用隔离不等于多用户授权。

React Router 的 HashRouter 管理项目与章节链接；旧 `#/overview` 恢复浏览器上次选择，未选项目时显示真实入口，不自动选择列表第一项。TanStack Query 管理项目业务查询和创建状态，按项目 ID 隔离缓存；写请求不自动重试，读请求仅对网络或服务端失败最多重试一次。请求以标准 AbortSignal 取消和 15 秒超时，失败仍显示其实际状态。

浏览器只用 localStorage 记录项目选择、sessionStorage 保留待确认创建请求；不是权威业务存储。未知创建结果复用原请求核对，页面刷新后可恢复；成功后清理待确认请求。综述仍由 Agent 经 MCP 维护，网页不新增自由编辑或发布流程。

综述按产品说明、核心概念、使用示例阅读。每个示例保持稳定身份链接，标题改动和排序不改变目标。图从内容模型派生，不存布局坐标。ELK 在共享 Worker 中计算几何，X6 原生 boundary 计算实际形状端点；主题切换只更新样式，单独改产品正文不重算不受影响的图。ResizeObserver 观察外层自适应容器，页面缩窄时不保留图引擎旧宽度。全部综述图只读、固定适应画布。

详细交互、接口和验证边界见 [项目入口与综述](docs/requirements/project-workbench.md)。

## 需求推进阅读

`RequirementsReadService` 在项目内容模块内复用同一快照解析和来源读取。需求列表、当前记录和修订分别分页；来源只在读取具体修订时返回，不通过导出全项目完成页面查询。HTTP 沿用项目模块的契约校验和错误映射，不新增写入或数据库结构。

列表首请求、需求详情固定一个项目版本，后续页及历史必须携带该版本。需求按最近更新排列；推进记录按首次收录的版本和同批次序倒序，修订旧记录不挪位置，真实发生时间单独显示。状态变化时间从最近一次真实状态变化得到，正文修订不产生假的状态事件。状态依据固定记录的具体版本。

`src/web/requirements/` 使用现有路由、查询、Markdown 和 Ant Design Timeline/Drawer/Collapse。修订面板按打开时的版本读取，原始来源按需展开。项目隔离、状态依据、旧归属和移除历史继续由共同存储模型约束。交互和验证入口见 [需求推进阅读](docs/requirements/requirements-reading.md)。
