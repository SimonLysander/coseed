import { LRUCache } from 'lru-cache';
import type { ElkNode, ElkExtendedEdge, ELK } from 'elkjs/lib/elk-api.js';
import { foundations } from '../../design-system/tokens.js';
import { cellId, edgeText, type BusinessModel } from './model.js';
export interface Size {
  width: number;
  height: number;
}
export interface Group {
  id: string;
  label: string;
  kind: 'boundary' | 'directory' | 'external';
  parentId: string | null;
}
export interface LayoutInput {
  root: ElkNode;
  groups: Map<string, Group>;
}
// Geometry only: input includes topology, groups, measured sizes, labels and ELK options.
// Bound both entry count and estimated UTF-16 serialized size; never persist project content.
const layouts = new LRUCache<string, ElkNode>({
  max: 8,
  maxSize: 8 * 1024 * 1024,
  sizeCalculation: (value, key) => 2 * (key.length + JSON.stringify(value).length),
});
const pad = foundations.graph.groupPadding;
export function layoutInput(
  model: BusinessModel,
  sizes: Map<string, Size>,
  textWidth: (text: string) => number,
  direction: 'RIGHT' | 'DOWN',
): LayoutInput {
  const groups = new Map<string, Group>();
  const nodes = new Map<string, ElkNode>();
  const groupNodes = new Map<string, ElkNode>();
  const children: ElkNode[] = [];
  const ensureGroup = (id: string, label: string, kind: Group['kind'], parentId: string | null) => {
    if (!groupNodes.has(id)) {
      const node: ElkNode = {
        id,
        children: [],
        layoutOptions: {
          'elk.padding': `[top=${pad + foundations.type.code.lineHeight + foundations.graph.groupHeaderGap},left=${pad},bottom=${pad},right=${pad}]`,
          'elk.nodeSize.constraints': 'MINIMUM_SIZE',
          'elk.nodeSize.minimum': `(${textWidth(label) + pad * 2},80)`,
        },
      };
      groups.set(id, { id, label, kind, parentId });
      groupNodes.set(id, node);
      if (parentId) groupNodes.get(parentId)!.children!.push(node);
      else children.push(node);
    }
    return id;
  };
  const boundary = model.moduleId
    ? ensureGroup(cellId('boundary', model.moduleId), model.title, 'boundary', null)
    : null;
  for (const content of model.nodes) {
    const id = cellId('entity', content.id);
    const size = sizes.get(id);
    if (!size) throw new Error('缺少节点尺寸。');
    let parent = !content.external
      ? boundary
      : content.ownerId
        ? ensureGroup(
            cellId('external-owner', content.ownerId),
            model.ownerNames.get(content.ownerId) ?? '外部系统',
            'external',
            null,
          )
        : null;
    if (content.directory) {
      const parts = content.directory.split('/').filter(Boolean);
      let path = '';
      for (const part of parts) {
        path += `${part}/`;
        parent = ensureGroup(
          cellId('directory', content.ownerId ?? '', path),
          path,
          'directory',
          parent,
        );
      }
    }
    const count = model.notes.filter((note) => note.content.entityIds.includes(content.id)).length;
    const node: ElkNode = {
      id,
      width: size.width,
      height: Math.max(size.height, count * foundations.type.label.lineHeight + pad),
    };
    nodes.set(id, node);
    if (parent) groupNodes.get(parent)!.children!.push(node);
    else children.push(node);
  }
  // Unary directory stems carry no extra ownership information. Compress them while retaining complete leaf labels.
  const compress = (list: ElkNode[]): ElkNode[] =>
    list.map((node) => {
      if (node.children) node.children = compress(node.children);
      const group = groups.get(node.id);
      if (
        group?.kind === 'directory' &&
        node.children?.length === 1 &&
        groups.get(node.children[0]!.id)?.kind === 'directory'
      ) {
        const child = node.children[0]!;
        groups.get(child.id)!.parentId = group.parentId;
        groups.delete(node.id);
        return child;
      }
      return node;
    });
  const edges: ElkExtendedEdge[] = model.edges.map((edge) => {
    const labelId = cellId('label', edge.id),
      size = sizes.get(labelId)!;
    const labels: NonNullable<ElkExtendedEdge['labels']> = [
      {
        id: labelId,
        text: [edgeText(edge).summary, ...edgeText(edge).operations].join('\n'),
        width: size.width,
        height: size.height,
        layoutOptions: { 'elk.edgeLabels.placement': 'CENTER' },
      },
    ];
    if (edge.content.kind === 'object_association') {
      for (const [side, value] of [
        ['TAIL', edge.content.sourceMultiplicity],
        ['HEAD', edge.content.targetMultiplicity],
      ] as const) {
        if (value !== null)
          labels.push({
            id: cellId('multiplicity', edge.id, side),
            text: value,
            width: textWidth(value) + 8,
            height: foundations.type.edgeLabel.lineHeight + 4,
            layoutOptions: { 'elk.edgeLabels.placement': side },
          });
      }
    }
    return {
      id: cellId('edge', edge.id),
      sources: [cellId('entity', edge.content.sourceId)],
      targets: [cellId('entity', edge.content.targetId)],
      labels,
    };
  });
  for (const note of model.notes) {
    const id = cellId('note', note.id),
      size = sizes.get(id)!;
    children.push({
      id,
      width: size.width,
      height: size.height,
      layoutOptions: { 'elk.commentBox': 'true' },
    });
    for (const member of note.content.entityIds)
      edges.push({
        id: cellId('annotation', note.id, member),
        sources: [id],
        targets: [cellId('entity', member)],
      });
  }
  return {
    groups,
    root: {
      id: 'root',
      children: compress(children),
      edges,
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': direction,
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
        'elk.edgeRouting': 'ORTHOGONAL',
        // Edges are declared at root; use that coordinate system for paths and labels.
        'elk.json.edgeCoords': 'PARENT',
        'elk.randomSeed': '1',
        'elk.spacing.nodeNode': String(foundations.graph.nodeGapMin + 16),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(foundations.graph.layerGapMin),
        'elk.spacing.edgeNode': '16',
        'elk.spacing.edgeEdge': '16',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.layered.mergeEdges': 'false',
      },
    },
  };
}
export interface Box extends Size {
  x: number;
  y: number;
}
export function flattenLayout(root: ElkNode) {
  const boxes = new Map<string, Box>();
  const edges: { edge: ElkExtendedEdge; x: number; y: number }[] = [];
  const walk = (node: ElkNode, x = 0, y = 0) => {
    const nx = x + (node.x ?? 0),
      ny = y + (node.y ?? 0);
    if (node.id !== 'root')
      boxes.set(node.id, { x: nx, y: ny, width: node.width ?? 0, height: node.height ?? 0 });
    for (const edge of node.edges ?? []) edges.push({ edge, x: nx, y: ny });
    for (const child of node.children ?? []) walk(child, nx, ny);
  };
  walk(root);
  return { boxes, edges };
}
export function geometryIssues(
  model: BusinessModel,
  layout: ReturnType<typeof flattenLayout>,
): string[] {
  const issues: string[] = [];
  const leaves = [
    ...model.nodes.map((node) => cellId('entity', node.id)),
    ...model.notes.map((note) => cellId('note', note.id)),
  ].map((id) => ({ id, ...layout.boxes.get(id)! }));
  const overlaps = (a: Box, b: Box) =>
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
  for (let i = 0; i < leaves.length; i++)
    for (let j = i + 1; j < leaves.length; j++)
      if (overlaps(leaves[i]!, leaves[j]!)) issues.push('节点或技术说明重叠');
  const labels: Box[] = [];
  for (const { edge, x, y } of layout.edges) {
    const actual = model.edges.find((value) => cellId('edge', value.id) === edge.id);
    if (!actual) continue;
    for (const label of edge.labels ?? []) {
      const box = {
        x: x + (label.x ?? 0),
        y: y + (label.y ?? 0),
        width: label.width ?? 0,
        height: label.height ?? 0,
      };
      if (leaves.some((node) => overlaps(box, node))) issues.push('关系文字遮挡节点');
      if (labels.some((previous) => overlaps(box, previous))) issues.push('关系文字相互遮挡');
      labels.push(box);
    }
    for (const section of edge.sections ?? []) {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
        (p) => ({ x: p.x + x, y: p.y + y }),
      );
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!,
          b = points[i]!;
        if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) issues.push('连线不是正交路径');
        const segment = {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.max(1.1, Math.abs(a.x - b.x)),
          height: Math.max(1.1, Math.abs(a.y - b.y)),
        };
        if (
          leaves.some(
            (node) =>
              node.id !== cellId('entity', actual.content.sourceId) &&
              node.id !== cellId('entity', actual.content.targetId) &&
              overlaps(segment, node),
          )
        )
          issues.push('连线穿过其他节点');
      }
    }
  }
  return [...new Set(issues)];
}
export async function runLayout(
  engine: ELK,
  model: BusinessModel,
  sizes: Map<string, Size>,
  textWidth: (text: string) => number,
) {
  const candidates = [];
  for (const direction of ['DOWN', 'RIGHT'] as const) {
    const input = layoutInput(model, sizes, textWidth, direction);
    const key = JSON.stringify(input.root);
    const cached = layouts.get(key);
    const root = cached ? structuredClone(cached) : await engine.layout(input.root);
    const width = root.width ?? 0,
      height = root.height ?? 0;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
      throw new Error('布局引擎未返回有效尺寸。');
    const flat = flattenLayout(root);
    const issues = geometryIssues(model, flat);
    if (!cached && !issues.length) layouts.set(key, structuredClone(root));
    candidates.push({
      issues,
      ...input,
      root,
      ...flat,
      score: width * height * (1 + Math.abs(Math.log(width / height / 1.4))),
    });
  }
  const valid = candidates
    .filter((candidate) => !candidate.issues.length)
    .sort((a, b) => a.score - b.score);
  if (!valid.length)
    throw new Error(
      `自动布局未通过几何检查：${[...new Set(candidates.flatMap((candidate) => candidate.issues))].join('、')}`,
    );
  return valid[0]!;
}
