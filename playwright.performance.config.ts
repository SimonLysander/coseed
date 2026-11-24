import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  testDir: './tests/performance',
  workers: 1,
  timeout: 180_000,
  retries: 0,
  outputDir: 'test-results/performance',
  use: { ...base.use, headless: false, viewport: { width: 1440, height: 1000 }, trace: 'off' },
});
