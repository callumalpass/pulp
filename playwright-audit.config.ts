import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'ui-ux-perf-audit-run.spec.ts',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5190',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'cd packages/server && node --import tsx/esm src/index.ts',
      url: 'http://localhost:3000/health',
      reuseExistingServer: true,
    },
    {
      command: 'cd packages/web && npx vite --host --port 5190',
      url: 'http://localhost:5190',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
