export const writingGuidePath = '/agent-writing-guide.md';
export const mcpAddress = new URL(
  '/mcp',
  import.meta.env.COSEED_DEV_SERVICE_ORIGIN ?? window.location.origin,
).href;

export const guideIntroduction = `CoSeed 按项目集中保存软件的需求、设计和开发进展。一项设计可能在同一段对话中经过多次调整。回顾项目时，通常需要重新查找先前的讨论，确认当前采用的方案，再对照分散在不同文件中的代码和测试结果，核实方案的实现情况。

你可以指定要保留的讨论或改动，请 AI 编程助手（Agent）核对相关材料，将结论及其依据写入 CoSeed。这份项目资料独立于对话和业务代码仓库。你可以在网页上直接查阅当前方案、调整原因和验证结果。开始新的对话后，已接入该项目的 Agent 也可以读取同一份资料。`;

export const connectionStepId = 'guide-section-2';
export const guideSteps = [
  {
    id: connectionStepId,
    title: '连接项目',
    body: `Agent 通过模型上下文协议（MCP）连接 CoSeed。同一 CoSeed 服务中的项目共用一个**服务地址**。CoSeed 根据**项目密钥**确定 Agent 有权读取和更新哪个项目的资料。每个密钥仅对一个项目有效。

在 CoSeed 的项目列表中选择已有项目，或选择「创建项目」并填写名称。CoSeed 仅接受本机连接。请在运行 CoSeed 的电脑上打开编程助手的 MCP 设置，添加 CoSeed 服务。

1. 将本页的「MCP 地址」填入编程助手的服务地址栏。
2. 在本页选择「生成密钥」，复制密钥，将其设为该连接的访问令牌（Bearer Token），然后保存配置。`,
    afterConnection: `保存配置后，请 Agent 读取当前连接的项目名称。将返回的名称与本页所选项目的名称核对。

新项目的第一份资料是**产品说明**。向 Agent 说明产品的预期使用者和需要解决的问题，再请 Agent 将已确定的内容保存到 CoSeed。保存后，打开「概览」，在「产品说明」中核对正文。`,
  },
  {
    id: 'guide-section-1',
    title: '日常工作',
    body: `代码编写和测试在开发工具中完成。你可以在 CoSeed 的三个栏目中查阅整理后的项目资料。

- **概览**介绍产品的预期使用者、用途和工作方式，并提供核心概念的说明和使用示例。
- **结构设计**展示业务模块的职责和依赖关系。选择已有内部设计图的模块，可以查看模块内的组件、数据对象及其关系。
- **时间线**列出各项需求的目标和当前状态。打开一项需求，可以查阅该需求的推进记录，了解方案的变化和已完成的工作。`,
  },
  {
    id: 'guide-section-6',
    title: '更新项目资料',
    body: `需求范围发生变化、设计方案确定或一项验证完成后，你可以在对话中指定本次需要整理的讨论或代码改动，请 Agent 更新相应的项目资料。

Agent 从讨论中整理已确定的方案及其理由，对照代码核实实现情况，并依据测试或实际运行结果记录已经验证的行为。资料中应注明仍待确认的事项。保存后，你可以在相应栏目核对更新的内容。`,
    note: '方案发生变化时，请 Agent 在对应需求下新增一条推进记录，说明调整的内容和原因。已有记录对当时情况的描述有误时，请 Agent 更正该条记录。CoSeed 保留更正前的内容。',
  },
];
