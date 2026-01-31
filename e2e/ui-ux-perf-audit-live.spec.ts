import { test, expect, Page } from '@playwright/test';

/**
 * Live UI/UX & Performance Audit
 * Runs against the actual running Pulp app on port 5173.
 */

test.use({ baseURL: 'http://localhost:5177' });

const SCREENSHOT_DIR = 'e2e/screenshots/live-audit';

/** Navigate and wait for the library page to be ready */
async function gotoLibrary(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Wait for either the library grid or the loading skeleton to appear
  await page.waitForSelector(
    '[data-testid="library-grid"], [data-testid="book-card"], .library-card, .skeleton, main, [role="list"]',
    { timeout: 15000 },
  );
  // Give animations and data loading a moment
  await page.waitForTimeout(1500);
}

test.describe('Live UI/UX Audit', () => {
  test('01 - Desktop default state (dark)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLibrary(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-desktop-dark.png`, fullPage: true });
  });

  test('02 - Desktop light theme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLibrary(page);

    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-desktop-light.png`, fullPage: true });
  });

  test('03 - Card hover state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLibrary(page);

    const firstCard = page.locator('[data-testid="book-card"], a[href^="/read/"]').first();
    if (await firstCard.isVisible({ timeout: 5000 })) {
      await firstCard.hover();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-card-hover.png`, fullPage: true });
  });

  test('04 - List view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLibrary(page);

    const listToggle = page.locator('button[aria-label="List view"]');
    if (await listToggle.isVisible()) {
      await listToggle.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-list-view.png`, fullPage: true });
  });

  test('05 - Search interaction', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLibrary(page);

    const searchInput = page.locator('input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.click();
      await searchInput.fill('the');
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-search.png`, fullPage: true });
  });

  test('06 - Filter by PDF', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLibrary(page);

    const pdfFilter = page.locator('button:has-text("PDF")').first();
    if (await pdfFilter.isVisible()) {
      await pdfFilter.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-filtered-pdf.png`, fullPage: true });
  });

  test('07 - Mobile view (dark)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLibrary(page);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-mobile-dark.png`, fullPage: true });
  });

  test('08 - Mobile light theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLibrary(page);

    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/08-mobile-light.png`, fullPage: true });
  });

  test('09 - Mobile filters open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLibrary(page);

    const filterBtn = page.locator('button:has-text("Filters")').first();
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-mobile-filters.png`, fullPage: true });
  });

  test('10 - Focus/keyboard navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLibrary(page);

    // Tab through several elements to see focus states
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-focus-states.png`, fullPage: true });
  });
});

test.describe('Performance Audit', () => {
  test('Library page load performance', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const startTime = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(
      '[data-testid="library-grid"], [data-testid="book-card"], .library-card, .skeleton, main',
      { timeout: 15000 },
    );
    const loadTime = Date.now() - startTime;

    await page.waitForTimeout(2000);

    // Collect Web Vitals
    const metrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const nav = entries[0];
      return {
        domContentLoaded: nav?.domContentLoadedEventEnd - nav?.startTime,
        loadComplete: nav?.loadEventEnd - nav?.startTime,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime ?? null,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
        resourceCount: performance.getEntriesByType('resource').length,
        totalResourceSize: performance.getEntriesByType('resource')
          .reduce((acc, r: any) => acc + (r.transferSize || 0), 0),
      };
    });

    // Measure CLS
    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let cumulative = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cumulative += (entry as any).value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => { observer.disconnect(); resolve(cumulative); }, 2000);
      });
    });

    // Measure DOM complexity
    const domMetrics = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const maxDepth = Array.from(allElements).reduce((max, el) => {
        let depth = 0;
        let parent = el.parentElement;
        while (parent) { depth++; parent = parent.parentElement; }
        return Math.max(max, depth);
      }, 0);

      return {
        totalElements: allElements.length,
        maxDepth,
        images: document.querySelectorAll('img').length,
        buttons: document.querySelectorAll('button').length,
        svgs: document.querySelectorAll('svg').length,
      };
    });

    console.log('\n========== PERFORMANCE REPORT ==========');
    console.log(`Load Time (total): ${loadTime}ms`);
    console.log(`DOM Content Loaded: ${metrics.domContentLoaded?.toFixed(0)}ms`);
    console.log(`Load Complete: ${metrics.loadComplete?.toFixed(0)}ms`);
    console.log(`First Paint: ${metrics.firstPaint?.toFixed(0) ?? 'N/A'}ms`);
    console.log(`First Contentful Paint: ${metrics.firstContentfulPaint?.toFixed(0) ?? 'N/A'}ms`);
    console.log(`Cumulative Layout Shift: ${cls.toFixed(4)}`);
    console.log(`Resources: ${metrics.resourceCount} (${(metrics.totalResourceSize / 1024).toFixed(0)} KB)`);
    console.log(`DOM Elements: ${domMetrics.totalElements}`);
    console.log(`Max DOM Depth: ${domMetrics.maxDepth}`);
    console.log(`Images: ${domMetrics.images}`);
    console.log(`Buttons: ${domMetrics.buttons}`);
    console.log(`SVGs: ${domMetrics.svgs}`);
    console.log('=========================================\n');

    expect(cls).toBeLessThan(0.25);
  });

  test('Accessibility audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLibrary(page);

    const a11y = await page.evaluate(() => {
      const results: { issue: string; severity: string; element?: string }[] = [];

      // Check images alt text
      document.querySelectorAll('img').forEach((img) => {
        if (!img.getAttribute('alt')) {
          results.push({
            issue: 'Image missing alt text',
            severity: 'error',
            element: img.src.slice(-60),
          });
        }
      });

      // Check buttons without labels
      document.querySelectorAll('button').forEach((btn) => {
        const hasLabel = btn.getAttribute('aria-label') ||
          btn.getAttribute('aria-labelledby') ||
          btn.textContent?.trim();
        if (!hasLabel) {
          results.push({
            issue: 'Button missing accessible label',
            severity: 'error',
            element: btn.outerHTML.slice(0, 100),
          });
        }
      });

      // Check links without text
      document.querySelectorAll('a').forEach((link) => {
        const hasLabel = link.getAttribute('aria-label') ||
          link.textContent?.trim() ||
          link.querySelector('img[alt]');
        if (!hasLabel) {
          results.push({
            issue: 'Link missing accessible text',
            severity: 'error',
            element: link.href,
          });
        }
      });

      // Check heading hierarchy
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      let prevLevel = 0;
      headings.forEach((h) => {
        const level = parseInt(h.tagName[1]);
        if (prevLevel > 0 && level > prevLevel + 1) {
          results.push({
            issue: `Heading skip: H${prevLevel} to H${level}`,
            severity: 'warning',
            element: h.textContent?.slice(0, 50) ?? '',
          });
        }
        prevLevel = level;
      });

      // Check form inputs for labels
      document.querySelectorAll('input, select, textarea').forEach((input) => {
        const hasLabel = input.getAttribute('aria-label') ||
          input.getAttribute('aria-labelledby') ||
          document.querySelector(`label[for="${input.id}"]`);
        if (!hasLabel) {
          results.push({
            issue: 'Form input missing label',
            severity: 'warning',
            element: `${input.tagName.toLowerCase()}[type="${input.getAttribute('type')}"]`,
          });
        }
      });

      // Check touch target sizes
      const touchTargets: { element: string; width: number; height: number }[] = [];
      document.querySelectorAll('button, a, input').forEach((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          touchTargets.push({
            element: `${el.tagName}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : el.textContent?.trim() ? `[${el.textContent.trim().slice(0, 20)}]` : ''}`,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      });

      return {
        issues: results,
        touchTargetIssues: touchTargets,
        h1Count: document.querySelectorAll('h1').length,
        hasSkipLink: !!document.querySelector('.skip-link, a[href="#main-content"]'),
        hasLandmarks: {
          banner: !!document.querySelector('[role="banner"], header'),
          main: !!document.querySelector('[role="main"], main'),
          navigation: !!document.querySelector('[role="navigation"], nav'),
          search: !!document.querySelector('[role="search"]'),
        },
      };
    });

    console.log('\n========== ACCESSIBILITY REPORT ==========');
    console.log(`H1 count: ${a11y.h1Count}`);
    console.log(`Skip link: ${a11y.hasSkipLink ? 'Yes' : 'MISSING'}`);
    console.log(`Landmarks: banner=${a11y.hasLandmarks.banner}, main=${a11y.hasLandmarks.main}, nav=${a11y.hasLandmarks.navigation}, search=${a11y.hasLandmarks.search}`);
    console.log(`\nIssues (${a11y.issues.length}):`);
    a11y.issues.forEach((issue) => {
      console.log(`  [${issue.severity}] ${issue.issue}${issue.element ? ` - ${issue.element}` : ''}`);
    });
    console.log(`\nTouch target issues (${a11y.touchTargetIssues.length}):`);
    a11y.touchTargetIssues.slice(0, 15).forEach((t) => {
      console.log(`  ${t.element}: ${t.width}x${t.height}px (needs 44x44)`);
    });
    if (a11y.touchTargetIssues.length > 15) {
      console.log(`  ... and ${a11y.touchTargetIssues.length - 15} more`);
    }
    console.log('==========================================\n');
  });

  test('CSS and rendering analysis', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoLibrary(page);

    const analysis = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      let totalRules = 0;
      sheets.forEach((sheet) => {
        try { totalRules += sheet.cssRules?.length ?? 0; } catch { /* cross-origin */ }
      });

      const allElements = document.querySelectorAll('*');
      let boxShadowCount = 0;
      let filterCount = 0;
      let animationCount = 0;
      let willChangeCount = 0;

      allElements.forEach((el) => {
        const style = getComputedStyle(el);
        if (style.boxShadow !== 'none') boxShadowCount++;
        if (style.filter !== 'none') filterCount++;
        if (style.animationName !== 'none') animationCount++;
        if (style.willChange !== 'auto') willChangeCount++;
      });

      return {
        totalRules, sheetsCount: sheets.length,
        boxShadowCount, filterCount, animationCount, willChangeCount,
      };
    });

    console.log('\n========== CSS ANALYSIS ==========');
    console.log(`Stylesheets: ${analysis.sheetsCount}`);
    console.log(`Total CSS rules: ${analysis.totalRules}`);
    console.log(`Elements with box-shadow: ${analysis.boxShadowCount}`);
    console.log(`Elements with filter: ${analysis.filterCount}`);
    console.log(`Active animations: ${analysis.animationCount}`);
    console.log(`will-change (non-auto): ${analysis.willChangeCount}`);
    console.log('==================================\n');
  });
});
