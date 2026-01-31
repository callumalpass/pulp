import { test, expect, type Page } from '@playwright/test';

/**
 * Comprehensive UI/UX and Performance Audit
 *
 * This spec captures screenshots across viewports/themes and collects
 * performance metrics to identify areas for improvement.
 */

const SCREENSHOT_DIR = 'e2e/screenshots/comprehensive-audit';

async function waitForLibrary(page: Page) {
  // Wait for the library grid or list to be visible (books loaded)
  await page.waitForSelector('[data-testid="book-card"], .library-list-row', {
    timeout: 30_000,
  });
  // Give images and animations a moment to settle
  await page.waitForTimeout(500);
}

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '');
    if (t === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    }
  }, theme);
  await page.waitForTimeout(200);
}

// ─── Desktop Screenshots ────────────────────────────────────────────────────

test.describe('Desktop Dark Theme Audit', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('capture full library page', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-dark-full.png`,
      fullPage: true,
    });
  });

  test('capture above-the-fold', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-dark-fold.png`,
    });
  });

  test('capture hover states on book card', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    const card = page.locator('[data-testid="book-card"]').first();
    await card.hover();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-dark-card-hover.png`,
    });
  });

  test('capture search active state', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    const search = page.locator('input[type="search"]');
    await search.click();
    await search.fill('test');
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-dark-search.png`,
    });
  });

  test('capture list view', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    // Click the list view button
    const listBtn = page.locator('button[aria-label="List view"]');
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-dark-list.png`,
    });
  });

  test('capture filter states', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    // Click PDF filter
    const pdfFilter = page.locator('button[aria-pressed="false"]', { hasText: 'PDF' });
    if (await pdfFilter.isVisible()) {
      await pdfFilter.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-dark-filtered.png`,
    });
  });
});

test.describe('Desktop Light Theme Audit', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('capture full library page', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await setTheme(page, 'light');
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-light-full.png`,
      fullPage: true,
    });
  });

  test('capture above-the-fold', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await setTheme(page, 'light');
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-light-fold.png`,
    });
  });

  test('capture hover states', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await setTheme(page, 'light');
    const card = page.locator('[data-testid="book-card"]').first();
    await card.hover();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-light-card-hover.png`,
    });
  });

  test('capture list view', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await setTheme(page, 'light');
    const listBtn = page.locator('button[aria-label="List view"]');
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-light-list.png`,
    });
  });
});

// ─── Mobile Screenshots ─────────────────────────────────────────────────────

test.describe('Mobile Dark Theme Audit', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test('capture full library page', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/mobile-dark-full.png`,
      fullPage: true,
    });
  });

  test('capture above-the-fold', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/mobile-dark-fold.png`,
    });
  });

  test('capture filters panel', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    const filtersBtn = page.locator('button', { hasText: 'Filters' });
    if (await filtersBtn.isVisible()) {
      await filtersBtn.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/mobile-dark-filters.png`,
    });
  });

  test('capture scrolled state', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/mobile-dark-scrolled.png`,
    });
  });
});

test.describe('Mobile Light Theme Audit', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test('capture full library page', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await setTheme(page, 'light');
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/mobile-light-full.png`,
      fullPage: true,
    });
  });

  test('capture above-the-fold', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await setTheme(page, 'light');
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/mobile-light-fold.png`,
    });
  });
});

// ─── Performance Metrics ─────────────────────────────────────────────────────

test.describe('Performance Audit', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('measure initial load performance', async ({ page }) => {
    // Enable performance observer before navigation
    await page.goto('/');
    await waitForLibrary(page);

    // Collect Web Vitals
    const metrics = await page.evaluate(() => {
      return new Promise<Record<string, number>>((resolve) => {
        const results: Record<string, number> = {};

        // Navigation timing
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (nav) {
          results.dnsLookup = nav.domainLookupEnd - nav.domainLookupStart;
          results.tcpConnect = nav.connectEnd - nav.connectStart;
          results.ttfb = nav.responseStart - nav.requestStart;
          results.domContentLoaded = nav.domContentLoadedEventEnd - nav.fetchStart;
          results.domComplete = nav.domComplete - nav.fetchStart;
          results.loadEvent = nav.loadEventEnd - nav.fetchStart;
          results.transferSize = nav.transferSize;
        }

        // Paint timing
        const paints = performance.getEntriesByType('paint');
        for (const p of paints) {
          if (p.name === 'first-paint') results.firstPaint = p.startTime;
          if (p.name === 'first-contentful-paint') results.fcp = p.startTime;
        }

        // Resource summary
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        results.totalResources = resources.length;
        results.totalTransferSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

        // JS resources
        const jsResources = resources.filter(r => r.initiatorType === 'script' || r.name.endsWith('.js'));
        results.jsResourceCount = jsResources.length;
        results.jsTotalSize = jsResources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

        // CSS resources
        const cssResources = resources.filter(r => r.initiatorType === 'css' || r.name.endsWith('.css'));
        results.cssResourceCount = cssResources.length;
        results.cssTotalSize = cssResources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

        // Image resources
        const imgResources = resources.filter(r => r.initiatorType === 'img');
        results.imgResourceCount = imgResources.length;
        results.imgTotalSize = imgResources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

        // DOM size
        results.domNodeCount = document.querySelectorAll('*').length;

        resolve(results);
      });
    });

    console.log('\n=== PERFORMANCE METRICS ===');
    console.log(JSON.stringify(metrics, null, 2));

    // Assert reasonable thresholds
    if (metrics.fcp) {
      console.log(`FCP: ${metrics.fcp.toFixed(0)}ms`);
    }
    if (metrics.domContentLoaded) {
      console.log(`DOM Content Loaded: ${metrics.domContentLoaded.toFixed(0)}ms`);
    }
    if (metrics.domNodeCount) {
      console.log(`DOM Node Count: ${metrics.domNodeCount}`);
    }
    console.log(`Total Resources: ${metrics.totalResources}`);
    console.log(`Total Transfer Size: ${(metrics.totalTransferSize / 1024).toFixed(0)}KB`);
    console.log(`JS Bundle Size: ${(metrics.jsTotalSize / 1024).toFixed(0)}KB (${metrics.jsResourceCount} files)`);
    console.log(`CSS Size: ${(metrics.cssTotalSize / 1024).toFixed(0)}KB`);
    console.log(`Images: ${metrics.imgResourceCount} images, ${(metrics.imgTotalSize / 1024).toFixed(0)}KB`);
    console.log('===========================\n');
  });

  test('measure layout shift (CLS)', async ({ page }) => {
    // Observe layout shifts during page load
    const clsPromise = page.evaluateHandle(() => {
      return new Promise<number>((resolve) => {
        let cls = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cls += (entry as any).value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });

        // Wait for page to settle, then report
        setTimeout(() => {
          observer.disconnect();
          resolve(cls);
        }, 5000);
      });
    });

    await page.goto('/');
    await waitForLibrary(page);
    await page.waitForTimeout(3000);

    const cls = await (await clsPromise).jsonValue();
    console.log(`\nCumulative Layout Shift (CLS): ${(cls as number).toFixed(4)}`);

    // CLS should ideally be under 0.1 (good), warn above 0.25 (poor)
    expect(cls as number).toBeLessThan(0.5);
  });

  test('measure interaction responsiveness', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    // Measure filter click responsiveness
    const filterStart = Date.now();
    const pdfFilter = page.locator('button[aria-pressed="false"]', { hasText: 'PDF' });
    if (await pdfFilter.isVisible()) {
      await pdfFilter.click();
      // Wait for UI to update
      await page.waitForTimeout(100);
    }
    const filterTime = Date.now() - filterStart;

    // Measure search responsiveness
    const searchStart = Date.now();
    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill('test query');
    await page.waitForTimeout(400); // Account for debounce
    const searchTime = Date.now() - searchStart;

    console.log(`\n=== INTERACTION METRICS ===`);
    console.log(`Filter click response: ${filterTime}ms`);
    console.log(`Search input + debounce: ${searchTime}ms`);
    console.log(`===========================\n`);
  });

  test('audit font loading', async ({ page }) => {
    const fontMetrics = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const fonts = resources.filter(r =>
        r.name.includes('font') || r.name.endsWith('.woff2') || r.name.endsWith('.woff')
      );
      return fonts.map(f => ({
        name: f.name.split('/').pop(),
        size: f.transferSize,
        duration: f.duration,
      }));
    });

    // Navigate first
    await page.goto('/');
    await waitForLibrary(page);

    const fontResults = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const fonts = resources.filter(r =>
        r.name.includes('font') || r.name.endsWith('.woff2') || r.name.endsWith('.woff')
      );
      return fonts.map(f => ({
        name: f.name.split('/').pop(),
        size: f.transferSize,
        duration: Math.round(f.duration),
      }));
    });

    console.log('\n=== FONT LOADING ===');
    fontResults.forEach(f => {
      console.log(`  ${f.name}: ${(f.size / 1024).toFixed(1)}KB, ${f.duration}ms`);
    });
    console.log(`Total fonts: ${fontResults.length}`);
    console.log(`Total font size: ${(fontResults.reduce((s, f) => s + f.size, 0) / 1024).toFixed(1)}KB`);
    console.log('====================\n');
  });
});

// ─── Accessibility Quick Checks ──────────────────────────────────────────────

test.describe('Accessibility Audit', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('check focus visibility on tab navigation', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    // Tab through the page and capture focus states
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/desktop-focus-states.png`,
    });
  });

  test('check contrast and text readability', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    // Get all text elements with their computed colors and backgrounds
    const contrastIssues = await page.evaluate(() => {
      const issues: Array<{
        element: string;
        text: string;
        color: string;
        bgColor: string;
        fontSize: string;
      }> = [];

      // Helper to get luminance from rgb
      function getLuminance(r: number, g: number, b: number): number {
        const [rs, gs, bs] = [r, g, b].map((c) => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function parseRgb(color: string): [number, number, number] | null {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return null;
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      }

      function getContrastRatio(l1: number, l2: number): number {
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      const textElements = document.querySelectorAll('h1, h2, h3, h4, p, span, a, button, label, input');
      textElements.forEach((el) => {
        const style = getComputedStyle(el);
        const text = el.textContent?.trim().slice(0, 30);
        if (!text) return;

        const fg = parseRgb(style.color);
        const bg = parseRgb(style.backgroundColor);

        if (fg && bg) {
          const fgL = getLuminance(...fg);
          const bgL = getLuminance(...bg);
          const ratio = getContrastRatio(fgL, bgL);
          const fontSize = parseFloat(style.fontSize);

          // WCAG AA: 4.5:1 for normal text, 3:1 for large text (18px+)
          const minRatio = fontSize >= 18 ? 3 : 4.5;

          if (ratio < minRatio) {
            issues.push({
              element: el.tagName.toLowerCase(),
              text: text,
              color: style.color,
              bgColor: style.backgroundColor,
              fontSize: style.fontSize,
            });
          }
        }
      });

      return issues;
    });

    if (contrastIssues.length > 0) {
      console.log('\n=== CONTRAST ISSUES ===');
      contrastIssues.forEach((issue) => {
        console.log(`  [${issue.element}] "${issue.text}" - color: ${issue.color}, bg: ${issue.bgColor}, size: ${issue.fontSize}`);
      });
      console.log(`Total issues: ${contrastIssues.length}`);
      console.log('======================\n');
    } else {
      console.log('\nNo contrast issues found.\n');
    }
  });

  test('check touch target sizes', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const smallTargets = await page.evaluate(() => {
      const issues: Array<{
        element: string;
        label: string;
        width: number;
        height: number;
      }> = [];

      const interactiveElements = document.querySelectorAll('button, a, input, select, [role="button"]');
      interactiveElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (rect.width < 44 || rect.height < 44) {
            const label = (el as HTMLElement).getAttribute('aria-label') ||
              (el as HTMLElement).textContent?.trim().slice(0, 30) ||
              el.tagName;
            issues.push({
              element: el.tagName.toLowerCase(),
              label,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            });
          }
        }
      });

      return issues;
    });

    console.log('\n=== SMALL TOUCH TARGETS (<44px) ===');
    if (smallTargets.length > 0) {
      smallTargets.forEach((t) => {
        console.log(`  [${t.element}] "${t.label}" - ${t.width}x${t.height}px`);
      });
      console.log(`Total: ${smallTargets.length}`);
    } else {
      console.log('  All targets meet 44px minimum.');
    }
    console.log('==================================\n');
  });

  test('check missing ARIA labels', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const missingLabels = await page.evaluate(() => {
      const issues: string[] = [];

      // Check buttons without accessible names
      document.querySelectorAll('button').forEach((btn) => {
        const hasLabel = btn.getAttribute('aria-label') ||
          btn.getAttribute('aria-labelledby') ||
          btn.textContent?.trim();
        if (!hasLabel) {
          issues.push(`button: ${btn.outerHTML.slice(0, 100)}`);
        }
      });

      // Check images without alt text
      document.querySelectorAll('img').forEach((img) => {
        if (!img.alt && !img.getAttribute('aria-hidden')) {
          issues.push(`img without alt: ${img.src.split('/').pop()}`);
        }
      });

      // Check inputs without labels
      document.querySelectorAll('input, select').forEach((input) => {
        const hasLabel = input.getAttribute('aria-label') ||
          input.getAttribute('aria-labelledby') ||
          document.querySelector(`label[for="${input.id}"]`);
        if (!hasLabel) {
          issues.push(`input without label: ${(input as HTMLElement).outerHTML.slice(0, 100)}`);
        }
      });

      return issues;
    });

    console.log('\n=== MISSING ARIA LABELS ===');
    if (missingLabels.length > 0) {
      missingLabels.forEach((issue) => console.log(`  ${issue}`));
      console.log(`Total: ${missingLabels.length}`);
    } else {
      console.log('  All interactive elements have accessible names.');
    }
    console.log('===========================\n');
  });
});

// ─── CSS / Layout Issues ─────────────────────────────────────────────────────

test.describe('Layout Issues Audit', () => {
  test('check for horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    // Check at different viewport sizes
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      if (hasOverflow) {
        console.log(`Horizontal overflow detected at ${width}px`);
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/overflow-${width}px.png`,
        });
      }
    }
  });

  test('check z-index stacking', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const zIndexIssues = await page.evaluate(() => {
      const elements: Array<{ selector: string; zIndex: string; position: string }> = [];
      document.querySelectorAll('*').forEach((el) => {
        const style = getComputedStyle(el);
        const zIndex = style.zIndex;
        if (zIndex !== 'auto' && parseInt(zIndex) > 10) {
          elements.push({
            selector: el.tagName.toLowerCase() + (el.className ? `.${el.className.toString().split(' ')[0]}` : ''),
            zIndex,
            position: style.position,
          });
        }
      });
      return elements;
    });

    console.log('\n=== HIGH Z-INDEX ELEMENTS ===');
    zIndexIssues.forEach((el) => {
      console.log(`  ${el.selector}: z-index=${el.zIndex}, position=${el.position}`);
    });
    console.log('=============================\n');
  });
});
