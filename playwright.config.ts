import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: [
    {
      command: 'cd packages/server && node --import tsx/esm src/index.ts',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'cd packages/web && npx vite --host --port 5175',
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
