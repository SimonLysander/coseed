import foundations from './tokens.json' with { type: 'json' };
import themes from './themes.json' with { type: 'json' };

export { foundations, themes };
export type ColorMode = 'light' | 'dark';

export function resolveThemeTokens(mode: ColorMode) {
  const palette = themes.modes[mode];
  return {
    ...foundations,
    color: palette.color,
    shape: { ...foundations.shape, ...palette.shape },
  };
}

export function cssVariables(value: object): Record<string, string> {
  const variables: Record<string, string> = {};
  function visit(current: object, path: string[]) {
    for (const [key, child] of Object.entries(current)) {
      const next = [...path, key];
      if (child && typeof child === 'object' && !Array.isArray(child)) visit(child, next);
      else if (!Array.isArray(child)) variables[`--ds-${next.join('-')}`] = String(child);
    }
  }
  visit(value, []);
  return variables;
}

export function installTheme(mode: ColorMode) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(cssVariables(resolveThemeTokens(mode)))) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', themes.modes[mode].color.surface.page);
}
