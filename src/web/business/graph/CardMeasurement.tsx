import { memo, useEffect, useRef } from 'react';
import { BusinessCard, type CardData } from './Card.js';
import type { Size } from './layout.js';

export type Cards = ReadonlyMap<string, { data: CardData; width: number }>;
export interface Measurement {
  cards: Cards;
  sizes: Map<string, Size>;
}

// Keep measurement DOM only until the real font and card dimensions are known.
// Memoization also prevents zoom readouts from re-rendering hundreds of measurement cards.
export const CardMeasurement = memo(function CardMeasurement({
  cards,
  attempt,
  onMeasured,
  onError,
}: {
  cards: Cards;
  attempt: number;
  onMeasured: (value: Measurement) => void;
  onError: (error: unknown) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    void document.fonts.ready
      .then(() => {
        if (!alive) return;
        const start = performance.now();
        const sizes = new Map<string, Size>();
        for (const wrapper of host.current!.querySelectorAll<HTMLElement>('[data-measure-id]')) {
          const box = wrapper.firstElementChild?.getBoundingClientRect();
          if (!box || box.width <= 0 || box.height <= 0)
            throw new Error('未能测量完整的图卡片尺寸。');
          sizes.set(wrapper.dataset.measureId!, {
            width: Math.ceil(box.width),
            height: Math.ceil(box.height),
          });
        }
        if (sizes.size !== cards.size) throw new Error('图卡片测量结果不完整。');
        performance.clearMeasures('coseed.business.measurement');
        performance.measure('coseed.business.measurement', { start, end: performance.now() });
        onMeasured({ cards, sizes });
      })
      .catch((error) => {
        if (alive) onError(error);
      });
    return () => {
      alive = false;
    };
  }, [cards, attempt, onMeasured, onError]);
  return (
    <div ref={host} className="business-measurement" aria-hidden="true">
      {[...cards].map(([id, card]) => (
        <div key={id} data-measure-id={id} style={{ width: card.width }}>
          <BusinessCard data={card.data} />
        </div>
      ))}
    </div>
  );
});
