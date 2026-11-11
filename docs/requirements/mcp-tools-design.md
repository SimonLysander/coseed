# MCP 工具及提示词规范

状态：第 2 阶段实现。采用九个工具、一次直接保存，不设置强制准备／提交、草稿表或资料 Git。业务保存复用 `ProjectContentService`。项目与综述页面已接入，需求推进页面已接入，业务设计页面已接入；当前服务只允许本机连接，尚无远程身份与项目授权。

## 1. 目标和职责

Agent 取得明确项目的一致资料，结合实际代码及用户指定的讨论范围整理变化，保存有依据、可追溯的新版本。工具不替 Agent 判断业务结论，不获取内部推理，也不自动取得完整聊天记录。

- Agent：理解业务、区分进展与纠错、判断受影响对象、提供实际材料。
- 指南提示词：解释目标、业务含义、整理方法及未知情况的处理；调用语义由工具描述和字段 Schema 提供。
- Schema 和共同保存服务：检查结构、项目归属、版本、引用、来源覆盖和事务。
- MCP：明确调用范围，分配新增 ID，解析同批引用，提供事实式结果。
- 页面：展示权威内容和历史；当前已接入综述、需求和业务设计查询。

结构合法和引用存在，不代表材料真的支持业务结论。节点职责是否正交完备、设计是否合理，仍需根据真实项目审阅。

## 2. 工具职责

| 工具              | 输入和返回                                                           | 副作用                 |
| ----------------- | -------------------------------------------------------------------- | ---------------------- |
| `read_guide`      | 指定 topic，返回规范版本、正文及该主题的权威 Schema                  | 无                     |
| `list_projects`   | 名称子串筛选、afterId、limit；返回项目 ID、名称、版本及 nextAfterId  | 无                     |
| `get_project`     | projectId；返回项目资料、当前版本及当前 operationId                  | 无                     |
| `export_snapshot` | 固定项目和版本，分页读取清单或文件字节                               | 只生成可重建的内存缓存 |
| `list_revisions`  | 固定项目版本和对象；按修订号倒序分页                                 | 无                     |
| `read_revision`   | 固定对象修订，或图 ID 加项目版本；返回内容和原始来源                 | 无                     |
| `get_operation`   | 创建 key、项目内保存 key，或项目加 operationId；返回成功回执         | 无                     |
| `create_project`  | 名称、可选仓库定位、requestKey；创建版本 0 的空项目                  | 创建项目               |
| `save_changes`    | 已读基准、来源和完整逻辑对象变化；返回回执及临时名称到正式 ID 的映射 | 一次原子保存           |

没有隐式当前项目。列表是实时项目发现；内容和历史读取明确固定 version，分页不会混入新保存。列表 meta.total 表示本页条目数，不假装是全库总数。

运行输入以 `src/contracts/mcp.ts` 为准，内容 Schema 沿用 `src/contracts/content/`。`docs/api/mcp-tools.json` 从真实服务的官方 MCP 客户端工具发现生成，包含实际描述、输入、输出和 annotations，不把 MCP 虚构为 REST 路由。

## 3. 直接保存、ID 和重试

`save_changes` 一次可以共同更新综述、需求、记录和图。有依赖的一组修改在同一事务保存，不自动拆批、不自动合并。系统产生正式 ID、保存时间和结果版本。

已有对象沿用实际读取的 ID 和 expectedRevision。project/overview 的 ID 均为 projectId；其他新增对象以 `id: "$theme"`、`expectedRevision: null` 表示。新增来源也使用 `$临时名称`。同批引用使用相同名称，服务按有类型的引用字段解析；正文、TS 类型、来源原文、locator 和综述内部局部 ID 保持原样。临时名称只含字母、数字、下划线、点和短横线，全批唯一，不能跨批沿用；下一批使用回执中的正式 ID。

`requestKey` 来自当前任务，是调用者为本次逻辑保存选定的稳定名称，例如 `theme-review-2026-11-06`。不是让模型猜测已有 UUID。创建 key 在实例内唯一；保存 key 在项目内唯一。它不是认证凭据。

服务以固定命名空间、动作、项目和 key 计算操作 ID；新增 ID 再由操作 ID、对象类型和临时名称确定。因此同一请求在进程重启后重试，仍得到相同映射。共同保存服务以规范化请求摘要检查内容：同 key 同内容返回原回执；同 key 不同内容拒绝。不同保存意图使用不同 key；改动已成功的请求需要新 key。

超时后用原 key 查询，或以原 key 和原始内容重试。没有查到成功回执不证明另一个请求没有执行。保存成功但客户端副本刷新失败时，不重新保存业务内容。

旧基准或旧对象修订拒绝覆盖；重新阅读并核对，不只复制最新版本数字。没有实际变化返回 NO_CHANGES，不增加项目版本。HTTP 请求上限 1 MiB，超限为 413 且整批未保存；第一版没有分块上传或隐式拆分。

## 4. 字段来源和可信边界

| 字段                              | 来源                             |
| --------------------------------- | -------------------------------- |
| 项目、已有对象和来源 ID           | 实际工具读取或创建回执           |
| baseVersion、expectedRevision     | 本轮实际读取的资料               |
| 分页位置、文件路径                | 上一页返回或快照清单             |
| requestKey、新增临时名称、正文    | 当前任务及本次整理内容           |
| 原始材料、位置、发生时间          | 实际取得的讨论、代码、验证和文档 |
| 正式 ID、savedAt、结果版本        | 服务产生                         |
| entrypoint、actorKind、actorLabel | 入口独立提供，调用参数不能覆盖   |

当前 MCP 上下文固定记录 entrypoint=mcp、actorKind=agent、actorLabel=“本机 MCP Agent（未认证）”。这准确表达入口，不假装是已经认证的人员身份。显示名和 key 不构成权限。

来源不可变，字节级保留原始空白；发生时间未知使用 null。citations 用内容 JSON Pointer 和 before/after 标明支持的变化。新来源用新临时名称；已保存来源通过正式 sourceId 引用。来源覆盖校验不能验证事实真伪。

## 5. 文件协议 v1

`export_snapshot` 始终固定 projectId 和 version。它不会写 Agent 的本地文件系统。

- `part.kind=manifest`：最多 100 项文件描述；afterPath 使用上次 nextAfterPath。
- `part.kind=file`：path 必须来自清单；offset 为字节偏移；maxBytes 上限 65536。返回 base64 字节及 nextOffset，保证中文和换行不会因分块损坏。
- 每页都有 formatVersion、serviceId、projectId、version、manifestSha256、totalFiles 和 totalBytes。
- 每项清单只有 path、bytes、sha256。清单摘要为 RFC 8785 规范化 `{formatVersion, serviceId, projectId, version, files}` 的 SHA-256；files 按路径升序，清单不将自身纳入摘要。
- 文件为 UTF-8 规范 JSON 加换行；摘要按实际字节计算。服务根据对象 ID 的摘要生成路径，不把任意 ID 拼成文件路径。

```text
current/
  project/<hash>.json
  overview/<hash>.json
  requirements/<hash>.json
  records/<hash>.json
  retrospectives/<hash>.json
  design/{entities,relationships,diagrams,notes}/<hash>.json
history/
  <对应类型目录>/<hash>/<revisionNo>.json
  diagram-views/<hash>/<projectVersion>.json
sources/<hash>.json
```

空内容没有占位文件。对象文件保存完整修订元数据、正文、来源和链接。current 包含全部当前内容，不按需求状态筛除；history 只补当前资料所需的固定旧修订、状态依据和历史图。历史图按同一项目版本解析成员，递归补齐引用及来源，不导出无关的全部修订历史。

实例身份保存在数据目录的 instance.json，重启后沿用；损坏时明确失败，不静默重新生成身份。数据库恢复或迁移时需同时保留实例身份文件；真正复制为独立服务应使用独立数据目录和身份。

导出使用成熟 [lru-cache](https://isaacs.github.io/node-lru-cache/)；最多 4 项、按内容字节计算 32 MiB、TTL 15 分钟。分页位置和字节索引不依赖缓存生存；缓存丢失或进程重启可从不可变版本重建相同字节。单次构建仍读取完整项目及必要历史，不能把缓存上限当作整个请求的峰值内存上限；超大项目容量尚未验证。

Agent 利用自身文件能力下载到 staging，解码、核对全部文件及清单，再切换读取副本；中断保留旧完整副本。参考缓存目录为 `<cacheRoot>/<serviceId>/<projectId>/versions/<version>/`。完整下载不等于全部加入模型上下文。不同宿主对 MCP 结果和本地文件能力的衔接仍需逐个验证；官方 SDK 集成测试不等于已验证所有 Agent 产品的自动落盘。

## 6. 结果和错误

使用 MCP 标准 structuredContent，并提供同份 JSON 的文本兼容表达。结果包含 summary 和 data；列表或一批修改另有 meta，预览最多五项及本次条目数。summary 是可读事实，不含内部 ID。

业务失败 isError=true，返回 error.code、message 和已知 details。主要代码为 INVALID_INPUT、NOT_FOUND、CONFLICT、OPERATION_MISMATCH、INVALID_REFERENCE、MISSING_EVIDENCE、NO_CHANGES、STORAGE_BUSY、STORAGE_CORRUPT、UNSUPPORTED_CONTENT 和 INTERNAL_ERROR。CONFLICT 可返回实际 currentVersion 和传入 baseVersion；结构错误给字段路径。SDK 在处理函数之前发现的非法参数按其标准 MCP 错误返回，可能只有错误文本；HTTP 和协议错误也不强制套业务结果。未知内部异常只返回保存结果未确认，诊断堆栈留在服务端。

不输出 next_action、建议自动合并或伪造的完成状态。相同摘要用于必要结构化日志，不记录完整来源正文，也不把工具日志当作需求推进记录。annotations 只帮助宿主理解能力，不代替权限与服务端校验。

## 7. 提示词分层

- 短入口：MCP instructions 说明用途、规范入口和授权边界。
- 工具和字段描述：调用前说明范围、副作用、参数来源及结果；分页、快照校验、保存标识、状态变更和引用字段的接口语义在对应描述及 Schema 维护。
- 同源指南：`read_guide(topic="usage")` 返回完整接入与写作文章；overview、requirements、design、sources、export 返回文章的共同任务背景和对应章节，内容主题附运行 Schema。topic 仍为原有六项，不增加新工具。

协作和写作规范唯一正文为 `docs/operations/agent-integration.md`，`src/server/mcp/guides.ts` 用 markdown-it 解析章节并提供 MCP 投影，guideVersion=2；页面直接渲染并复制同一全文。历史约定清单仅作核对资料。工具与字段语义以注册的 description 和共享 Schema 为准，通过实际工具发现生成契约；指南保留业务判断和内容写法，不再复述参数、返回值及协议细节。宿主是否读取 instructions 由客户端决定，CoSeed 不拥有其系统提示词，也不保证规范必然被模型遵守。

遵循 designing-agent-tools、writing-prompts 和[用户提供的提示词原则](https://lux-stirring.space/note?at=6a4df7251d165e0ccde2225c&node=ci_b3b7f69b47a6)：先交代目标和上下文，必要约束使用枚举、Schema 和实际校验，未知情况留出口，例子校准关键判断，不要求内部思维过程。

校准例子：过去确实决定跟随系统、后来取消，是新进展；旧记录误写蓝色、原话选择松针绿，是纠错；只有当前代码、没有当时讨论，历史意图保持未知。规范不能替代权限，也不能靠提示词保证业务真实性。

## 8. 验证和剩余边界

官方 MCP 客户端通过真实 HTTP 服务验证工具发现、空项目、同批引用、原始来源、幂等、冲突、项目隔离、对象修订、图成员版本、清单分页和文件摘要、重启恢复及体积限制。数据库原有语义测试继续覆盖回滚、状态依据、恢复和来源覆盖。测试使用临时目录，不写个人项目库。

仍待验证或实施：真实 Agent 宿主自动落盘和提示词行为评测、超大项目容量、远程认证及项目授权、实时更新。本轮不增加租户、执行器、内容 Git 或客户端连接器。

参考：[存储实现](../database/storage-implementation.md)、[共同版本模型](../database/snapshot-save-model.md)、[MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。
