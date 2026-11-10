import type { BusinessNode, Note, Relationship } from './model.js';
import { edgeText } from './model.js';
import { Markdown } from '../../reading/Markdown.js';
import type { DiagramSummary } from '../../../contracts/business-http.js';
import { Button, Dropdown } from 'antd';
export interface CardData {
  kind: 'entity' | 'note' | 'edge-label';
  node?: BusinessNode;
  note?: Note;
  marker?: string;
  edge?: Relationship;
  diagrams?: DiagramSummary[];
  onOpen?: (id: string) => void;
}
export function BusinessCard({ data }: { data: CardData }) {
  if (data.kind === 'edge-label' && data.edge) {
    const text = edgeText(data.edge);
    return (
      <div className="business-edge-label" data-edge-id={data.edge.id}>
        <div className="business-edge-summary">
          {['call', 'read', 'write', 'event'].includes(data.edge.content.kind) && (
            <span className="business-edge-notation">«{data.edge.content.kind}»</span>
          )}
          {text.summary}
        </div>
        {text.operations.map((line, i) => (
          <div className="business-edge-operation" key={i}>
            {line}
          </div>
        ))}
      </div>
    );
  }
  if (data.kind === 'note' && data.note)
    return (
      <aside
        className="business-note"
        role="note"
        aria-label={data.note.content.title}
        data-note-id={data.note.id}
      >
        <h3>
          <span className="business-scope-marker">{data.marker}</span>
          {data.note.content.title}
        </h3>
        <Markdown text={data.note.content.problemMd} />
      </aside>
    );
  const node = data.node!;
  const entity = node.entity.content;
  const paint = entity.kind === 'data_object' ? 'data' : node.external ? 'external' : 'processing';
  return (
    <section
      className={`business-card business-card-${paint}${data.diagrams?.length ? ' business-card-navigable' : ''}`}
      aria-label={entity.name}
      data-entity-id={node.id}
      data-entity-kind={entity.kind}
      data-external={node.external}
    >
      <h3>{entity.name}</h3>
      <p>{entity.summary}</p>
      {entity.kind === 'data_object' && (
        <pre>
          <code>{entity.typeScript}</code>
        </pre>
      )}
      {node.notes.map((note) => (
        <aside className="business-card-note" role="note" key={note.id}>
          <h4>{note.content.title}</h4>
          <Markdown text={note.content.problemMd} />
        </aside>
      ))}
      {data.diagrams?.length === 1 && (
        <Button type="link" size="small" onClick={() => data.onOpen?.(data.diagrams![0]!.id)}>
          查看内部
        </Button>
      )}
      {(data.diagrams?.length ?? 0) > 1 && (
        <Dropdown
          trigger={['click']}
          menu={{
            items: data.diagrams!.map((item) => ({ key: item.id, label: item.title })),
            onClick: ({ key }) => data.onOpen?.(key),
          }}
        >
          <Button type="link" size="small">
            选择内部图
          </Button>
        </Dropdown>
      )}
    </section>
  );
}
