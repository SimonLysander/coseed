import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/design',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    channel: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run design:preview',
    env: { COSEED_DESIGN_PORT: '4178' },
    url: 'http://127.0.0.1:4178/',
    reuseExistingServer: false,
  },
});
