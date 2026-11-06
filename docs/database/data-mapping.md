# CoSeed 数据如何从提交变成页面

这是整套设计的阅读入口。内容 Schema 已有可执行草案；项目／综述和业务设计已有可执行 SQL 草案；需求推进及回顾的完整物理表仍待补齐。正式业务服务、迁移和 MCP 写入均未接入。

## 1. 先分清两种“数据结构”

**CoSeed 自己要存的数据**：项目、综述、需求、推进记录、设计图、节点、连线、来源、版本。下面讲的是这些数据如何保存。

**图里描述的项目数据**：例如 Claude Monitor 的企业、员工、套餐、账号。它们是被描述项目的业务对象；在 CoSeed 中是“数据对象节点”，TS 类型是节点里展示的文字。CoSeed 不会看到 `type Account` 就替 Claude Monitor 创建 accounts 表，也不会直接存用户的真实账号数据。

因此，“一个数据对象节点”对应 CoSeed 的一份设计对象及其历史，不对应一张自动生成的业务表。

## 2. 整条链

```text
你和 Agent 讨论／回顾
    ↓ Agent 整理内容，并附原始依据
结构化内容：综述、需求、记录、节点、关系、图、技术说明
    ↓ CoSeed 检查字段、项目、旧版本、引用和依据
系统补齐：新版本号、保存时间、入口和可获得的执行信息
    ↓ 同一个数据库事务
身份表 + 版本表 + 关联表 + 原始来源 + 保存操作
    ↓ 按当前指针或指定历史版本查询，组装内容
页面阅读结构
    ├── Markdown、核心概念和用例图
    ├── 需求及推进时间线
    └── 节点、连线、技术说明 → 自动布局 → 交互图
```

这是计划中的数据流，不表示当前已能在聊天中调用真实工具完成保存。回顾由用户发起，工具和提示词规范还需单独设计。

## 3. 内容分成什么

| 模块     | 逻辑内容结构                                         | 如何落库                                                                |
| -------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| 项目资料 | name、repositoryLocator                              | projects 身份 + project_revisions 快照                                  |
| 项目综述 | product、concepts、examples                          | project_overviews 身份 + overview_revisions 完整 JSON                   |
| 需求     | title、markdown、status                              | requirements 身份 + requirement_revisions；物理 SQL 待补                |
| 推进记录 | requirementId、title、markdown、occurredAt           | progress_records 身份 + progress_record_revisions；物理 SQL 待补        |
| 阶段回顾 | title、scopeMd、summaryMd，另关联输入材料及成功操作  | 身份、版本、输入和结果关系；完整物理设计待定                            |
| 设计对象 | module / component / data_object / external_system   | business_entities 身份 + business_entity_revisions 分型 JSON            |
| 设计关系 | 功能依赖、模块关联、调用、读、写、对象关联、事件     | business_relationships 身份 + business_relationship_revisions 分型 JSON |
| 设计图   | title、scope、entityRefs、relationshipRefs、noteRefs | design_diagrams + design_diagram_revisions + 三张成员表                 |
| 技术说明 | title、problemMd、entityIds                          | technical_notes + technical_note_revisions + 成员表                     |
| 保存信息 | 操作 ID、入口、执行者、保存时间等                    | 共用 write_operations                                                   |
| 原始依据 | 原文、类型、定位、可知的发生时间                     | 共用 sources；各版本有自己的依据关联表                                  |

JSON 用于一份完整、类型明确的内容；需要跨对象查找、项目隔离或版本外键的关系拆成表。并非全拆成列，也不是把整个项目塞进一份大 JSON。

## 4. 四种结构各负什么责

| 层         | 例子                                                           | 谁维护                                         |
| ---------- | -------------------------------------------------------------- | ---------------------------------------------- |
| 内容结构   | 节点 name、summary；关系 operations                            | 内容提供者，经过内容 Schema 检查               |
| 保存上下文 | 哪个项目、改哪个稳定 ID、读取的旧版本、原始依据                | 提交方指出目标，系统核验；未来写入格式仍未定稿 |
| 数据库行   | project_id、entity_id、revision_no、operation_id、content_json | 保存服务拆解，数据库约束                       |
| 页面数据   | 节点卡片、线标签、目录分组、边界、布局位置                     | 查询与呈现层组装／计算                         |

内容 Schema 约束“这份东西的字段对不对”；SQL 约束“存进去的身份和关系是否合法”；Drizzle 是以后用 TypeScript 定义、查询这些表的工具。Drizzle 不会代替内容检查，也不决定业务含义。当前 SQL 草案还没转换成正式 Drizzle 表定义。

**版本号和结构版本不同**：revision_no=2 表示第二次修订；schema_version=1 表示仍使用第一套内容格式。改一句话通常只增加修订号；改变内容格式才需要处理结构版本兼容。

## 5. 拿“修改一个组件节点”走一遍

以下名称来自 CoSeed 设计示例，描述的是计划，并不表示对应业务服务已实现。

### 提交的内容

例如把“需求更新处理”的职责说明改得更准确。正文仍是一个组件对象：

```ts
const content = {
  kind: 'component',
  name: '需求更新处理',
  summary: '核对目标需求和旧版本，共同保存需求变化、支撑它的推进记录及原始依据。',
  owner: { kind: 'module', id: 'requirements' },
  primarySourceId: null, // 尚无确认的实现来源，不编造目录
};
```

正文以外，还必须指明项目、组件 ID、读到的旧版本，提供支持本次修改的来源。这里没有规定 MCP 工具名或完整请求格式；内容结构与保存协议是两件事。

### 系统写入

假设节点当前 v1，内部图当前 v1，且此次决定同步更新这张图：

```text
write_operations
  op-A：一次成功保存，保存时间和执行信息

sources
  src-A：本次引用的原文及实际定位；已有材料可复用

business_entity_revisions
  update-requirement / v2：新正文，operation_id = op-A
  update-requirement / v1：保留

business_entity_revision_sources
  节点 v2 的 /summary ← src-A，附支持该修改的说明

business_entities
  update-requirement 的 current_revision_no：1 → 2

设计图同步发布：
  design_diagram_revisions：requirements-internal / v2
  diagram_revision_entities：新图引用节点 v2，其余对象沿用明确版本
  另外两张图成员表：沿用具体关系版、说明版
  design_diagram_revision_sources：本次图清单更新的依据
  design_diagrams 的 current_revision_no：1 → 2
```

全部在一个事务里完成；有冲突或失败就都不保存。关系正文没改，不制造关系的新版本。旧图 v1 的成员清单仍引用节点 v1，不会因为节点有 v2 而变化。

修改一个共享节点不代表所有图都已自动发布新版。系统必须找出受影响的当前图，再按明确发布选择处理；传播策略尚待确认，当前表结构支持固定版本，未实现自动传播。

### 前端读取

```text
打开当前内部图
  design_diagrams.current_revision_no → 图 v2
  图 v2 的成员表 → 节点 v2、其余节点的指定版、关系指定版、说明指定版
  批量读出这些快照和必要归属上下文
  按类型生成卡片和线标签，自动布局，绘制

打开历史图 v1
  直接读图 v1 和它的成员表
  节点仍为 v1；不查节点 current_revision_no 来替换历史
```

查询在同一读取快照内完成，按类型批量读取，避免一个节点一次请求。依据和全量历史按需读取，不让当前图响应携带整个项目的原文库。

## 6. 一条设计数据如何变成可见内容

| 保存字段或关联                     | 页面上变成什么                     | 不另外存什么                     |
| ---------------------------------- | ---------------------------------- | -------------------------------- |
| entity.kind                        | 模块、处理组件、数据对象等卡片形式 | 不再存另一套可冲突的卡片分类     |
| name、summary                      | 节点名称和职责说明                 | 不自动生成方法／规则清单         |
| typeName、typeScript               | 数据对象的带注释 TS 类型           | 不执行类型文本，不生成实际业务表 |
| owner、固定归属版本、图 scope      | 模块边界内外及必要归属名称         | 不存永久 external 布尔值         |
| primarySourceId → 原始代码定位     | 从 modules/ 开始的目录分组         | 不在节点正文重复写另一份目录     |
| relationship.kind                  | 箭头／线型／UML 基本关系标记       | 不再存第二套独立 umlRelation     |
| summary、operations、events        | 业务说明与语义函数式线标签         | 不把返回另画为反向调用           |
| associationKey、两端 multiplicity  | 关联字段、1 / 0..* 等端点数量      | 不让布局交换两端含义             |
| note.title、problemMd、成员        | 技术说明与圈选范围                 | 不用固定矩形坐标当真实成员关系   |
| 全局设计 Token、内容尺寸、布局配置 | 配色、字体、间距、坐标、路由       | 不混进业务正文或修订历史         |

ELK 负责自动布局，X6 负责图形显示和交互；它们消费组装后的图，不是数据库的权威内容格式。

## 7. 另外两个页面怎样映射

### 项目综述

```text
当前综述指针 → 某一版 content_json
  product.markdown → 产品表述
  concepts.entries / relations → 概念列表及业务关系
  examples.introductionMd → 示例背景
  examples.sections[] → 小标题、对应小图、自由 Markdown 正文
```

概念和小节都有稳定 ID，但首版不各自拆一套物理表；一次综述版本保留整份内容。与需求或记录关联时，需要同时定位综述版本和内部对象，不能仅凭小标题文字匹配。跨模块关联 SQL 尚未补齐。

### 需求推进

```text
需求身份 + 当前需求版本 → 当前标题、正文、六种状态之一
记录身份 + 当前记录版本 → 当前主需求下的推进时间线
同一记录的历次版本 → 这条记录被怎样更正过
需求历次版本中真正的状态变化 → 状态历史及当时的依据
```

后来有新决定：新记录。之前写错了：同一记录新版本。一条记录修订三次，在推进时间线中仍是一条记录；修订历史中有三版。状态变化所依据的记录固定到具体版本，不跟随记录后续改写。

实际发生时间 occurredAt 由材料确定，未知保留空；每版保存时间从对应 operation 读取。首次收录、业务先后与版本历史不能混用。默认时间线排序及完整关联物理表仍需收口，见 [需求推进模型](requirements-design.md)。

## 8. 现在做到哪一步

| 项目                               | 当前状态                                   |
| ---------------------------------- | ------------------------------------------ |
| 综述、需求推进、业务设计的内容结构 | 已有可执行草案和示例校验，不是正式写入接口 |
| 项目／综述首批 8 表 SQL            | 已有草案并通过临时数据库检查               |
| 业务设计新增 16 表 SQL             | 本次补齐并通过临时数据库检查               |
| 需求推进、回顾、跨模块关联完整 SQL | 尚未完成                                   |
| 正式 Drizzle Schema／迁移          | 尚未接入                                   |
| MCP 写入、保存服务、数据库驱动页面 | 尚未接入                                   |

这份说明讲的是完整的数据链及当前设计边界，不能把“链路已解释清楚”当成“整套系统已实现”。业务设计字段字典见 [物理库表提案](business-design-tables.md)。
