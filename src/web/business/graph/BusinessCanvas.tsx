import { useEffect, useMemo, useRef, useState } from 'react';
import { Graph, Dom, type Node } from '@antv/x6';
import { getProvider, register } from '@antv/x6-react-shape';
import { Alert, Button, Skeleton, Space } from 'antd';
import { PlusIcon } from '@animateicons/react/lucide/plus-icon';
import { MinusIcon } from '@animateicons/react/lucide/minus-icon';
import { foundations } from '../../design-system/tokens.js';
import { acquireLayout } from '../../diagrams/elk-engine.js';
import type { DiagramSummary } from '../../../contracts/business-http.js';
import { cellId, type BusinessModel } from './model.js';
import { BusinessCard, type CardData } from './Card.js';
import { runLayout, type Size } from './layout.js';
import { scopeContour, polygonPath } from './contours.js';

register({
  shape: 'coseed-business-card',
  component: ({ node }: { node: Node }) => <BusinessCard data={node.getData<CardData>()} />,
  effect: ['data'],
});
const PortalProvider = getProvider();
export default function BusinessCanvas({
  model,
  moduleDiagrams,
  onOpen,
}: {
  model: BusinessModel;
  moduleDiagrams: DiagramSummary[];
  onOpen: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    measurement = useRef<HTMLDivElement>(null),
    graphRef = useRef<Graph | null>(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [scale, setScale] = useState(1);
  const cards = useMemo(() => {
    const result = new Map<string, { data: CardData; width: number }>();
    for (const node of model.nodes) {
      const diagrams = moduleDiagrams.filter(
        (diagram) => diagram.scope.kind === 'module' && diagram.scope.moduleId === node.id,
      );
      result.set(cellId('entity', node.id), {
        width:
          node.entity.content.kind === 'data_object'
            ? foundations.graph.nodeWidth.data
            : node.external
              ? foundations.graph.nodeWidth.external
              : foundations.graph.nodeWidth.processing,
        data: { kind: 'entity', node, diagrams, onOpen: (id) => openRef.current(id) },
      });
    }
    model.notes.forEach((note, index) =>
      result.set(cellId('note', note.id), {
        width: foundations.graph.nodeWidth.note,
        data: { kind: 'note', note, marker: String(index + 1) },
      }),
    );
    model.edges.forEach((edge) =>
      result.set(cellId('label', edge.id), {
        width: foundations.graph.edgeLabelWidth,
        data: { kind: 'edge-label', edge },
      }),
    );
    return result;
  }, [model, moduleDiagrams]);
  useEffect(() => {
    const element = host.current,
      measure = measurement.current;
    if (!element || !measure) return;
    let alive = true;
    const lease = acquireLayout();
    const graph = new Graph({
      container: element,
      width: element.clientWidth,
      height: element.clientHeight,
      interacting: {
        nodeMovable: false,
        edgeMovable: false,
        vertexMovable: false,
        arrowheadMovable: false,
        edgeLabelMovable: false,
      },
      panning: { enabled: true, eventTypes: ['leftMouseDown', 'mouseWheelDown'] },
      mousewheel: {
        enabled: true,
        guard: (event) => !event.shiftKey,
        zoomAtMousePosition: true,
        minScale: 0.12,
        maxScale: 2,
      },
      scaling: { min: 0.12, max: 2 },
      background: { color: 'transparent' },
    });
    graphRef.current = graph;
    setStatus('loading');
    graph.on('scale', ({ sx }) => setScale(sx));
    const observer = new ResizeObserver(() =>
      graph.resize(element.clientWidth, element.clientHeight),
    );
    observer.observe(element);
    void document.fonts.ready
      .then(async () => {
        if (!alive) return;
        const sizes = new Map<string, Size>();
        for (const wrapper of measure.querySelectorAll<HTMLElement>('[data-measure-id]')) {
          const box = wrapper.firstElementChild?.getBoundingClientRect();
          if (box)
            sizes.set(wrapper.dataset.measureId!, {
              width: Math.ceil(box.width),
              height: Math.ceil(box.height),
            });
        }
        const layout = await runLayout(
          lease.engine,
          model,
          sizes,
          (value) =>
            Dom.measureText(value, {
              fontFamily: foundations.font.code,
              fontSize: foundations.type.code.size,
            }).width,
        );
        if (!alive) return;
        graph.batchUpdate(() => {
          for (const group of layout.groups.values()) {
            const box = layout.boxes.get(group.id)!;
            graph.addNode({
              id: group.id,
              ...box,
              shape: 'rect',
              zIndex: 0,
              data: { viewKind: group.kind },
              attrs: {
                body: {
                  fill:
                    group.kind === 'external'
                      ? 'var(--ds-color-graph-external-background)'
                      : 'var(--ds-color-graph-groupBackground)',
                  fillOpacity: group.kind === 'directory' ? 0.4 : 0.65,
                  stroke: 'var(--ds-color-border-subtle)',
                  strokeDasharray:
                    group.kind === 'directory' ? '6 4' : group.kind === 'external' ? '4 4' : '',
                  rx: 10,
                  ry: 10,
                },
                label: {
                  text: group.label,
                  refX: foundations.graph.groupPadding,
                  refY: foundations.graph.groupPadding,
                  textAnchor: 'start',
                  textVerticalAnchor: 'top',
                  fontFamily:
                    group.kind === 'directory' ? foundations.font.code : foundations.font.ui,
                  fontSize: foundations.type.code.size,
                  fill: 'var(--ds-color-text-secondary)',
                },
              },
            });
          }
          for (const [id, card] of cards) {
            if (card.data.kind === 'edge-label') continue;
            const box = layout.boxes.get(id)!;
            if (!box) throw new Error('布局缺少对象或技术说明的位置。');
            graph.addNode({
              id,
              ...box,
              shape: 'coseed-business-card',
              zIndex: 5,
              attrs: { body: { fill: 'transparent', stroke: 'none' } },
              data: card.data,
            });
          }
          for (const { edge, x, y } of layout.edges) {
            const content = model.edges.find((value) => cellId('edge', value.id) === edge.id);
            if (!content) continue;
            const kind = content.content.kind;
            const undirected = kind === 'object_association' || kind === 'module_association';
            const color =
              kind === 'event' ? 'var(--ds-color-graph-event)' : 'var(--ds-color-graph-edge)';
            for (const [index, section] of (edge.sections ?? []).entries())
              graph.addEdge({
                id: `${edge.id}:${index}`,
                zIndex: 2,
                source: { x: x + section.startPoint.x, y: y + section.startPoint.y },
                target: { x: x + section.endPoint.x, y: y + section.endPoint.y },
                vertices: section.bendPoints?.map((point) => ({ x: x + point.x, y: y + point.y })),
                connector: { name: 'rounded', args: { radius: 4 } },
                data: {
                  kind,
                  relationshipId: content.id,
                  sourceId: content.content.sourceId,
                  targetId: content.content.targetId,
                },
                attrs: {
                  line: {
                    stroke: color,
                    strokeWidth: foundations.shape.sketchStroke,
                    strokeDasharray: undirected ? '' : kind === 'event' ? '2 4' : '7 4',
                    sourceMarker: null,
                    targetMarker:
                      !undirected && index === (edge.sections?.length ?? 0) - 1
                        ? {
                            name: 'block',
                            open: true,
                            width: 8,
                            height: 8,
                            fill: 'none',
                            stroke: color,
                          }
                        : null,
                  },
                },
              });
            for (const label of edge.labels ?? []) {
              if (!Number.isFinite(label.x) || !Number.isFinite(label.y))
                throw new Error('布局缺少关系文字的位置。');
              const id = label.id!;
              if (id === cellId('label', content.id))
                graph.addNode({
                  id,
                  x: x + label.x!,
                  y: y + label.y!,
                  width: label.width!,
                  height: label.height!,
                  zIndex: 4,
                  shape: 'coseed-business-card',
                  attrs: { body: { fill: 'transparent', stroke: 'none' } },
                  data: cards.get(id)!.data,
                });
              else
                graph.addNode({
                  id,
                  x: x + label.x!,
                  y: y + label.y!,
                  width: label.width!,
                  height: label.height!,
                  zIndex: 4,
                  shape: 'rect',
                  data: { viewKind: 'multiplicity', edgeId: content.id },
                  attrs: {
                    body: { fill: 'var(--ds-color-graph-labelBackground)', stroke: 'none' },
                    label: {
                      text: label.text,
                      fontSize: foundations.graph.multiplicityFontSize,
                      fontFamily: foundations.font.ui,
                      fill: 'var(--ds-color-text-primary)',
                    },
                  },
                });
            }
          }
          for (const [index, note] of model.notes.entries()) {
            const members = note.content.entityIds.map((id) =>
              layout.boxes.get(cellId('entity', id))!,
            );
            const excluded = model.nodes
              .filter((node) => !note.content.entityIds.includes(node.id))
              .map((node) => layout.boxes.get(cellId('entity', node.id))!);
            const geometry = scopeContour(members, excluded);
            graph.addNode({
              id: cellId('scope', note.id),
              x: 0,
              y: 0,
              width: layout.root.width!,
              height: layout.root.height!,
              zIndex: 1,
              shape: 'path',
              data: { viewKind: 'note-scope', members: note.content.entityIds, noteId: note.id },
              attrs: {
                body: {
                  d: polygonPath(geometry),
                  fill: 'var(--ds-color-graph-note-background)',
                  fillOpacity: 0.25,
                  stroke: 'var(--ds-color-graph-note-border)',
                  strokeWidth: 1.5,
                  strokeDasharray: index % 2 ? '2 3' : '8 4',
                  pointerEvents: 'none',
                  fillRule: 'evenodd',
                },
              },
            });
            for (const member of note.content.entityIds) {
              const box = layout.boxes.get(cellId('entity', member))!;
              const rank = model.notes
                .filter((item) => item.content.entityIds.includes(member))
                .findIndex((item) => item.id === note.id);
              graph.addNode({
                id: cellId('scope-marker', note.id, member),
                x: box.x - 14,
                y: box.y + 8 + rank * foundations.type.label.lineHeight,
                width: 16,
                height: 16,
                zIndex: 6,
                shape: 'circle',
                attrs: {
                  body: {
                    fill: 'var(--ds-color-surface-paper)',
                    stroke: 'var(--ds-color-graph-note-border)',
                  },
                  label: {
                    text: String(index + 1),
                    fill: 'var(--ds-color-text-primary)',
                    fontSize: foundations.type.caption.size,
                    fontFamily: foundations.font.ui,
                  },
                },
              });
            }
          }
          // Set semantic containment without deriving note membership from parent links.
          const parents = new Map<string, string>();
          const walk = (node: import('elkjs/lib/elk-api.js').ElkNode) => {
            for (const child of node.children ?? []) {
              if (node.id !== 'root') parents.set(child.id, node.id);
              walk(child);
            }
          };
          walk(layout.root);
          for (const [id, parent] of parents) {
            const child = graph.getCellById(id),
              container = graph.getCellById(parent);
            if (child && container) container.addChild(child);
          }
        });
        graph.zoomToFit({ padding: foundations.graph.groupPadding, maxScale: 1 });
        if (graph.zoom() < 0.75) {
          graph.zoomTo(1);
          const focus = [...model.nodes]
            .filter((node) => !node.external)
            .sort(
              (a, b) =>
                model.edges.filter(
                  (edge) => edge.content.sourceId === b.id || edge.content.targetId === b.id,
                ).length -
                model.edges.filter(
                  (edge) => edge.content.sourceId === a.id || edge.content.targetId === a.id,
                ).length,
            )[0];
          if (focus) graph.centerCell(graph.getCellById(cellId('entity', focus.id)));
        } else graph.centerContent();
        setScale(graph.zoom());
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (alive) {
          console.error('业务图布局失败', reason);
          setError(reason instanceof Error ? reason.message : '布局失败');
          setStatus('error');
        }
      });
    return () => {
      alive = false;
      observer.disconnect();
      graph.dispose();
      if (graphRef.current === graph) graphRef.current = null;
      lease.release();
    };
  }, [model, cards, attempt]);
  return (
    <figure className="business-figure" aria-label={model.title}>
      <div className="business-canvas-tools">
        <Space size="small">
          <Button
            aria-label="缩小业务图"
            icon={<MinusIcon className="ds-icon" size={foundations.size.icon} />}
            onClick={() => graphRef.current?.zoom(-0.1)}
          />
          <span className="business-scale">{Math.round(scale * 100)}%</span>
          <Button
            aria-label="放大业务图"
            icon={<PlusIcon className="ds-icon" size={foundations.size.icon} />}
            onClick={() => graphRef.current?.zoom(0.1)}
          />
          <Button
            onClick={() => {
              graphRef.current?.zoomToFit({ padding: 20, maxScale: 1 });
              graphRef.current?.centerContent();
            }}
          >
            适应画布
          </Button>
          <Button onClick={() => graphRef.current?.zoomTo(1)}>100%</Button>
        </Space>
        <span>滚轮缩放，空白处拖动</span>
      </div>
      <div
        className="business-canvas"
        ref={host}
        role="region"
        aria-label="业务设计画布"
        data-ready={status === 'ready'}
        aria-busy={status === 'loading'}
      />
      <PortalProvider />
      {status === 'loading' && (
        <div className="business-canvas-loading" role="status">
          <Skeleton active />
        </div>
      )}
      {status === 'error' && (
        <Alert
          type="error"
          title="业务图暂时无法绘制"
          description={error}
          action={<Button onClick={() => setAttempt((n) => n + 1)}>重新绘制</Button>}
        />
      )}
      <div ref={measurement} className="business-measurement" aria-hidden="true">
        {[...cards].map(([id, card]) => (
          <div key={id} data-measure-id={id} style={{ width: card.width }}>
            <BusinessCard data={card.data} />
          </div>
        ))}
      </div>
    </figure>
  );
}
