import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveThemeTokens } from '../src/web/design-system/tokens.ts';
import { designThemePlugin } from './design-theme-plugin.mjs';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('src/web/design-system/tokens.json', root), 'utf8');
const tokens = JSON.parse(source);
const themeSource = await readFile(new URL('src/web/design-system/themes.json', root), 'utf8');
const themes = JSON.parse(themeSource);
function luminance(hex) {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Expected opaque sRGB color, got ${hex}`);
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return rgb
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}
const pairs = [];
function reviewColors(colors, mode) {
  const add = (name, foreground, background, minimum) => {
    const [darker, lighter] = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    pairs.push({
      name: `${mode}/${name}`,
      foreground,
      background,
      minimum,
      ratio,
      pass: ratio >= minimum,
    });
  };
  for (const foreground of ['primary', 'secondary', 'muted', 'link']) {
    for (const background of ['page', 'paper', 'sidebar', 'hover'])
      add(
        `text.${foreground}/surface.${background}`,
        colors.text[foreground],
        colors.surface[background],
        4.5,
      );
    add(`text.${foreground}/accent.soft`, colors.text[foreground], colors.accent.soft, 4.5);
  }
  for (const [name, state] of Object.entries(colors.state))
    add(`state.${name}`, state.foreground, state.background, 4.5);
  for (const [name, value] of Object.entries(colors.graph)) {
    if (value && typeof value === 'object') {
      add(`graph.${name}.text`, colors.text.primary, value.background, 4.5);
      add(`graph.${name}.border`, value.border, value.background, 3);
      add(`graph.${name}.edge`, colors.graph.edge, value.background, 3);
    }
  }
  for (const name of ['solid', 'hover', 'pressed'])
    add(`accent.${name}`, colors.text.onAccent, colors.accent[name], 4.5);
  for (const name of ['interactive', 'focus']) {
    for (const background of ['paper', 'page', 'sidebar', 'hover'])
      add(`border.${name}/${background}`, colors.border[name], colors.surface[background], 3);
  }
  for (const [name, color] of Object.entries(colors.code)) {
    add(`code.${name}`, color, colors.surface.paper, 4.5);
    add(`code.${name}/data`, color, colors.graph.data.background, 4.5);
    add(`code.${name}/external`, color, colors.graph.external.background, 4.5);
  }
  add('disabled (product readability target)', colors.text.disabled, colors.surface.disabled, 3);
  add('edge label', colors.text.primary, colors.graph.labelBackground, 4.5);
}
for (const mode of Object.keys(themes.modes)) reviewColors(resolveThemeTokens(mode).color, mode);
const failed = pairs.filter((pair) => !pair.pass);
if (failed.length)
  throw new Error(`Design contrast checks failed:\n${JSON.stringify(failed, null, 2)}`);
const outDir = fileURLToPath(new URL('.coseed/design-system-preview', root));
await build({
  configFile: false,
  root: fileURLToPath(new URL('docs/ui/design-system-preview', root)),
  base: './',
  plugins: [designThemePlugin({ preview: true }), react()],
  build: { outDir, emptyOutDir: true },
});
await writeFile(
  `${outDir}/review.json`,
  `${JSON.stringify(
    {
      designVersion: tokens.version,
      tokensSha256: createHash('sha256').update(source).digest('hex'),
      themesSha256: createHash('sha256').update(themeSource).digest('hex'),
      palette: 'pine-green',
      modes: Object.keys(themes.modes),
      scope:
        'Color pair calculations only; not full WCAG certification or graph performance testing.',
      pairs,
    },
    null,
    2,
  )}\n`,
);
console.info(
  `Design contrast pairs: ${pairs.length} passed. Shared with the application design system.`,
);
if (process.argv.includes('--serve')) {
  const port = Number(process.env.COSEED_DESIGN_PORT ?? '4177');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('COSEED_DESIGN_PORT must be a valid TCP port');
  const server = await preview({
    configFile: false,
    root: fileURLToPath(new URL('docs/ui/design-system-preview', root)),
    base: './',
    build: { outDir },
    preview: { host: '127.0.0.1', port, strictPort: true },
  });
  server.printUrls();
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => server.httpServer.close(() => process.exit(0)));
}
