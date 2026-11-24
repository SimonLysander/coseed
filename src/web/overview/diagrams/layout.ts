import type { ElkNode } from 'elkjs/lib/elk-api.js';
export { acquireLayout } from '../../diagrams/elk-engine.js';
import { Dom } from '@antv/x6';
import { foundations } from '../../design-system/tokens.js';
import type { DiagramModel } from './model.js';

export function layoutInput(model: DiagramModel): { input: ElkNode; labels: Map<string, string> } {
  const labels = new Map<string, string>();
  const font = {
    fontFamily: foundations.font.ui,
    fontSize: foundations.type.ui.size,
    lineHeight: `${foundations.type.ui.lineHeight}px`,
  };
  const children = model.nodes.map((node) => {
    let width = foundations.graph.nodeWidth.concept;
    if (node.kind === 'actor') width = foundations.graph.nodeWidth.actor;
    else if (node.kind === 'use_case') width = foundations.graph.nodeWidth.useCase;
    else if (node.kind !== 'concept')
      width = Math.min(width, Math.ceil(Dom.measureText(node.label, font).width) + 32);
    const wrapped = Dom.breakText(node.label, { width: width - 24, height: Infinity }, font);
    labels.set(node.id, wrapped);
    return {
      id: node.id,
      width,
      height: Math.max(
        node.kind === 'actor' ? 86 : 52,
        wrapped.split('\n').length * foundations.type.ui.lineHeight +
          (node.kind === 'actor' ? 64 : 24),
      ),
    };
  });
  const systemLabel = model.systemName
    ? Dom.breakText(
        model.systemName,
        { width: 226, height: Infinity },
        {
          fontFamily: foundations.font.ui,
          fontSize: foundations.type.label.size,
          lineHeight: `${foundations.type.label.lineHeight}px`,
        },
      )
    : '';
  labels.set('system-boundary', systemLabel);
  // ELK places each access label in its own layer, adding the layer gap on both sides.
  const layerGap = model.edges.some((edge) => edge.kind === 'access')
    ? foundations.graph.layerGapMin / 2
    : foundations.graph.layerGapMin;
  const input: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': model.systemName ? 'RIGHT' : 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(foundations.graph.nodeGapMin),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerGap),
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    children: model.systemName
      ? [
          ...children.filter(
            (child) => model.nodes.find((node) => node.id === child.id)?.kind === 'actor',
          ),
          {
            id: 'system-boundary',
            layoutOptions: {
              'elk.padding': `[top=${systemLabel.split('\n').length * foundations.type.label.lineHeight + 20},left=20,bottom=20,right=20]`,
            },
            children: children.filter(
              (child) => model.nodes.find((node) => node.id === child.id)?.kind === 'use_case',
            ),
          },
        ]
      : children,
    edges: model.edges.map((edge) => {
      const connection = { id: edge.id, sources: [edge.source], targets: [edge.target] };
      if (!edge.label) return connection;
      const edgeFont = {
        fontFamily: foundations.font.ui,
        fontSize: foundations.type.edgeLabel.size,
      };
      const text =
        edge.kind === 'access'
          ? Dom.breakText(
              edge.label,
              { width: foundations.graph.nodeWidth.actor, height: Infinity },
              edgeFont,
            )
          : edge.label;
      const lines = text.split('\n');
      return {
        ...connection,
        labels: [
          {
            text,
            width:
              lines.reduce(
                (widest, line) => Math.max(widest, Dom.measureText(line, edgeFont).width),
                0,
              ) + 12,
            height: lines.length * foundations.type.edgeLabel.lineHeight + 4,
          },
        ],
      };
    }),
  };
  return { input, labels };
}
