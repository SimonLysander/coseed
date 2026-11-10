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
    const width =
      node.kind === 'actor'
        ? foundations.graph.nodeWidth.actor
        : node.kind === 'use_case'
          ? foundations.graph.nodeWidth.useCase
          : foundations.graph.nodeWidth.concept;
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
  const input: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': model.systemName ? 'RIGHT' : 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(foundations.graph.nodeGapMin),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(foundations.graph.layerGapMin),
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
    edges: model.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
      ...(edge.label
        ? {
            labels: [
              {
                text: edge.label,
                width:
                  Dom.measureText(edge.label, {
                    fontFamily: foundations.font.ui,
                    fontSize: foundations.type.edgeLabel.size,
                  }).width + 12,
                height: foundations.type.edgeLabel.lineHeight + 4,
              },
            ],
          }
        : {}),
    })),
  };
  return { input, labels };
}
