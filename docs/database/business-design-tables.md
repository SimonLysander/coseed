# 业务设计的物理库表草案

状态：**已按项目快照解析规则调整并在临时 SQLite 验证，未迁移或接入运行时。** 内容语义见[业务设计](business-design.md)，共同版本规则见[保存模型](snapshot-save-model.md)。

## 1. 装载及边界

顺序为 snapshot-coordination-draft.sql → schema-draft.sql → business-design-schema-draft.sql。共同层和项目／综述共八表，业务设计另有十六表；没有独立 project_versions 表。表数是当前设计结果，不作为扩展目标。

业务设计仍分四个身份表、四个修订表、四个成员表和四个依据表。它们复用 projects、write_operations、sources，不另建执行者或来源系统。可执行 SQL 见[business-design-schema-draft.sql](business-design-schema-draft.sql)。

## 2. 身份及内容修订

| 身份表                 | 修订表                          | 专属内容                                                                 |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| business_entities      | business_entity_revisions       | module、component、data_object、external_system 的名称、职责、归属及结构 |
| business_relationships | business_relationship_revisions | 关系种类、两端及语义调用／读写／事件／关联内容                           |
| design_diagrams        | design_diagram_revisions        | 标题、scope_kind、scope_module_id                                        |
| technical_notes        | technical_note_revisions        | 技术名称、problem_md                                                     |

身份表保留 id、project_id、current_revision_no、created_at；实体另有不可变 kind。项目 ID及对象 ID建立复合唯一键，所有关联使用同项目外键。当前指针为延迟外键，允许在一个事务内新建身份和首版；服务仍须检查指针等于最新修订。

修订表使用 project_id、对象 ID、revision_no 联合主键，关联 operation_id；同对象同操作唯一。版本时间和执行者由操作取得。修订及关联不可更新删除，移除采用 is_deleted 新修订，恢复再新增修订。

### 节点

content_json 由严格分型 Schema 校验，schema_version 标识其内容格式。kind、name、summary、owner_entity_id、owner_kind、primary_source_id、type_source_id 为从 JSON 派生的存储列，避免正文和查询列各自编辑。SQL 要求类型、归属种类、核心字段及数据对象 TS 信息合法。

owner 只引用稳定模块／外部系统 ID，不再有 owner_revision_no。历史展示按历史项目版本解析归属上下文，因此外部系统后来改名不会改写旧图。

primary_source_id 和 type_source_id 指向不可变原始材料；保存服务检查来源类型、定位、是否支持本版及目录归属，SQL 外键只能检查同项目存在性。

### 关系

content_json 存 kind、sourceId、targetId、summary 和该类型特有字段；SQL 派生 kind、source_entity_id、target_entity_id、summary，并以同项目外键关联实体身份。端点种类触发器保留：调用／事件连组件，读写由组件连数据对象，模块关系只出现在相应层级。

不能因为端点类型合法就认为图完整。关系两端的变化按候选项目快照校验全部引用图，不能通过保存旧端点连接键来冻结当前关系。

### 图

scope_kind 为 project 或 module；前者无 scope_module_id，后者必须引用真实业务模块身份。没有 scope_module_revision_no；模块说明按项目快照解析。

### 技术说明

保存 title、problem_md；语义范围由成员表保存，可以只有一个成员或覆盖多个对象。范围不是父目录，多个说明允许重叠。

## 3. 四张成员表

共同使用 project_id，父对象 ID＋父修订号固定清单本身，子对象仅存稳定 ID：

| 表                               | 主要字段                                 | 含义                 |
| -------------------------------- | ---------------------------------------- | -------------------- |
| diagram_revision_entities        | diagram_id、revision_no、entity_id       | 这版图有哪些节点     |
| diagram_revision_relationships   | diagram_id、revision_no、relationship_id | 这版图有哪些关系     |
| diagram_revision_notes           | diagram_id、revision_no、note_id         | 这版图有哪些说明     |
| technical_note_revision_entities | note_id、revision_no、entity_id          | 这版说明覆盖哪些对象 |

每个父修订内子成员唯一，不存 entity_revision_no、relationship_revision_no、note_revision_no，也不重复存关系端点。节点、关系和说明都按请求中的项目版本选择最后有效修订。

SQL 保证身份存在、项目隔离、基本层级及不可变成员。完整候选快照校验器负责端点必须在图中、关系层级正确、说明范围完整，以及已移除对象不能继续作为当前成员。源成员和父修订之间为精确版本外键，封存后不能往旧清单补行。

成员顺序暂无业务含义，组装采用稳定 ID的固定排序；来源 JSON Pointer 必须使用同一规范化顺序，不能随数据库返回顺序漂移。具体字符串排序不能依赖系统语言设置。

## 4. 四张依据表

business_entity_revision_sources、business_relationship_revision_sources、design_diagram_revision_sources、technical_note_revision_sources。

字段为 project_id、对应对象 ID、revision_no、source_id、target_side、target_path、explanation_md。前三项定位真实修订，来源外键检查同项目；side 表达修改前／后，path 是组装逻辑内容的 JSON Pointer，例如 /entityIds/0；说明保留材料支持的具体修改。

来源不可覆盖，依据关联也不能事后补入已成功保存的修订。需要补证或纠错时形成新修订。历史业务证据仍固定具体版本，不与图的快照解析混为一种引用。

## 5. 保存和查询

共同保存规则是“内容先写，成功操作最后写”：

```text
BEGIN IMMEDIATE
  查询既有操作处理重试，检查项目基准
  预先确定操作 ID，但不插入操作行
  插入来源、身份、新修订、图／说明成员和具体依据
  检查完整候选快照，包括所有受共享变化影响的未编辑图
  条件推进变化对象的当前修订指针
  插入成功操作，封存本次内容集合
  推进项目内容版本并核对当前指针
COMMIT；任意错误整批回滚
```

新修订指向操作的外键为延迟检查。成功操作存在后，修订／来源禁止再追加；成员／依据检查父修订的操作是否存在，存在即拒绝 INSERT。现有 SQL 已加入这些守卫，不依赖提示词承诺不可变。

当前图和历史图都以项目版本解析，区别只在选择哪个项目版本。图清单本身未变时可仍为修订 1，而当前节点已为修订 3；完整图的版本标识必须带项目版本。读取整个快照应在一致范围内完成，不能对每个节点分别查询今天的当前指针。

## 6. 索引及验证

修订主键支持对象历史，各修订表另有 (project_id, operation_id) 索引；身份的类型、owner、关系端点及四类成员保留必要反向索引。读取成员时批量连接选中的父修订，不执行每节点一次请求。

运行 `node scripts/verify-business-design-database.mjs`，装载实际组合 SQL，并以内容 Schema 校验完整候选快照。覆盖共享节点两图更新、历史节点／归属稳定、未编辑图失效时整批拒绝、跨项目引用、成员封存、恢复旧读取及索引计划；临时文件会清理。

这不是生产保存服务、MCP 或大规模性能验收。需求／综述跨模块关联、完整来源输入、Drizzle、正式迁移及真实容量仍须后续完成。
