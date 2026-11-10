import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Skeleton } from 'antd';
import { Graph } from '@antv/x6';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { useAppearance } from '../../design-system/DesignSystemProvider.js';
import { foundations, resolveThemeTokens } from '../../design-system/tokens.js';
import { acquireLayout, layoutInput } from './layout.js';
import type { DiagramModel } from './model.js';

export function OverviewDiagram({ model, label }: { model: DiagramModel; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const drawing = useRef<Graph | null>(null);
  const { mode } = useAppearance();
  const theme = useRef(mode);
  theme.current = mode;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let alive = true;
    const lease = acquireLayout();
    const { input, labels } = layoutInput(model);
    setStatus('loading');
    const graph = new Graph({
      container: element,
      width: element.clientWidth,
      height: 180,
      interacting: false,
      panning: false,
      mousewheel: false,
      background: { color: 'transparent' },
      connecting: { allowBlank: false },
    });
    drawing.current = graph;
    let dimensions = { width: 1, height: 1 };
    const fit = () => {
      const width = element.parentElement?.clientWidth ?? element.clientWidth;
      if (!width) return;
      const scale = Math.min(1, Math.max(0.01, (width - 24) / dimensions.width));
      const height = Math.max(140, Math.ceil(dimensions.height * scale) + 32);
      element.style.height = `${height}px`;
      graph.resize(width, height);
      graph.zoomToFit({ padding: 12, maxScale: 1 });
      graph.centerContent();
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element.parentElement ?? element);
    void lease.engine
      .layout(input)
      .then((result) => {
        if (!alive) return;
        const colors = resolveThemeTokens(theme.current).color;
        const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
        const edgeById = new Map(model.edges.map((edge) => [edge.id, edge]));
        const walk = (parent: ElkNode, offsetX = 0, offsetY = 0) => {
          for (const node of parent.children ?? []) {
            const x = offsetX + (node.x ?? 0),
              y = offsetY + (node.y ?? 0);
            const content = nodeById.get(node.id);
            if (node.id === 'system-boundary') {
              graph.addNode({
                id: node.id,
                x,
                y,
                width: node.width ?? 1,
                height: node.height ?? 1,
                zIndex: 0,
                shape: 'rect',
                attrs: {
                  body: {
                    fill: colors.surface.paper,
                    stroke: colors.border.interactive,
                    rx: 8,
                    ry: 8,
                  },
                  label: {
                    text: labels.get('system-boundary') ?? '',
                    refX: 12,
                    refY: 12,
                    textVerticalAnchor: 'top',
                    textAnchor: 'start',
                    fontSize: foundations.type.label.size,
                    fill: colors.text.secondary,
                    fontFamily: foundations.font.ui,
                  },
                },
              });
            } else if (content) {
              const actor = content.kind === 'actor';
              graph.addNode({
                id: node.id,
                x,
                y,
                width: node.width ?? 1,
                height: node.height ?? 1,
                zIndex: 2,
                shape: content.kind === 'use_case' ? 'ellipse' : 'rect',
                ...(actor
                  ? {
                      markup: [
                        { tagName: 'circle', selector: 'head' },
                        { tagName: 'path', selector: 'body' },
                        { tagName: 'text', selector: 'label' },
                      ],
                    }
                  : {}),
                data: { nodeKind: content.kind },
                attrs: {
                  head: {
                    cx: 60,
                    cy: 10,
                    r: 7,
                    fill: 'none',
                    stroke: colors.text.secondary,
                    strokeWidth: 1.4,
                  },
                  body: actor
                    ? {
                        d: 'M60 17V40M42 27H78M60 40L46 56M60 40L74 56',
                        fill: 'none',
                        stroke: colors.text.secondary,
                        strokeWidth: 1.4,
                      }
                    : { fill: colors.accent.soft, stroke: colors.border.interactive, rx: 8, ry: 8 },
                  label: {
                    text: labels.get(node.id),
                    fontFamily: foundations.font.ui,
                    fontSize: foundations.type.ui.size,
                    lineHeight: foundations.type.ui.lineHeight,
                    fill: colors.text.primary,
                    ...(actor ? { refY: 68, textVerticalAnchor: 'top' } : {}),
                  },
                },
              });
            }
            walk(node, x, y);
          }
          for (const edge of parent.edges ?? []) {
            const content = edgeById.get(edge.id);
            for (const [index, section] of (edge.sections ?? []).entries()) {
              const terminal = (id: string) => ({
                cell: id,
                selector: 'body',
                anchor: { name: 'orth' },
                connectionPoint: { name: 'boundary', args: { selector: 'body', sticky: true } },
              });
              graph.addEdge({
                id: `${edge.id}:section:${index}`,
                zIndex: 1,
                source:
                  content && index === 0
                    ? terminal(content.source)
                    : { x: offsetX + section.startPoint.x, y: offsetY + section.startPoint.y },
                target:
                  content && index === (edge.sections?.length ?? 1) - 1
                    ? terminal(content.target)
                    : { x: offsetX + section.endPoint.x, y: offsetY + section.endPoint.y },
                vertices: section.bendPoints?.map((point) => ({
                  x: offsetX + point.x,
                  y: offsetY + point.y,
                })),
                router: { name: 'orth' },
                connector: { name: 'rounded', args: { radius: 6 } },
                attrs: {
                  line: {
                    stroke: colors.border.strong,
                    strokeWidth: 1.2,
                    strokeDasharray: content?.kind === 'kind-of' ? '5 3' : '',
                    targetMarker:
                      content?.kind === 'participation'
                        ? null
                        : {
                            name: 'block',
                            width: 7,
                            height: 7,
                            fill:
                              content?.kind === 'kind-of'
                                ? colors.surface.paper
                                : colors.border.strong,
                          },
                  },
                },
              });
            }
            for (const [index, text] of (edge.labels ?? []).entries())
              graph.addNode({
                id: `label:${edge.id}:${index}`,
                x: offsetX + (text.x ?? 0),
                y: offsetY + (text.y ?? 0),
                width: text.width ?? 1,
                height: text.height ?? 1,
                shape: 'rect',
                zIndex: 3,
                data: { nodeKind: 'edge-label' },
                attrs: {
                  body: { fill: colors.surface.page, stroke: 'none', rx: 3, ry: 3 },
                  label: {
                    text: text.text ?? '',
                    fill: colors.text.secondary,
                    fontSize: foundations.type.edgeLabel.size,
                    fontFamily: foundations.font.ui,
                  },
                },
              });
          }
        };
        walk(result);
        dimensions = { width: result.width ?? 1, height: result.height ?? 1 };
        fit();
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (alive) {
          console.error('综述图布局失败', error);
          setMessage(error instanceof Error ? error.message : '图形布局失败');
          setStatus('error');
        }
      });
    return () => {
      alive = false;
      observer.disconnect();
      graph.dispose();
      if (drawing.current === graph) drawing.current = null;
      lease.release();
    };
  }, [model, attempt]);

  useEffect(() => {
    const graph = drawing.current;
    if (!graph) return;
    const colors = resolveThemeTokens(mode).color;
    for (const node of graph.getNodes()) {
      const kind = node.getData<{ nodeKind?: string }>()?.nodeKind;
      node.attr(
        'label/fill',
        kind === 'edge-label' || node.id === 'system-boundary'
          ? colors.text.secondary
          : colors.text.primary,
      );
      if (kind === 'actor') {
        node.attr('body/stroke', colors.text.secondary);
        node.attr('head/stroke', colors.text.secondary);
      } else {
        node.attr(
          'body/fill',
          kind === 'edge-label'
            ? colors.surface.page
            : node.id === 'system-boundary'
              ? colors.surface.paper
              : colors.accent.soft,
        );
        node.attr('body/stroke', kind === 'edge-label' ? 'none' : colors.border.interactive);
      }
    }
    for (const edge of graph.getEdges()) {
      edge.attr('line/stroke', colors.border.strong);
      const marker = edge.attr('line/targetMarker');
      if (marker && typeof marker === 'object')
        edge.attr('line/targetMarker', {
          ...marker,
          fill: edge.attr('line/strokeDasharray') ? colors.surface.paper : colors.border.strong,
        });
    }
  }, [mode]);

  return (
    <figure className="overview-diagram" aria-label={label}>
      {status === 'loading' && (
        <div className="diagram-loading" role="status">
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
        </div>
      )}
      <div
        ref={host}
        className="overview-diagram-canvas"
        role="img"
        aria-label={label}
        data-ready={status === 'ready'}
        aria-busy={status === 'loading'}
      />
      {status === 'error' && (
        <Alert
          type="error"
          title="图暂时无法展示"
          description={message}
          action={<Button onClick={() => setAttempt((value) => value + 1)}>重新绘制</Button>}
        />
      )}
    </figure>
  );
}
