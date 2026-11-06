import { readFile } from 'node:fs/promises';
import { readAppearance } from '../src/web/design-system/appearance.ts';
import { themes } from '../src/web/design-system/tokens.ts';

export function designThemePlugin({ preview = false } = {}) {
  const key = preview ? themes.preferences.previewKey : themes.preferences.applicationKey;
  const colors = Object.fromEntries(
    Object.entries(themes.modes).map(([mode, value]) => [
      mode,
      {
        page: value.color.surface.page,
        text: value.color.text.primary,
      },
    ]),
  );
  const bootstrap = `<script>(()=>{const preference=(${readAppearance.toString()})(${JSON.stringify(key)});const mode=preference==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):preference;const colors=${JSON.stringify(colors)};const root=document.documentElement;root.dataset.theme=mode;root.style.colorScheme=mode;root.style.setProperty('--ds-color-surface-page',colors[mode].page);root.style.setProperty('--ds-color-text-primary',colors[mode].text);root.style.background='var(--ds-color-surface-page)';root.style.color='var(--ds-color-text-primary)';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[mode].page);})();</script>`;
  return {
    name: 'coseed-design-theme',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'OFL-Patrick-Hand.txt',
        source: await readFile(
          new URL('../src/web/design-system/fonts/OFL.txt', import.meta.url),
          'utf8',
        ),
      });
    },
    transformIndexHtml(html) {
      return html.replace('<!-- coseed-theme-bootstrap -->', bootstrap);
    },
  };
}
