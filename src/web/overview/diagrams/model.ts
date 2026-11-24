import type { ProjectOverviewContent, SystemDiagram } from '../../../contracts/content/overview.js';

export interface DiagramNode {
  id: string;
  label: string;
  kind: 'concept' | 'actor' | 'use_case' | SystemDiagram['nodes'][number]['kind'];
}
export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: 'kind-of' | 'composition' | 'association' | 'participation' | 'access';
}
export interface DiagramModel {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  systemName?: string;
}

export function systemDiagramModel(content: SystemDiagram): DiagramModel {
  return {
    nodes: content.nodes.map((node) => ({ ...node, id: 'system:' + node.id })),
    edges: content.edges.map((edge) => ({
      id: 'access:' + JSON.stringify([edge.source, edge.target, edge.label]),
      kind: 'access',
      source: 'system:' + edge.source,
      target: 'system:' + edge.target,
      label: edge.label,
    })),
  };
}

export function conceptsModel(content: ProjectOverviewContent['concepts']): DiagramModel {
  return {
    nodes: content.entries.map((entry) => ({
      id: `concept:${entry.id}`,
      label: entry.name,
      kind: 'concept',
    })),
    edges: content.relations.map((relation) => ({
      id: `relation:${relation.id}`,
      source: `concept:${relation.source}`,
      target: `concept:${relation.target}`,
      kind: relation.kind,
      label:
        relation.kind === 'kind-of'
          ? '是一种'
          : relation.kind === 'composition'
            ? '包含'
            : relation.label,
    })),
  };
}

export function useCaseModel(
  content: ProjectOverviewContent['examples'],
  ids: string[],
  systemName: string,
): DiagramModel {
  const useCases = content.useCases.filter((item) => ids.includes(item.id));
  const actorIds = new Set(useCases.flatMap((item) => item.actorIds));
  return {
    systemName,
    nodes: [
      ...content.actors
        .filter((actor) => actorIds.has(actor.id))
        .map((actor): DiagramNode => ({
          id: `actor:${actor.id}`,
          label: actor.name,
          kind: 'actor',
        })),
      ...useCases.map((item): DiagramNode => ({
        id: `use-case:${item.id}`,
        label: item.name,
        kind: 'use_case',
      })),
    ],
    edges: useCases.flatMap((item) =>
      item.actorIds.map((actorId) => ({
        id: `participates:${JSON.stringify([actorId, item.id])}`,
        source: `actor:${actorId}`,
        target: `use-case:${item.id}`,
        label: '',
        kind: 'participation' as const,
      })),
    ),
  };
}
