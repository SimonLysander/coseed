import { expect, type Locator } from '@playwright/test';

export async function expectNavigationAlignment(
  rows: Locator,
  { count, height, rail = false }: { count: number; height: number; rail?: boolean },
) {
  await expect(rows).toHaveCount(count);
  const measurements = await rows.evaluateAll((elements) =>
    elements.map((row) => {
      const icon = row.querySelector('svg');
      const wrapper = row.querySelector('.ds-icon');
      const label = row.lastElementChild;
      if (!icon || !wrapper || !label) throw new Error('导航项缺少图标或文字');
      const range = document.createRange();
      range.selectNodeContents(label);
      return {
        row: row.getBoundingClientRect().toJSON(),
        icon: icon.getBoundingClientRect().toJSON(),
        wrapper: wrapper.getBoundingClientRect().toJSON(),
        label: label.getBoundingClientRect().toJSON(),
        text: range.getBoundingClientRect().toJSON(),
      };
    }),
  );
  const first = measurements[0];
  if (!first) throw new Error('导航为空');
  for (const [index, item] of measurements.entries()) {
    expect(item.row.height).toBe(height);
    expect(item.icon.height).toBe(18);
    expect(item.wrapper.height).toBe(item.icon.height);
    expect(item.icon.y + item.icon.height / 2).toBeCloseTo(item.row.y + height / 2, 1);
    expect(item.icon.x).toBe(first.icon.x);
    if (rail) {
      expect(item.icon.x + item.icon.width / 2).toBeCloseTo(item.row.x + item.row.width / 2, 1);
    } else {
      expect(item.label.x).toBe(first.label.x);
      expect(item.text.x).toBeCloseTo(item.label.x, 1);
      expect(item.label.y + item.label.height / 2).toBeCloseTo(item.row.y + height / 2, 1);
    }
    if (index > 0) {
      expect(item.row.y - measurements[index - 1]!.row.bottom).toBe(4);
    }
  }
}
