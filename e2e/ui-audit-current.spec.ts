import { test, expect, Page } from '@playwright/test';

test.setTimeout(60000);

async function waitForApp(page: Page) {
  await page.goto('/');
  // Wait for the heading to appear (indicates React has rendered)
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible({ timeout: 15000 });
  // Give images/covers a moment to load
  await page.waitForTimeout(1500);
}

test.describe('UI/UX Audit', () => {

  test('desktop dark theme - full page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApp(page);
    await page.screenshot({ path: 'e2e/screenshots/audit-session/01-desktop-dark.png', fullPage: true });
  });

  test('desktop light theme - full page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApp(page);
    await page.getByTestId('theme-toggle').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/screenshots/audit-session/02-desktop-light.png', fullPage: true });
  });

  test('card hover state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApp(page);

    const firstCard = page.locator('[data-testid="book-card"]').first();
    await firstCard.hover();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'e2e/screenshots/audit-session/03-card-hover.png', fullPage: false });
  });

  test('list view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApp(page);

    const listViewBtn = page.getByRole('button', { name: 'List view' });
    await listViewBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'e2e/screenshots/audit-session/04-list-view.png', fullPage: true });
  });

  test('search active', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApp(page);

    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill('the');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit-session/05-search.png', fullPage: false });
  });

  test('filter applied - PDF', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApp(page);

    await page.getByRole('button', { name: 'PDF' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'e2e/screenshots/audit-session/06-filtered.png', fullPage: true });
  });

  test('mobile dark theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForApp(page);
    await page.screenshot({ path: 'e2e/screenshots/audit-session/07-mobile-dark.png', fullPage: true });
  });

  test('mobile light theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForApp(page);
    await page.getByTestId('theme-toggle').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/screenshots/audit-session/08-mobile-light.png', fullPage: true });
  });

  test('mobile filters open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForApp(page);

    const filtersBtn = page.getByRole('button', { name: /Filters/ });
    await filtersBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'e2e/screenshots/audit-session/09-mobile-filters.png', fullPage: false });
  });

  test('performance metrics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const metrics: Record<string, number> = {};

    const startTime = Date.now();
    await waitForApp(page);
    metrics['time_to_interactive'] = Date.now() - startTime;

    // Measure layout shifts
    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 2000);
      });
    });
    metrics['cumulative_layout_shift'] = cls;

    // DOM node count
    const nodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
    metrics['dom_node_count'] = nodeCount;

    // LCP
    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            resolve(entries[entries.length - 1].startTime);
          }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(0);
        }, 3000);
      });
    });
    metrics['largest_contentful_paint'] = lcp;

    // FPS
    const fpsMetric = await page.evaluate(async () => {
      const frames: number[] = [];
      let lastTime = 0;
      const measure = (time: number) => {
        if (lastTime) frames.push(time - lastTime);
        lastTime = time;
        if (frames.length < 60) requestAnimationFrame(measure);
      };
      requestAnimationFrame(measure);
      await new Promise((r) => setTimeout(r, 1200));
      const avgFrameTime = frames.reduce((a, b) => a + b, 0) / frames.length;
      return Math.round(1000 / avgFrameTime);
    });
    metrics['estimated_fps'] = fpsMetric;

    console.log('\n=== PERFORMANCE METRICS ===');
    console.log(JSON.stringify(metrics, null, 2));
    console.log('===========================\n');

    await page.screenshot({ path: 'e2e/screenshots/audit-session/10-performance.png', fullPage: false });
  });

  test('focus and keyboard navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApp(page);

    // Tab to focus states
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.screenshot({ path: 'e2e/screenshots/audit-session/11-focus-states.png', fullPage: false });
  });

  test('empty filter state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApp(page);

    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill('xyznonexistent');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit-session/12-empty-filter.png', fullPage: false });
  });
});
