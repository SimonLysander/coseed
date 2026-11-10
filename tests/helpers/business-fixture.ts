import { saveRequirementFixture, fixtureCitations } from './requirements-fixture.js';
export function buildBusinessFixture() {
  const changes: unknown[] = [];
  const sources: unknown[] = [
    {
      id: '$material',
      kind: 'document',
      rawText: '明确虚构的业务设计测试，所有路径、业务与接口仅用于验证。',
    },
  ];
  const put = (objectType: string, id: string, content: unknown, citations = fixtureCitations()) =>
    changes.push({ action: 'upsert', objectType, id, expectedRevision: null, content, citations });
  put('entity', '$accounts', {
    kind: 'module',
    name: '账号供给与履约',
    summary: '管理账号资源、企业持有和员工使用，处理交付、分配与回收。',
    role: 'core',
  });
  put('entity', '$billing', {
    kind: 'module',
    name: '计费与资金',
    summary: '计算费用和余额，提供交付所需的计费判断。',
    role: 'core',
  });
  put('entity', '$org', {
    kind: 'module',
    name: '用户与组织',
    summary: '维护企业与员工身份，提供有效的组织范围。',
    role: 'support',
  });
  put('entity', '$vendor', {
    kind: 'external_system',
    name: '外部厂商',
    summary: '提供已确认的账号交付和账号状态接口。',
  });
  const component = (id: string, name: string, ownerId: string, path: string, summary: string) => {
    const sourceId = `${id}-code`;
    sources.push({
      id: sourceId,
      kind: 'code',
      rawText: `// Explicitly fictional fixture for ${name}`,
      locator: { path },
    });
    put(
      'entity',
      id,
      {
        kind: 'component',
        name,
        summary,
        owner: { kind: ownerId === '$vendor' ? 'external_system' : 'module', id: ownerId },
        primarySourceId: sourceId,
      },
      [
        ...fixtureCitations(),
        {
          sourceId,
          side: 'after',
          path: '/primarySourceId',
          explanationMd: '虚构的核心实现位置，仅用于测试目录归属。',
        },
      ],
    );
  };
  component(
    '$entry',
    '申请处理',
    '$accounts',
    'src/modules/accounts/application/requests.ts',
    '接收企业的交付申请，核对企业与员工身份，将已满足条件的申请交给账号分配处理。',
  );
  component(
    '$assign',
    '账号分配',
    '$accounts',
    'src/modules/accounts/domain/assignment.ts',
    '检查账号可用性与套餐条件，确认企业持有关系，并为指定员工建立账号使用区间。',
  );
  component(
    '$recover',
    '账号回收',
    '$accounts',
    'src/modules/accounts/application/recovery.ts',
    '结束员工使用区间并回收分配资格，保留企业持有和之前的使用记录以供核对。',
  );
  component(
    '$history',
    '变更登记',
    '$accounts',
    'src/modules/accounts/history/log.ts',
    '记录交付和回收的业务事实，向已确认的订阅方发布变更事件，不据此推断副作用已完成。',
  );
  component(
    '$check',
    '费用准入判断',
    '$billing',
    'src/modules/billing/application/admission.ts',
    '核对套餐费用和可用余额，提供本次交付是否可以继续的业务判断。',
  );
  component(
    '$sync',
    '厂商账号适配',
    '$vendor',
    'src/modules/integrations/vendor/accounts.ts',
    '调用厂商已有的账号接口，传递账号标识和交付信息，不自行定义厂商未提供的能力。',
  );
  const data = (id: string, name: string, ownerId: string, typeName: string, fields: string) => {
    const sourceId = `${id}-code`;
    sources.push({
      id: sourceId,
      kind: 'code',
      rawText: `// Explicitly fictional type\n${fields}`,
      locator: {
        path: `src/modules/${ownerId === '$accounts' ? 'accounts' : ownerId === '$org' ? 'organizations' : 'billing'}/domain/${typeName.toLowerCase()}.ts`,
      },
    });
    put(
      'entity',
      id,
      {
        kind: 'data_object',
        name,
        summary: `保存${name}的核心业务字段。`,
        owner: { kind: 'module', id: ownerId },
        primarySourceId: sourceId,
        typeSourceId: sourceId,
        typeName,
        typeScript: fields,
      },
      [
        ...fixtureCitations(),
        {
          sourceId,
          side: 'after',
          path: '/primarySourceId',
          explanationMd: '虚构数据类型和核心位置，仅用于测试。',
        },
      ],
    );
  };
  data(
    '$account',
    '账号',
    '$accounts',
    'Account',
    "type Account = {\n  id: string; // 账号标识\n  status: 'available' | 'held'; // 资源状态\n};",
  );
  data(
    '$holding',
    '企业持有',
    '$accounts',
    'Holding',
    'type Holding = {\n  id: string; // 持有关系\n  accountId: string; // 对应账号\n  companyId: string; // 持有企业\n};',
  );
  data(
    '$usage',
    '员工使用',
    '$accounts',
    'Usage',
    'type Usage = {\n  id: string; // 使用区间\n  holdingId: string; // 企业持有关系\n  employeeId: string; // 使用员工\n  endedAt: number | null; // 结束时间\n};',
  );
  data(
    '$request',
    '交付申请',
    '$accounts',
    'DeliveryRequest',
    'type DeliveryRequest = {\n  id: string; // 申请标识\n  companyId: string; // 提出申请的企业\n  holdingId: string | null; // 交付结果\n};',
  );
  data(
    '$company',
    '企业',
    '$org',
    'Company',
    'type Company = {\n  id: string; // 企业标识\n  name: string; // 企业名称\n};',
  );
  data(
    '$employee',
    '员工',
    '$org',
    'Employee',
    'type Employee = {\n  id: string; // 员工标识\n  companyId: string; // 所属企业\n};',
  );
  data(
    '$plan',
    '套餐',
    '$billing',
    'Plan',
    'type Plan = {\n  id: string; // 套餐标识\n  seats: number; // 允许分配的席位数\n};',
  );
  const edge = (
    id: string,
    kind: string,
    sourceId: string,
    targetId: string,
    summary: string,
    more = {},
  ) => put('relationship', id, { kind, sourceId, targetId, summary, ...more });
  edge(
    '$depends',
    'functional_dependency',
    '$accounts',
    '$billing',
    '交付需要费用和余额的准入判断。',
  );
  edge(
    '$identity',
    'functional_dependency',
    '$accounts',
    '$org',
    '申请和分配需要有效的企业与员工身份。',
  );
  edge(
    '$business-link',
    'module_association',
    '$accounts',
    '$vendor',
    '账号资源对应实际厂商提供的账号。',
  );
  edge('$call', 'call', '$entry', '$assign', '通过申请信息建立企业持有和员工使用关系。', {
    operations: [
      {
        name: '分配账号',
        interfaceSignature: 'assign(input: AssignmentInput): Holding',
        input: '账号标识、企业、员工',
        returns: { kind: 'data', summary: '企业持有结果' },
      },
    ],
  });
  edge('$admit', 'call', '$assign', '$check', '交付前取得套餐与费用的准入判断。', {
    operations: [
      {
        name: '检查交付资格',
        interfaceSignature: null,
        input: '企业、套餐',
        returns: { kind: 'data', summary: '准入结果' },
      },
    ],
  });
  edge('$unknown', 'call', '$entry', '$sync', '向厂商提交账号开通信息，返回性质仍待确认。', {
    operations: [
      { name: '提交开通', interfaceSignature: null, input: '申请标识、账号标识', returns: null },
    ],
  });
  edge('$no-return', 'call', '$recover', '$sync', '通知厂商结束指定账号的使用，不返回业务数据。', {
    operations: [
      { name: '结束使用', interfaceSignature: null, input: '账号标识', returns: { kind: 'none' } },
    ],
  });
  edge('$read', 'read', '$assign', '$plan', '读取套餐席位数量，判断是否允许新增分配。', {
    operations: [{ name: '读取套餐', selector: '套餐标识', result: '套餐席位数量' }],
  });
  edge('$company-read', 'read', '$entry', '$company', '核对申请企业是否存在。', {
    operations: [{ name: '读取企业', selector: '企业标识', result: '企业名称与身份' }],
  });
  edge('$employee-read', 'read', '$entry', '$employee', '核对员工是否属于本次申请的企业。', {
    operations: [{ name: '读取员工', selector: '员工标识', result: '员工所属企业' }],
  });
  edge('$write', 'write', '$assign', '$holding', '保存企业持有关系，作为后续员工分配的依据。', {
    operations: [{ name: '建立持有', selector: '账号、企业', changes: '新增企业持有关系' }],
  });
  edge('$end', 'write', '$recover', '$usage', '回收时结束当前员工使用区间，保留历史。', {
    operations: [{ name: '结束使用区间', selector: '当前使用区间标识', changes: '填入结束时间' }],
  });
  edge('$event', 'event', '$history', '$sync', '变更登记向已确认的厂商适配订阅方发布业务事实。', {
    events: [
      {
        name: '账号分配已变更',
        eventName: 'account.assignment.changed',
        payload: '账号标识、企业持有标识',
      },
    ],
  });
  edge(
    '$association',
    'object_association',
    '$holding',
    '$usage',
    '企业持有关系可对应多段员工使用历史。',
    { associationKey: 'Usage.holdingId', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
  );
  edge('$optional', 'object_association', '$request', '$holding', '申请可能还没有形成交付结果。', {
    associationKey: 'DeliveryRequest.holdingId',
    sourceMultiplicity: '0..*',
    targetMultiplicity: '0..1',
  });
  edge('$account-ref', 'object_association', '$holding', '$account', '持有记录对应一个账号。', {
    associationKey: 'Holding.accountId',
    sourceMultiplicity: null,
    targetMultiplicity: '1',
  });
  put('note', '$state', {
    title: '状态机',
    problemMd: '账号以明确的可用和已持有状态表达资源可分配性，避免把任意字段修改当作合法交付。',
    entityIds: ['$account'],
  });
  put('note', '$transaction', {
    title: '事务边界',
    problemMd: '分配和持有、使用记录共同保存，避免只更新一半关系而无法核对交付结果。',
    entityIds: ['$assign', '$holding', '$usage'],
  });
  put('note', '$idempotent', {
    title: '幂等',
    problemMd: '按申请身份处理重试，避免网络重试产生重复的账号分配。',
    entityIds: ['$assign', '$request'],
  });
  put('diagram', '$overview', {
    title: '虚构业务全景',
    scope: { kind: 'project' },
    entityIds: ['$accounts', '$billing', '$org', '$vendor'],
    relationshipIds: ['$depends', '$identity', '$business-link'],
    noteIds: [],
  });
  put('diagram', '$internal', {
    title: '虚构账号供给与履约内部',
    scope: { kind: 'module', moduleId: '$accounts' },
    entityIds: [
      '$entry',
      '$assign',
      '$recover',
      '$history',
      '$check',
      '$sync',
      '$account',
      '$holding',
      '$usage',
      '$request',
      '$company',
      '$employee',
      '$plan',
    ],
    relationshipIds: [
      '$call',
      '$admit',
      '$unknown',
      '$no-return',
      '$read',
      '$company-read',
      '$employee-read',
      '$write',
      '$end',
      '$event',
      '$association',
      '$optional',
      '$account-ref',
    ],
    noteIds: ['$state', '$transaction', '$idempotent'],
  });
  return { changes, sources };
}
export async function seedBusinessFixture(base: string, projectId: string) {
  const { changes, sources } = buildBusinessFixture();
  const saved = await saveRequirementFixture(
    base,
    projectId,
    0,
    changes,
    '明确的虚构业务图测试',
    sources,
  );
  return {
    ids: Object.fromEntries(saved.allocations.map((item) => [item.localRef, item.id])) as Record<
      string,
      string
    >,
    ...saved,
  };
}
