import { describe, expect, it } from 'vitest';
import ELK from 'elkjs/lib/elk.bundled.js';
import { intersection } from 'polygon-clipping';
import {
  businessModel,
  cellId,
  edgeText,
  sourceDirectory,
} from '../../src/web/business/graph/model.js';
import { geometryIssues, runLayout } from '../../src/web/business/graph/layout.js';
import { rectangle, scopeContour } from '../../src/web/business/graph/contours.js';
import { fixtureModel } from '../helpers/business-model.js';

describe('business graph semantics and native automatic layout', () => {
  it('keeps known results, explicit no-return, unknown results, selectors and changes distinct', () => {
    const { model } = fixtureModel();
    const text = (id: string) => edgeText(model.edges.find((edge) => edge.id === id)!).operations;
    expect(text('$call')).toEqual(['分配账号（账号标识、企业、员工）：企业持有结果']);
    expect(text('$unknown')).toEqual(['提交开通（申请标识、账号标识）：返回待确认']);
    expect(text('$no-return')).toEqual(['结束使用（账号标识）：无返回']);
    expect(text('$write')).toEqual(['建立持有（账号、企业；新增企业持有关系）']);
    expect(text('$read')).toEqual(['读取套餐（套餐标识）：套餐席位数量']);
    expect(text('$event')).toEqual(['账号分配已变更（账号标识、企业持有标识）']);
  });
  it('derives directories from only the core source without inventing paths', () => {
    expect(sourceDirectory('src/modules/accounts/domain/account.ts')).toBe(
      'modules/accounts/domain/',
    );
    expect(sourceDirectory('src/feature/a.ts')).toBe('src/feature/');
    expect(sourceDirectory('main.ts')).toBe('');
    expect(cellId('directory', 'a/b', 'c')).not.toBe(cellId('directory', 'a', 'b/c'));
    const { model } = fixtureModel();
    expect(model.nodes.filter((node) => !node.external)).toHaveLength(8);
    expect(model.nodes.find((node) => node.id === '$company')?.external).toBe(true);
    expect(model.nodes.find((node) => node.id === '$account')?.notes).toHaveLength(1);
    expect(model.notes).toHaveLength(2);
  });
  it('supports crossing scopes without enclosing unrelated objects or changing membership', () => {
    const a = { x: 0, y: 0, width: 100, height: 60 },
      b = { x: 120, y: 0, width: 100, height: 60 },
      c = { x: 240, y: 0, width: 100, height: 60 };
    const ab = scopeContour([a, b], [c]),
      bc = scopeContour([b, c], [a]);
    expect(intersection(ab, rectangle(c))).toEqual([]);
    expect(intersection(bc, rectangle(a))).toEqual([]);
    expect(intersection(ab, bc, rectangle(b)).length).toBeGreaterThan(0);
    expect(intersection(ab, rectangle(a))).toEqual([rectangle(a)]);
  });
  it('lays out compound directories, labels and endpoint quantities without collisions and independently of input order', async () => {
    const { data, model, sizes } = fixtureModel();
    const engine = new ELK.default();
    {
      const first = await runLayout(engine, model, sizes, (text) => text.length * 8);
      expect(geometryIssues(model, first)).toEqual([]);
      const reversed = businessModel({
        ...data,
        bundle: {
          ...data.bundle,
          entities: [...data.bundle.entities].reverse(),
          relationships: [...data.bundle.relationships].reverse(),
          notes: [...data.bundle.notes].reverse(),
        },
      });
      const second = await runLayout(engine, reversed, sizes, (text) => text.length * 8);
      expect([...second.boxes]).toEqual([...first.boxes]);
      for (const item of first.edges.filter((item) =>
        model.edges.some((edge) => cellId('edge', edge.id) === item.edge.id),
      )) {
        expect(item.edge.labels?.[0]?.text).toBeTruthy();
        expect(item.edge.sections?.length).toBeGreaterThan(0);
      }
      const association = first.edges.find(
        (item) => item.edge.id === cellId('edge', '$association'),
      )!;
      const tail = association.edge.labels!.find(
        (label) => label.id === cellId('multiplicity', '$association', 'TAIL'),
      )!;
      const head = association.edge.labels!.find(
        (label) => label.id === cellId('multiplicity', '$association', 'HEAD'),
      )!;
      expect([tail.text, head.text]).toEqual(['1', '0..*']);
      expect(
        [...first.groups.values()].some((group) => group.label === 'modules/accounts/application/'),
      ).toBe(true);
    }
  });
});
