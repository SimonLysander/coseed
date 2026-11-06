# 项目快照、保存操作及对象修订

状态：**方向已确认，物理 SQL 和保存流程仍为设计草案，未接入运行时。** 本版按 [ADR 0004](../adr/0004-operation-snapshot-resolution.md) 简化：成功操作直接承载项目版本，不再建立 project_versions 表；图内成员按同一项目快照解析。

## 1. 整体关系

```text
项目 P：当前内容版本 25
    ↓ 定位同项目的成功操作
op-A：基准 24 → 结果 25，执行者、入口、保存时间
    ├── 需求 R / 修订 4：完整本版内容及具体来源
    ├── 记录 N / 修订 2：纠正旧记录
    ├── 新记录 M / 修订 1：后来形成的新结论
    └── 节点 E / 修订 3：更新共享职责

图的成员清单没有变化 → 图自身不制造新修订
读取项目版本 25 → 当前图显示节点 E / 修订 3
读取项目版本 24 → 历史图显示节点 E 当时的修订
```

以上均为演示数据。一次保存可修改多个对象，一次回顾可有多次保存；操作不是推进记录，也不是一个需求。

## 2. 项目当前版本

projects 保留稳定身份和两个用途不同的指针：

| 字段                    | 含义                                                           |
| ----------------------- | -------------------------------------------------------------- |
| id                      | 稳定项目身份和隔离边界                                         |
| current_content_version | 整个项目当前版本，对应 write_operations 的同项目结果版本       |
| current_revision_no     | 项目名称、仓库定位这些基本资料自身的当前修订，不是整个项目版本 |
| created_at              | 服务端首次建立项目的 UTC 毫秒时间                              |

新项目在创建事务中保存项目基本资料修订 1、创建操作版本 0 及输入来源。业务内容集合为空，不生成虚构需求或图。之后每次实际改变正式内容的成功保存递增一次。读取、导出、失败、缓存刷新、没有变化的请求和重复提交均不新增版本。

ID 使用不带业务含义的稳定标识；版本是非负安全整数，时间是 UTC 毫秒整数。不同项目的版本不能比较先后，时间和随机 ID 不承担版本排序。

## 3. 成功操作就是项目版本锚点

write_operations 同时记录“这次怎么保存”和“保存后的项目版本”，不再维护一份独立版本登记。

| 字段                    | 含义及约束                                           |
| ----------------------- | ---------------------------------------------------- |
| id                      | 稳定操作 ID；同一次逻辑请求重试不换 ID               |
| project_id              | 目标项目；与全部新修订及来源一致                     |
| base_content_version    | 实际读取的基准；仅创建项目为 NULL                    |
| result_content_version  | 数据库生成：创建为 0，其他为基准加一；同项目唯一     |
| request_hash            | 规范化逻辑请求的 SHA-256，判断同标识是否同载荷       |
| entrypoint              | web / mcp / cli / system                             |
| actor_kind、actor_label | 实际可获得的执行者类型及显示信息，标签不冒充认证身份 |
| client_metadata_json    | 已取得的辅助调用定位，不存凭据，不代替原始来源       |
| note_md                 | 可选保存说明，不代替各项修改的具体依据               |
| saved_at                | 服务端实际保存时间，本次产生的修订共同引用           |

约束为 UNIQUE(project_id, result_content_version)，项目当前指针及基准均通过同项目复合外键定位操作。普通保存只能基于当前版本；失败或校验不通过的操作不作为成功历史保存。

请求哈希针对项目、基准、逻辑修改及来源等实际输入，排除服务生成的时间和分配结果。具体输入随工具契约固定；建议采用 [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) 规范化 JSON 后计算，正文原文不得 trim 或改换行。

先验证权限，再查既有操作。同标识同请求直接返回原成功回执，不先按过期基准拒绝重试；同标识不同请求明确拒绝。相似内容不跨操作按哈希强行去重，因为后来可能再次做出相同决定。

回执从不可变操作及其新修订生成：操作 ID、项目结果版本、保存时间、对象及修订清单。不增加重复操作结果表，也不把临时上传会话当成成功操作。

## 4. 对象身份及修订

各业务模块继续独立维护身份及修订表，不新建万能对象表：

| 对象     | 身份表                 | 修订表                          |
| -------- | ---------------------- | ------------------------------- |
| 项目资料 | projects               | project_revisions               |
| 综述     | project_overviews      | overview_revisions              |
| 需求     | requirements           | requirement_revisions           |
| 推进记录 | progress_records       | progress_record_revisions       |
| 回顾     | retrospectives         | retrospective_revisions         |
| 节点     | business_entities      | business_entity_revisions       |
| 连线     | business_relationships | business_relationship_revisions |
| 图       | design_diagrams        | design_diagram_revisions        |
| 技术说明 | technical_notes        | technical_note_revisions        |

身份保存稳定 ID、项目归属及当前修订指针；修订保存项目、对象 ID、修订号、完整内容及 operation_id。同对象在一次保存中至多一版。采用 JSON 的结构化正文另有 schema_version；固定列按数据库迁移管理。实际发生时间只在有此语义时保存，例如记录 occurred_at，未知保留 NULL。

执行者、保存时间和项目版本通过 operation_id 取得，不在每个修订重复保存。读取历史不使用今天的 current_revision_no。当前指针是事务维护的投影，保存服务须检查它等于最新修订；仅有外键不能保证指针指向最新。

可移除对象采用版本化 is_deleted：移除新增修订并保留原内容，恢复再新增修订，不能物理覆盖历史。查询必须先取当时最后一版，再过滤删除标记，防止旧版复活。需求取消是业务状态，不等于移除；存储支持不表示本次新增删除界面或工具。项目整体删除不在本轮范围。

需求、回顾及其全部关联仍须补齐正式 SQL；下述验证分别明确实际表和最小验证表的范围，不能混称全部业务已经完成。

## 5. 读取一个项目快照

先确认该项目确实存在目标结果版本，再对每类对象选择：操作结果版本不大于目标版本的最后修订。后来发生的改名、换主需求和移除都不能混入旧快照。

```sql
WITH ranked AS (
  SELECT r.*, row_number() OVER (
    PARTITION BY r.project_id, r.requirement_id
    ORDER BY o.result_content_version DESC
  ) AS position
  FROM requirement_revisions r
  JOIN write_operations o ON o.project_id = r.project_id AND o.id = r.operation_id
  WHERE r.project_id = :project_id AND o.result_content_version <= :version
)
SELECT * FROM ranked WHERE position = 1 AND is_deleted = 0;
```

修订表保留对象版本主键、同对象同操作唯一约束和 (project_id, operation_id) 索引。当前图按当前项目版本读取；历史图以 project_id、diagram_id、projectVersion 定位。图修订号只能定位成员清单，不能单独代表包括共享节点在内的完整图。

scope_module_id、对象 owner 和图的 entityIds、relationshipIds、noteIds 都只存稳定 ID；对象、连线、说明及归属名称统一按该项目快照解析。节点正文变化不复制图版本，图成员或观察范围变化才修订图本身。响应可以携带本次解析出的各对象修订号，它们是读取结果，不是新的固定成员指针。

历史记录的依据、状态变化所依赖的记录和承接旧结论等关系仍固定具体对象修订。这类证据与图的当前结构用途不同，不能全部改成跟随最新版。

导出及分页固定一个项目版本和格式版本。先在短一致读事务中取得不可变内容，再生成文件，不等待客户端下一次请求而长期持有数据库事务。按实际规模再验证查询和导出性能；需要时增加可重建缓存，不复制第二套权威内容。[SQLite 事务语义](https://www.sqlite.org/lang_transaction.html)

## 6. 保存顺序及封存

在事务外解析请求、收集原始材料，事务内采用以下顺序：

1. 验证项目权限，先处理已成功操作的重试。
2. 开启短写事务，再次检查基准版本，预先确定本次操作 ID，但此时不插入成功操作行。
3. 保存新来源、业务身份、完整修订、成员及具体依据，更新变化对象的当前指针。它们的 operation_id 已知，对操作的外键采用 DEFERRABLE INITIALLY DEFERRED。
4. 校验完整候选项目快照：全部受影响的当前图、归属、端点、说明范围、状态依据、来源和当前指针均合法。候选查询把本次尚无操作行的新修订与基准快照合并解析，不能遗漏本次变化。
5. 最后插入 write_operations，确定项目结果版本并封存该操作的内容集合。
6. 条件推进 projects.current_content_version，检查它等于最新成功结果版本，再提交事务。

任一步失败整批回滚。读取者只能看到提交后的成功操作及完整内容；没有最终操作的新修订无法通过延迟外键的提交检查。[SQLite 延迟外键](https://www.sqlite.org/foreignkeys.html)

不可变规则：修订、来源及关联禁止 UPDATE／DELETE；修订和来源禁止 INSERT 到已经存在的操作；成员及依据禁止 INSERT 到操作已存在的父修订。成功操作行的存在就是封存标志，不另存 sealed 状态，也不再建登记表。外键允许事务内先写修订、最后写操作，但不允许先写成功操作再补内容。

数据库保证唯一性、归属引用、合法指针移动和不可变集合；服务保证有实际变化、有充分具体依据、头指针正确、JSON 内部引用及完整图语义。不能只靠 SQL 外键判断内容真实、需求已完成或材料足以支撑结论。

共享对象变化可能影响多张图。第一版验证整个候选快照：只修好其中一张，另一张仍不合法时整批拒绝。以后如按影响范围增量校验，语义不能变弱。

保存过程不得持写锁执行网络请求、模型调用或文件生成。SQLite 同时只有一个写事务；忙锁需要明确的重试处理，不将项目版本检查描述为无限并行写能力。[SQLite 写事务](https://www.sqlite.org/lang_transaction.html)

## 7. 失败、刷新和恢复

操作、内容和来源同一事务保存，进程重启后仍可查成功结果。提交超时沿用原操作 ID 查询或重试，不能因为一次查无结果就盲目生成新操作。基准冲突时重新读取、核对差异，不能只改基准数字。

数据库提交之后才刷新本地文件。缓存刷新失败只补刷新，不撤销保存或重复新增记录。恢复旧内容要以当前项目版本产生新修订并保留依据，不能回退项目指针或覆盖旧修订。

## 8. 草案装载和验证范围

按顺序装载：snapshot-coordination-draft.sql（共同两表）→ schema-draft.sql（来源、项目资料、综述六表）→ business-design-schema-draft.sql（业务设计十六表）。三份可在同一临时数据库组合，不再存在同名定义冲突；总表数是当前草案结果，不作为未来设计目标。

- [共同协调 SQL](snapshot-coordination-draft.sql)：projects、write_operations。
- [项目及综述 SQL](schema-draft.sql)：实际基础表及封存守卫；[验证入口](../../scripts/verify-database-design.mjs)。
- [图 SQL](business-design-schema-draft.sql)：稳定成员及历史修订；[验证入口](../../scripts/verify-business-design-database.mjs)，同时使用业务内容 Schema 校验整个候选快照。
- [通用保存验证](../../scripts/verify-snapshot-save-model.mjs)：实际协调 SQL 加需求、记录、状态依据等最小验证表；这些验证表不冒充已经定稿的完整业务模块 SQL。

脚本均使用临时数据目录并清理。已覆盖共享节点自动更新、历史图及归属名称稳定、连线／说明变化破坏未编辑图时回滚、成功操作重试、封存、外键失败及重开结果；未覆盖真实规模性能、正式 Drizzle／迁移、完整来源规范、远程授权或 MCP 客户端集成。本次没有接入运行时业务工具或执行个人数据库迁移。
