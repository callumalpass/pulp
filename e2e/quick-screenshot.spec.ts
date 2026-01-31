import { test } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173' });

test('quick screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'e2e/screenshots/live-audit/quick-check.png', fullPage: true });

  // Dump HTML structure
  const html = await page.evaluate(() => document.body.innerHTML.slice(0, 5000));
  console.log('Page HTML (first 5000 chars):\n', html);
});
