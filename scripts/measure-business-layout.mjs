import ELK from 'elkjs/lib/elk.bundled.js';
import { runLayout } from '../src/web/business/graph/layout.ts';
import { cellId } from '../src/web/business/graph/model.ts';
for (const count of [100, 300]) {
  const model = {
    title: 'Synthetic stress fixture',
    moduleId: 'module',
    ownerNames: new Map([['module', 'Stress module']]),
    notes: [],
    nodes: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      entity: {
        id: `n${i}`,
        revisionNo: 1,
        content:
          i % 2
            ? {
                kind: 'data_object',
                name: `数据对象 ${i}`,
                summary: '保留实际字段和说明的合成压力数据，不是项目资料。',
                owner: { kind: 'module', id: 'module' },
                primarySourceId: null,
                typeSourceId: null,
                typeName: 'Account',
                typeScript:
                  'type Account = { id: string; // 账号标识\n enterpriseId: string; // 企业归属\n status: "ready" | "assigned"; // 资源状态\n}',
              }
            : {
                kind: 'component',
                name: `处理组件 ${i}`,
                summary: '确认账号所属企业和有效状态，按明确的业务约束处理分配请求并记录结果。',
                owner: { kind: 'module', id: 'module' },
                primarySourceId: null,
              },
      },
      external: false,
      ownerId: 'module',
      directory: `modules/stress/area${Math.floor(i / 20)}/`,
      notes: [],
    })),
    edges: Array.from({ length: count * 2 }, (_, i) => ({
      id: `e${i}`,
      revisionNo: 1,
      content: {
        kind: 'read',
        sourceId: `n${2 * (i % (count / 2))}`,
        targetId: `n${2 * ((i * 7 + Math.floor(i / (count / 2))) % (count / 2)) + 1}`,
        summary: '读取对象的当前归属与资源状态，供后续分配判断使用。',
        operations: [
          { name: '读取资源', selector: '账号标识、企业标识', result: '当前状态和归属' },
        ],
      },
    })),
  };
  const sizes = new Map([
    ...model.nodes.map((n) => [
      cellId('entity', n.id),
      { width: 288, height: n.entity.content.kind === 'data_object' ? 240 : 120 },
    ]),
    ...model.edges.map((e) => [cellId('label', e.id), { width: 280, height: 90 }]),
  ]);
  const start = performance.now();
  try {
    const result = await runLayout(new ELK(), model, sizes, (s) => s.length * 8);
    console.log(
      JSON.stringify({
        nodes: count,
        edges: count * 2,
        ms: Math.round(performance.now() - start),
        width: result.root.width,
        height: result.root.height,
        quality: 'passed',
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        nodes: count,
        edges: count * 2,
        ms: Math.round(performance.now() - start),
        quality: 'failed',
        error: error.message,
      }),
    );
  }
}
