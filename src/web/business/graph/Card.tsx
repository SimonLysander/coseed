import type { BusinessNode, Note, Relationship } from './model.js';
import { edgeText } from './model.js';
import { Markdown } from '../../reading/Markdown.js';
import type { DiagramSummary } from '../../../contracts/business-http.js';
import { Button, Dropdown } from 'antd';
import { Link } from 'react-router';
import { ArrowRightIcon } from '@animateicons/react/lucide/arrow-right-icon';
import { foundations } from '../../design-system/tokens.js';
export interface CardData {
  kind: 'entity' | 'note' | 'edge-label';
  node?: BusinessNode;
  note?: Note;
  marker?: string;
  edge?: Relationship;
  diagrams?: (DiagramSummary & { to: string })[];
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
        <Markdown text={data.note.content.problemMd} headingStart={4} />
      </aside>
    );
  const node = data.node!;
  const entity = node.entity.content;
  const paint = entity.kind === 'data_object' ? 'data' : node.external ? 'external' : 'processing';
  const cardProps = {
    className: `business-card business-card-${paint}${data.diagrams?.length ? ' business-card-navigable' : ''}`,
    'data-entity-id': node.id,
    'data-entity-kind': entity.kind,
    'data-external': node.external,
  };
  const content = (
    <>
      <h3>
        <span>{entity.name}</span>
        {!!data.diagrams?.length && (
          <span className="business-card-entry-icon" aria-hidden="true">
            <ArrowRightIcon size={foundations.size.icon} />
          </span>
        )}
      </h3>
      <p>{entity.summary}</p>
      {entity.kind === 'data_object' && (
        <pre>
          <code>{entity.typeScript}</code>
        </pre>
      )}
      {node.notes.map((note) => (
        <aside className="business-card-note" role="note" key={note.id}>
          <h4>{note.content.title}</h4>
          <Markdown text={note.content.problemMd} headingStart={5} />
        </aside>
      ))}
    </>
  );
  if (data.diagrams?.length === 1)
    return (
      <Link {...cardProps} to={data.diagrams[0]!.to} aria-label={`${entity.name}，查看内部`}>
        {content}
      </Link>
    );
  if ((data.diagrams?.length ?? 0) > 1)
    return (
      <Dropdown
        trigger={['click']}
        menu={{
          items: data.diagrams!.map((item) => ({
            key: item.id,
            label: <Link to={item.to}>{item.title}</Link>,
          })),
        }}
      >
        <Button {...cardProps} aria-label={`${entity.name}，选择内部图`}>
          {content}
        </Button>
      </Dropdown>
    );
  return (
    <section {...cardProps} aria-label={entity.name}>
      {content}
    </section>
  );
}
