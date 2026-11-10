import { saveRequirementFixture, fixtureCitations } from './requirements-fixture.js';

// Deterministic pressure data, separate from the 13-node fixture that covers every relationship kind.
export async function seedBusinessLoadFixture(base: string, projectId: string, count: number) {
  if (![100, 300].includes(count)) throw new Error('Unknown pressure fixture size');
  const sources: unknown[] = [
    { id: '$material', kind: 'document', rawText: '合成性能数据，不是用户资料或真实系统设计。' },
  ];
  const changes: unknown[] = [];
  const put = (objectType: string, id: string, content: unknown, sourceId?: string) =>
    changes.push({
      action: 'upsert',
      objectType,
      id,
      expectedRevision: null,
      content,
      citations: [
        ...fixtureCitations(),
        ...(sourceId
          ? [
              {
                sourceId,
                side: 'after',
                path: '/primarySourceId',
                explanationMd: '合成实现与类型，仅用于性能验证。',
              },
            ]
          : []),
      ],
    });
  put('entity', '$module', {
    kind: 'module',
    name: '合成压力模块',
    summary: '保留完整说明、字段、目录和语义关系的性能样本。',
    role: 'core',
  });
  for (let group = 0; group < count / 20; group++)
    sources.push({
      id: `$code${group}`,
      kind: 'code',
      rawText: '// 合成压力样本；每对节点表示一个处理组件和带行内注释的数据类型。',
      locator: { path: `src/modules/stress/area${group}/objects.ts` },
    });
  const entityIds = Array.from({ length: count }, (_, i) => `$node${i}`);
  for (let i = 0; i < count; i++) {
    const sourceId = `$code${Math.floor(i / 20)}`;
    const shared = { owner: { kind: 'module', id: '$module' }, primarySourceId: sourceId };
    put(
      'entity',
      entityIds[i]!,
      i % 2
        ? {
            ...shared,
            kind: 'data_object',
            name: `数据对象 ${i}`,
            summary: '保存账号、企业归属和资源状态，供分配判断核对当前资源资格。',
            typeSourceId: sourceId,
            typeName: `Account${i}`,
            typeScript: `type Account${i} = {\n  id: string; // 账号标识\n  enterpriseId: string; // 企业归属\n  status: 'ready' | 'assigned'; // 资源状态\n};`,
          }
        : {
            ...shared,
            kind: 'component',
            name: `处理组件 ${i}`,
            summary: '确认账号所属企业和有效状态，按明确的业务约束处理分配请求并记录结果。',
          },
      sourceId,
    );
  }
  const relationshipIds = Array.from({ length: count * 2 }, (_, i) => `$edge${i}`);
  for (let i = 0; i < count * 2; i++)
    put('relationship', relationshipIds[i]!, {
      kind: 'read',
      sourceId: entityIds[2 * (i % (count / 2))],
      targetId: entityIds[2 * ((i * 7 + Math.floor(i / (count / 2))) % (count / 2)) + 1],
      summary: '读取对象的当前归属与资源状态，供后续分配判断使用。',
      operations: [{ name: '读取资源', selector: '账号标识、企业标识', result: '当前状态和归属' }],
    });
  put('diagram', '$diagram', {
    title: `合成压力图 ${count}/${count * 2}`,
    scope: { kind: 'module', moduleId: '$module' },
    entityIds,
    relationshipIds,
    noteIds: [],
  });
  const saved = await saveRequirementFixture(
    base,
    projectId,
    0,
    changes,
    '合成浏览器性能样本',
    sources,
  );
  return {
    diagramId: saved.allocations.find((item) => item.localRef === '$diagram')!.id,
    nodes: count,
    edges: count * 2,
  };
}
