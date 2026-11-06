# 业务设计：物理库表提案

状态：可执行 SQL 草案，已在临时 SQLite 验证；没有迁移个人数据库，没有接入业务保存服务。全文字段以 [SQL](business-design-schema-draft.sql) 为准。内容结构仍以 [可执行内容 Schema](business-design-draft.ts) 为准，两者分别约束持久化结构和业务内容。

## 1. 表的组成

新增 **16 张表**，复用项目、写操作、原始来源。加上首批 8 张表，当前可执行 SQL 草案共 24 张表，**尚不包含需求推进、回顾及其跨模块关联的完整物理设计**。

| 作用     | 表                                     | 保存的事实                                         |
| -------- | -------------------------------------- | -------------------------------------------------- |
| 对象身份 | business_entities                      | 一个模块、组件、数据对象或外部系统是谁，当前是哪版 |
| 对象版本 | business_entity_revisions              | 每一版名称、职责、归属、TS 结构、实现来源          |
| 关系身份 | business_relationships                 | 一条关系是谁，当前是哪版                           |
| 关系版本 | business_relationship_revisions        | 每一版两端、关系种类、业务说明、核心参数和返回等   |
| 图身份   | design_diagrams                        | 一张图是谁，当前是哪版                             |
| 图版本   | design_diagram_revisions               | 当时的标题、观察范围                               |
| 说明身份 | technical_notes                        | 一项技术说明是谁，当前是哪版                       |
| 说明版本 | technical_note_revisions               | 当时的技术名称、解决的问题                         |
| 图中对象 | diagram_revision_entities              | 这版图选用了哪个对象的哪一版                       |
| 图中关系 | diagram_revision_relationships         | 这版图选用了哪条关系的哪一版                       |
| 图中说明 | diagram_revision_notes                 | 这版图选用了哪项说明的哪一版                       |
| 说明成员 | technical_note_revision_entities       | 这版说明覆盖哪些对象；允许不同说明范围重叠         |
| 对象依据 | business_entity_revision_sources       | 哪份来源支持对象这一版的哪处内容                   |
| 关系依据 | business_relationship_revision_sources | 哪份来源支持关系这一版的哪处内容                   |
| 图的依据 | design_diagram_revision_sources        | 哪份来源支持这版图的范围和引用选择                 |
| 说明依据 | technical_note_revision_sources        | 哪份来源支持这版技术说明                           |

四类内容独立维护，所以各有身份和版本；关联表让引用能被外键检查。没有把“一个 JSON 包能描述整张图”误当成“数据库只需要一行”。也不为调用、读取、写入分别建一套身份／版本表：这些是同一种关系对象的不同内容类型。

## 2. 四张身份表的共同字段

| 字段                | 类型                       | 含义                                                                   |
| ------------------- | -------------------------- | ---------------------------------------------------------------------- |
| id                  | TEXT，主键                 | 稳定 ID；改名、修改正文不换 ID                                         |
| project_id          | TEXT，外键                 | 所属项目；所有读取和写入都限定项目                                     |
| current_revision_no | INTEGER，非空              | 当前版本号；提交时必须有对应版本                                       |
| created_at          | INTEGER，非空              | 系统首次保存的 UTC 毫秒时间                                            |
| kind                | TEXT，仅 business_entities | module / component / data_object / external_system；同一身份不可改种类 |

ID 本身全局唯一，另外的 `(project_id, id)` 唯一键供复合外键使用，防止只凭一个存在的 ID 错接到别的项目。身份及创建时间不可修改，当前版本只能向前；恢复旧内容也生成新版。

## 3. 四张版本表的共同字段

| 字段                                               | 类型            | 含义                                     |
| -------------------------------------------------- | --------------- | ---------------------------------------- |
| project_id                                         | TEXT            | 项目                                     |
| entity_id / relationship_id / diagram_id / note_id | TEXT            | 对应身份                                 |
| revision_no                                        | INTEGER，正整数 | 对象内的版本顺序；与前两项组成主键       |
| operation_id                                       | TEXT，复合外键  | 本次成功保存，从此读取时间、入口和执行者 |

同一操作对同一对象最多生成一个版本。版本行禁止 UPDATE / DELETE，不另存一份会覆盖的“当前正文”。不再增加前版指针或强制数字无跳号；服务按当前版本分配后继，并检查旧版本未变。

### business_entity_revisions

| 字段                        | 保存方式               | 含义                                                           |
| --------------------------- | ---------------------- | -------------------------------------------------------------- |
| schema_version              | INTEGER                | 内容 Schema 的版本，区别于对象修订号                           |
| content_json                | JSON 对象文本          | 对应种类的完整内容，字段见内容 Schema                          |
| kind、name、summary         | 从 JSON 自动生成的列   | 种类、名称、职责；不得单独写入与 JSON 相矛盾的值               |
| owner_entity_id、owner_kind | 从 JSON 自动生成的列   | 组件／数据对象唯一归属的业务模块或外部系统                     |
| owner_revision_no           | INTEGER，可空          | 保存服务解析并固定的归属对象版本；组件／数据对象必填，其余为空 |
| primary_source_id           | 从 JSON 自动生成，可空 | 核心实现来源，供目录分组；没有实现不编造                       |
| type_source_id              | 从 JSON 自动生成，可空 | 数据类型定义的来源，可不同于核心实现来源                       |

模块内容：`{ kind, name, summary, role }`；外部系统：`{ kind, name, summary }`；组件再有 `owner, primarySourceId`；数据对象再有 `typeSourceId, typeName, typeScript`。

额外固定 owner_revision_no 是为了解决历史图的隐性依赖：外部组件归属的系统改名后，旧图不能偷偷借用新的系统名称。正文 owner 保持稳定身份引用，服务保存时固定当时采用的归属版本；同批更新归属对象时采用本批新版本。这个元数据由保存服务选择并校验，不让模型猜测系统版本号。读取时若图已明确选择同一归属模块，边界标题使用图明确选择的版本；未显式选中的归属上下文使用该固定版本。

生成列只暴露需要索引或外键检查的字段，正文不是第二份需要手工同步的副本。[SQLite 允许生成列使用外键和索引](https://www.sqlite.org/gencol.html)。本提案已用本项目驱动实际验证，正式 Drizzle 表达及迁移还需核对。

### business_relationship_revisions

| 字段                               | 保存方式         | 含义                                                 |
| ---------------------------------- | ---------------- | ---------------------------------------------------- |
| schema_version、content_json       | 普通列           | 关系结构版本、完整内容                               |
| kind                               | 从 JSON 自动生成 | 功能依赖、模块关联、调用、读、写、对象关联、事件之一 |
| source_entity_id、target_entity_id | 从 JSON 自动生成 | 两端稳定对象 ID；实际显示哪个版本由图的对象清单决定  |
| summary                            | 从 JSON 自动生成 | 应直接看见的业务说明                                 |

不同关系的 operations、events、数量约束等放进严格分型的 JSON，不能混填。关系的端点对象种类由 SQL 检查，具体操作字段、数量语法等由内容 Schema 检查。

### design_diagram_revisions

| 字段                     | 类型          | 含义                                         |
| ------------------------ | ------------- | -------------------------------------------- |
| title                    | TEXT          | 图标题                                       |
| scope_kind               | TEXT          | project / module                             |
| scope_module_id          | TEXT，可空    | 模块内部图的观察对象；项目全景为空           |
| scope_module_revision_no | INTEGER，可空 | 对应模块的具体版本；与 ID 一起填写或一起为空 |

entityRefs、relationshipRefs、noteRefs 不再复制进 JSON，而是拆成下面的真实关联行。业务设计内容 Schema 的图对象，是这些表合起来形成的结构。

### technical_note_revisions

| 字段       | 类型 | 含义                               |
| ---------- | ---- | ---------------------------------- |
| title      | TEXT | 如“事务边界”“状态机”，不强制套分类 |
| problem_md | TEXT | 解决什么问题，设计理由融入其中     |

entityIds 拆进说明成员表。说明范围不是坐标矩形，不借目录的 parent 表示，多个说明可以重叠。

## 4. 四张成员表

| 表                               | 除 project_id 外的字段                                                                                 | 主键中的对象粒度             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| diagram_revision_entities        | diagram_id、revision_no、entity_id、entity_revision_no                                                 | 一版图内一个对象只出现一次   |
| diagram_revision_relationships   | diagram_id、revision_no、relationship_id、relationship_revision_no、source_entity_id、target_entity_id | 一版图内一条关系只出现一次   |
| diagram_revision_notes           | diagram_id、revision_no、note_id、note_revision_no                                                     | 一版图内一项说明只出现一次   |
| technical_note_revision_entities | note_id、revision_no、entity_id                                                                        | 一版说明内一个成员只出现一次 |

前两端实体字段是受外键约束的连接键：必须与关系版本的真实端点一致，同时两端必须已经选进同版图，不能成为另一份可随意编辑的端点定义。

说明成员使用稳定对象 ID；显示哪一版对象由使用该说明的图决定。SQL 检查说明加入图时，其全部成员在图里；保存服务仍须在完整批次上校验，禁止事后对旧说明追加成员。

成员表禁止 UPDATE / DELETE。修改图的清单或说明范围，生成图或说明的新版本。成员顺序没有业务含义，查询可按稳定 ID 排序；如果以后需要人工指定阅读次序，应单独确认语义，不依赖数据库返回顺序。

## 5. 四张依据表

共同字段：`project_id、对应对象 ID、revision_no、source_id、target_side、target_path、explanation_md`。

- 前三项关联真实版本，source_id 复合外键指向同项目 sources。
- target_side 为 before / after；target_path 是该版逻辑内容的 JSON Pointer。
- explanation_md 说明材料支撑什么变化。
- 主键包含目标、来源、side、path，允许同一来源支持多处，或同一处有多份材料。

图和说明虽然按关系表存储，路径仍指向组装后的逻辑内容，例如图 `/entityRefs/0`、说明 `/entityIds/0`。保存服务验证路径时必须采用本版规范化组装顺序；顺序固定为稳定 ID 升序，字符串比较规则固定，不受系统语言设置影响。正文入库前即规范化这些无序清单，不能根据未来查询的任意顺序解释历史依据。

这部分仍复用[共同历史规则](history-design.md)。不能修改旧来源原文，也不能悄悄给已发布的旧版本加引用。

## 6. 保存事务和读写映射

写入前：解析内容 Schema、收集来源、解析待更新对象和实际归属版本；扫描仓库、模型生成和网络访问都在事务外完成。事务内重新核对所有采用的当前版本。

```text
BEGIN IMMEDIATE
  核对保存操作 ID、请求指纹：相同请求重试返回原结果
  核对 project_id、所有待更新对象的预期旧版本
  保存 write_operations 及本批新增 sources
  新建必要身份；插入实体版本（先归属模块，再内部对象）
  插入关系版本；插入技术说明版本及其成员
  插入图版本；按对象、关系、说明顺序插入图清单
  插入各版本的具体来源引用
  对完整批次做范围、依据覆盖和引用一致性校验
  按预期旧版本条件更新相关身份的当前指针
COMMIT；任何异常／冲突使整批回滚
```

历史外键和触发器不能代替保存服务。特别是 SQL 允许给旧版本继续 INSERT 子引用，也不能单靠外键保证一张图至少一个对象、一项说明至少一个成员、每份版本有充分依据。服务只能在创建本版的同一事务里写它的子表；后续修改必须新建版本。

共享对象更新后，先用反向引用查出受影响的**当前图**，不能直接更改旧图清单。哪些图随本批更新、哪些明确保留旧设计，发布策略仍需确认。物理表可表达两种选择，但不把“对象改了”当成“所有图已自动同步”。

## 7. 查询和索引

| 查询                   | 索引／方式                                                                        |
| ---------------------- | --------------------------------------------------------------------------------- |
| 当前模块列表           | business_entities(project_id, kind, id) + 当前版本联合主键                        |
| 读取某一版图           | 图主键 + 三张图成员表的主键；按具体版本批量 JOIN                                  |
| 读取固定的归属上下文   | 批量按 owner_entity_id、owner_revision_no JOIN，不能每个节点另发请求              |
| 某模块有哪些对象       | business_entities_owner；历史候选后结合身份当前指针筛选当前归属                   |
| 一个对象参与哪些关系   | business_relationships_source / business_relationships_target；同样区分当前与历史 |
| 对象变动影响哪些当前图 | diagram_entities_reverse，再 JOIN 图身份过滤 current_revision_no                  |
| 同一关系或说明在哪些图 | diagram_relationships_reverse / diagram_notes_reverse                             |
| 一个对象有哪些技术说明 | technical_notes_entity                                                            |
| 某来源被哪些版本使用   | 四张依据表的 reverse 索引                                                         |
| 版本历史列表           | (project_id, 对象 ID, revision_no) 主键游标分页，不加载每版全文                   |

读取图和其成员必须在同一读取快照内完成；历史读取指定版本，禁止中途查询各对象的 current_revision_no。返回阅读页面时不附带全部原始来源和修订历史；需要查看历史或依据时另读。

没有存布局坐标、主题色、X6 cells、ELK 路径、临时缩放或 Hover 内容。它们由业务内容和全局设计规则推导；如有实测需要，可再设计派生缓存。

## 8. 已验证和未验证

运行 `node scripts/verify-business-design-database.mjs`：只在系统临时目录创建数据文件，结束后删除。覆盖 24 张 STRICT 表、现有示例内容往返、项目隔离、固定归属版本、端点种类、图层次、成员完整引用、说明范围、历史还原、不可覆盖、失败回滚、过期条件写入、操作去重约束、索引计划及重开完整性。

这些不是生产保存服务测试。尚未完成：Drizzle 映射、正式迁移、来源定位及覆盖服务、共享对象发布策略、完整 MCP 写入契约、跨需求／综述的关联、真实数据规模的延迟和容量基线。不能用临时 SQL 检查通过来宣称这些功能已实现。
