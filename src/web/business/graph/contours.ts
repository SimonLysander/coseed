import { union, difference, type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { Box } from './layout.js';
export function rectangle(box: Box, padding = 0): Polygon {
  const x = box.x - padding,
    y = box.y - padding,
    right = box.x + box.width + padding,
    bottom = box.y + box.height + padding;
  return [
    [
      [x, y],
      [right, y],
      [right, bottom],
      [x, bottom],
      [x, y],
    ],
  ];
}
export function scopeContour(members: Box[], excluded: Box[]): MultiPolygon {
  if (!members.length) throw new Error('技术说明没有有效成员。');
  const shapes = members.map((box) => rectangle(box, 6));
  const combined = union(shapes[0]!, ...shapes.slice(1));
  return excluded.length
    ? difference(combined, ...excluded.map((box) => rectangle(box, 1)))
    : combined;
}
export const polygonPath = (polygons: MultiPolygon) =>
  polygons
    .flatMap((polygon) =>
      polygon.map((ring) => `M ${ring.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`),
    )
    .join(' ');
