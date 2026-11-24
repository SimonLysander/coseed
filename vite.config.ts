import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { designThemePlugin } from './scripts/design-theme-plugin.mjs';

const developmentServiceOrigin = `http://127.0.0.1:${process.env.COSEED_PORT ?? '4310'}`;

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  plugins: [designThemePlugin(), react()],
  define: {
    'import.meta.env.COSEED_DEV_SERVICE_ORIGIN': JSON.stringify(
      command === 'serve' ? developmentServiceOrigin : null,
    ),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/agent-writing-guide.md': { target: developmentServiceOrigin, changeOrigin: true },
      '/api': { target: developmentServiceOrigin },
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/web', import.meta.url)),
    emptyOutDir: true,
    license: { fileName: 'dependency-licenses.md' },
  },
}));
