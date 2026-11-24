import type { BusinessDiagramResponse } from '../../../contracts/business-http.js';
import type { BusinessDesignBundle } from '../../../contracts/content/business-design.js';
export type Entity = BusinessDesignBundle['entities'][number];
export type Relationship = BusinessDesignBundle['relationships'][number];
export type Note = BusinessDesignBundle['notes'][number];
export interface BusinessNode {
  id: string;
  entity: Entity;
  external: boolean;
  ownerId: string | null;
  directory: string | null;
  notes: Note[];
}
export interface BusinessModel {
  title: string;
  moduleId: string | null;
  ownerNames: Map<string, string>;
  nodes: BusinessNode[];
  edges: Relationship[];
  notes: Note[];
}
export const cellId = (kind: string, ...parts: string[]) => JSON.stringify([kind, ...parts]);
export function sourceDirectory(path: string): string {
  const parts = path.split('/');
  parts.pop();
  const start = parts.indexOf('modules');
  return parts.length ? (start >= 0 ? parts.slice(start) : parts).join('/') + '/' : '';
}
export function businessModel(data: BusinessDiagramResponse): BusinessModel {
  const selected = new Set(data.bundle.diagrams[0]!.content.entityIds);
  const scope = data.bundle.diagrams[0]!.content.scope;
  const paths = new Map(data.sourcePaths.map((source) => [source.id, source.path]));
  const notes = [...data.bundle.notes].sort(
    (a, b) => a.content.title.localeCompare(b.content.title) || a.id.localeCompare(b.id),
  );
  const nodes = data.bundle.entities
    .filter((value) => selected.has(value.id))
    .map((entity) => {
      const ownerId = 'owner' in entity.content ? entity.content.owner.id : null;
      const path =
        'primarySourceId' in entity.content && entity.content.primarySourceId
          ? paths.get(entity.content.primarySourceId)
          : null;
      return {
        id: entity.id,
        entity,
        external:
          scope.kind === 'module'
            ? ownerId !== scope.moduleId
            : entity.content.kind === 'external_system',
        ownerId,
        directory: path ? sourceDirectory(path) : null,
        notes: notes.filter(
          (note) => note.content.entityIds.length === 1 && note.content.entityIds[0] === entity.id,
        ),
      };
    })
    .sort(
      (a, b) =>
        a.entity.content.kind.localeCompare(b.entity.content.kind) ||
        a.entity.content.name.localeCompare(b.entity.content.name) ||
        a.id.localeCompare(b.id),
    );
  return {
    title: data.diagram.scopeName,
    moduleId: scope.kind === 'module' ? scope.moduleId : null,
    ownerNames: new Map(data.bundle.entities.map((item) => [item.id, item.content.name])),
    nodes,
    edges: [...data.bundle.relationships].sort(
      (a, b) =>
        a.content.kind.localeCompare(b.content.kind) ||
        a.content.summary.localeCompare(b.content.summary) ||
        a.id.localeCompare(b.id),
    ),
    notes: notes.filter((note) => note.content.entityIds.length > 1),
  };
}
export function edgeText(edge: Relationship): { summary: string; operations: string[] } {
  const r = edge.content;
  const args = (...values: string[]) => values.filter(Boolean).join('；');
  const signature = (name: string, input: string) => `${name}（${input}）`;
  let operations: string[] = [];
  if (r.kind === 'call')
    operations = r.operations.map(
      (op) =>
        `${signature(op.name, op.input)}：${op.returns === null ? '返回待确认' : op.returns.kind === 'none' ? '无返回' : op.returns.summary}`,
    );
  if (r.kind === 'read')
    operations = r.operations.map((op) => `${signature(op.name, op.selector)}：${op.result}`);
  if (r.kind === 'write')
    operations = r.operations.map((op) => signature(op.name, args(op.selector, op.changes)));
  if (r.kind === 'event')
    operations = r.events.map((event) => signature(event.name, event.payload));
  if (r.kind === 'object_association' && r.associationKey !== null)
    operations = [`关联字段：${r.associationKey}`];
  return { summary: r.summary, operations };
}
