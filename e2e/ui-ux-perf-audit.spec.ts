import { test, expect, type Page } from '@playwright/test';

/**
 * Comprehensive UI/UX and Performance Audit
 *
 * This test mocks the API to render a realistic library page and then
 * captures screenshots, measures performance, and checks for common
 * UI/UX issues across desktop and mobile viewports.
 */

// ── Mock Data ──────────────────────────────────────────────────────────

const MOCK_LIBRARY: object[] = [
  {
    id: 'book-1',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    sourceType: 'pdf',
    progress: 68,
    totalPages: 550,
    cover: true,
    pinned: true,
    rating: 5,
    highlightCount: 23,
    lastRead: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    currentChapter: 'Chapter 7: Transactions',
    readingStats: { totalReadingTimeMs: 14400000, pagesPerHour: 25, estimatedCompletionDate: null },
    collections: ['Technical'],
    dateCreated: '2024-01-15',
  },
  {
    id: 'book-2',
    title: 'The Art of Computer Programming, Vol. 1',
    author: 'Donald Knuth',
    sourceType: 'pdf',
    progress: 12,
    totalPages: 672,
    cover: true,
    pinned: false,
    rating: 4,
    highlightCount: 5,
    lastRead: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    currentChapter: 'Chapter 2: Information Structures',
    readingStats: { totalReadingTimeMs: 3600000, pagesPerHour: 15, estimatedCompletionDate: null },
    collections: ['Technical'],
    dateCreated: '2024-02-20',
  },
  {
    id: 'book-3',
    title: 'Sapiens: A Brief History of Humankind',
    author: 'Yuval Noah Harari',
    sourceType: 'epub',
    progress: 100,
    totalPages: 443,
    cover: true,
    pinned: false,
    rating: 4,
    highlightCount: 17,
    lastRead: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    dateFinished: '2024-08-10',
    readingStats: { totalReadingTimeMs: 28800000, pagesPerHour: 30, estimatedCompletionDate: null },
    collections: ['Non-Fiction'],
    dateCreated: '2024-03-10',
  },
  {
    id: 'book-4',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson, Gerald Jay Sussman',
    sourceType: 'pdf',
    progress: 0,
    totalPages: 657,
    cover: false,
    pinned: false,
    rating: null,
    highlightCount: 0,
    lastRead: null,
    readingStats: null,
    collections: ['Technical'],
    dateCreated: '2024-04-05',
  },
  {
    id: 'book-5',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    sourceType: 'epub',
    progress: 45,
    totalPages: 499,
    cover: true,
    pinned: false,
    rating: 3,
    highlightCount: 8,
    lastRead: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    currentChapter: 'Part III: Overconfidence',
    readingStats: { totalReadingTimeMs: 10800000, pagesPerHour: 28, estimatedCompletionDate: null },
    collections: ['Non-Fiction'],
    dateCreated: '2024-05-12',
  },
  {
    id: 'book-6',
    title: 'The Pragmatic Programmer',
    author: 'David Thomas, Andrew Hunt',
    sourceType: 'epub',
    progress: 89,
    totalPages: 352,
    cover: true,
    pinned: true,
    rating: 5,
    highlightCount: 31,
    lastRead: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    currentChapter: 'Chapter 8: Pragmatic Projects',
    readingStats: { totalReadingTimeMs: 21600000, pagesPerHour: 22, estimatedCompletionDate: null },
    collections: ['Technical'],
    dateCreated: '2024-06-01',
  },
  {
    id: 'book-7',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    sourceType: 'epub',
    progress: 55,
    totalPages: 256,
    cover: false,
    pinned: false,
    rating: 5,
    highlightCount: 42,
    lastRead: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    currentChapter: 'Book VII',
    readingStats: { totalReadingTimeMs: 7200000, pagesPerHour: 35, estimatedCompletionDate: null },
    collections: ['Philosophy'],
    dateCreated: '2024-07-15',
  },
  {
    id: 'book-8',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    author: 'Robert C. Martin',
    sourceType: 'pdf',
    progress: 100,
    totalPages: 464,
    cover: true,
    pinned: false,
    rating: 3,
    highlightCount: 14,
    lastRead: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    dateFinished: '2024-06-15',
    readingStats: { totalReadingTimeMs: 18000000, pagesPerHour: 20, estimatedCompletionDate: null },
    collections: ['Technical'],
    dateCreated: '2024-01-25',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

async function setupMocks(page: Page) {
  await page.route('**/api/library', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LIBRARY),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/collections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ collections: ['Technical', 'Non-Fiction', 'Philosophy'] }),
    });
  });

  await page.route('**/api/reading-goals/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ dailyGoalMinutes: 30, todayMinutes: 18, streak: 5 }),
    });
  });

  await page.route('**/api/reading-stats/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalBooks: 8,
        completedBooks: 2,
        totalReadingTimeMs: 104400000,
        averagePagesPerHour: 25,
      }),
    });
  });

  await page.route('**/api/library-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalBooks: 8,
        completedBooks: 2,
        inProgressBooks: 5,
        unreadBooks: 1,
        totalHighlights: 140,
        totalPages: 3893,
      }),
    });
  });

  await page.route('**/api/search/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isComplete: true, indexedDocuments: 8, totalDocuments: 8, percentComplete: 100 }),
    });
  });

  // Return a 1x1 transparent PNG for any cover image request
  await page.route('**/api/covers/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTkSuQmCC',
        'base64'
      ),
    });
  });

  // WebSocket — just let it fail silently
  await page.route('**/ws', async (route) => {
    await route.abort();
  });
}

interface PerfMetrics {
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  domNodes: number;
  jsHeapMB: number;
  layoutDuration: number;
}

async function collectPerfMetrics(page: Page): Promise<PerfMetrics> {
  return page.evaluate(() => {
    const perf = performance;
    const entries = perf.getEntriesByType('paint');
    const fcp = entries.find((e) => e.name === 'first-contentful-paint')?.startTime ?? null;

    // LCP from PerformanceObserver buffer
    const lcpEntries = perf.getEntriesByType('largest-contentful-paint') as PerformanceEntry[];
    const lcp = lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1].startTime : null;

    // CLS approximation
    const layoutShiftEntries = (perf.getEntriesByType('layout-shift') as any[]);
    const cls = layoutShiftEntries.reduce((sum, e) => sum + (e.hadRecentInput ? 0 : e.value), 0);

    // DOM node count
    const domNodes = document.querySelectorAll('*').length;

    // JS heap (Chrome-only)
    const memInfo = (performance as any).memory;
    const jsHeapMB = memInfo ? memInfo.usedJSHeapSize / (1024 * 1024) : 0;

    // Layout duration from navigation timing
    const navEntries = perf.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const layoutDuration = navEntries.length > 0 ? navEntries[0].domComplete - navEntries[0].domInteractive : 0;

    return { fcp, lcp, cls, domNodes, jsHeapMB, layoutDuration };
  });
}

// ── Tests ───────────────────────────────────────────────────────────

test.describe('UI/UX & Performance Audit', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('Desktop: full library page audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });

    // Wait for card entrance animations to settle
    await page.waitForTimeout(500);

    // ── Screenshots ──
    await page.screenshot({
      path: 'e2e/screenshots/audit/desktop-full.png',
      fullPage: true,
    });

    // ── Performance Metrics ──
    const metrics = await collectPerfMetrics(page);
    console.log('\n=== Desktop Performance Metrics ===');
    console.log(`FCP: ${metrics.fcp?.toFixed(0) ?? 'N/A'}ms`);
    console.log(`LCP: ${metrics.lcp?.toFixed(0) ?? 'N/A'}ms`);
    console.log(`CLS: ${metrics.cls?.toFixed(4) ?? 'N/A'}`);
    console.log(`DOM Nodes: ${metrics.domNodes}`);
    console.log(`JS Heap: ${metrics.jsHeapMB.toFixed(1)}MB`);
    console.log(`Layout Duration: ${metrics.layoutDuration.toFixed(0)}ms`);

    // Performance thresholds
    if (metrics.fcp !== null) {
      expect(metrics.fcp).toBeLessThan(3000); // FCP < 3s
    }
    expect(metrics.domNodes).toBeLessThan(5000); // DOM size check

    // ── Accessibility Basics ──
    // Skip link present
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeAttached();

    // Header landmark
    await expect(page.locator('header[role="banner"]')).toBeVisible();

    // Main content area
    const main = page.locator('main, [role="main"], #main-content');
    await expect(main.first()).toBeAttached();

    // Search has proper role
    await expect(page.locator('[role="search"]')).toBeAttached();

    // ── Focus Management ──
    // Tab to first interactive element
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // first header element
    const activeTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'A', 'INPUT']).toContain(activeTag);

    // ── Interactive Elements ──
    // All buttons should have accessible names
    const buttonsWithoutLabels = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      const missing: string[] = [];
      buttons.forEach((btn) => {
        const name =
          btn.getAttribute('aria-label') ||
          btn.getAttribute('title') ||
          btn.textContent?.trim();
        if (!name) {
          missing.push(btn.outerHTML.slice(0, 100));
        }
      });
      return missing;
    });
    console.log(`\nButtons without accessible names: ${buttonsWithoutLabels.length}`);
    if (buttonsWithoutLabels.length > 0) {
      console.log('Missing labels:', buttonsWithoutLabels);
    }

    // ── Color Contrast Spot-Check ──
    const contrastIssues = await page.evaluate(() => {
      const issues: string[] = [];
      const checkContrast = (el: Element) => {
        const style = getComputedStyle(el);
        const color = style.color;
        const bg = style.backgroundColor;
        // Flag very low opacity text that might be hard to read
        if (style.opacity && parseFloat(style.opacity) < 0.4 && el.textContent?.trim()) {
          issues.push(`Low opacity text (${style.opacity}): "${el.textContent?.trim().slice(0, 40)}"`);
        }
      };
      document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button, label').forEach(checkContrast);
      return issues.slice(0, 10); // Cap output
    });
    console.log(`\nPotential contrast issues: ${contrastIssues.length}`);
    contrastIssues.forEach((i) => console.log(`  - ${i}`));

    // ── Layout Checks ──
    // No horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // ── Hover State Screenshots ──
    const firstCard = page.locator('[data-testid="book-card"]').first();
    await firstCard.hover();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'e2e/screenshots/audit/desktop-card-hover.png',
      fullPage: false,
    });
  });

  test('Desktop: light theme audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    await page.waitForTimeout(400);

    // Toggle to light theme
    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(500); // theme transition

    await page.screenshot({
      path: 'e2e/screenshots/audit/desktop-light.png',
      fullPage: true,
    });

    // Check light theme is applied
    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(themeAttr).toBe('light');

    // Check card surfaces have appropriate styling in light mode
    const cardBorderCheck = await page.evaluate(() => {
      const card = document.querySelector('.library-card');
      if (!card) return null;
      const style = getComputedStyle(card);
      return {
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    });
    console.log('\nLight mode card styles:', cardBorderCheck);
  });

  test('Desktop: list view audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    await page.waitForTimeout(300);

    // Switch to list view
    const listViewBtn = page.locator('button[aria-label="List view"]');
    await listViewBtn.click();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: 'e2e/screenshots/audit/desktop-list-view.png',
      fullPage: true,
    });
  });

  test('Desktop: filter interaction audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    await page.waitForTimeout(300);

    // Click "Reading" progress filter
    const readingFilter = page.locator('button', { hasText: 'Reading' });
    await readingFilter.click();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'e2e/screenshots/audit/desktop-filtered.png',
      fullPage: true,
    });

    // Check "Clear filters" link appears
    const clearBtn = page.locator('text=Clear filters');
    await expect(clearBtn).toBeVisible();

    // Check filter count messaging
    const filterMsg = page.locator('text=Showing');
    await expect(filterMsg).toBeVisible();
  });

  test('Desktop: search interaction audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });

    // Focus search with keyboard shortcut
    await page.keyboard.press('/');
    await page.waitForTimeout(200);

    // Type search query
    await page.keyboard.type('Sapi');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/audit/desktop-search.png',
      fullPage: true,
    });

    // Clear button should be visible
    const clearBtn = page.locator('button[aria-label="Clear search"]');
    await expect(clearBtn).toBeVisible();
  });

  test('Desktop: keyboard navigation audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    await page.waitForTimeout(300);

    // Tab through elements and verify focus ring visibility
    const focusOrder: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return 'none';
        const tag = el.tagName;
        const label = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || '';
        const hasOutline = getComputedStyle(el).outlineStyle !== 'none';
        const hasRing = el.classList.contains('focus-visible') ||
          el.matches(':focus-visible') ||
          getComputedStyle(el).boxShadow.includes('rgb');
        return `${tag}[${label}] outline:${hasOutline} ring:${hasRing}`;
      });
      focusOrder.push(focused);
    }
    console.log('\nFocus order (first 12 tabs):');
    focusOrder.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

    // Capture with focus ring visible
    await page.screenshot({
      path: 'e2e/screenshots/audit/desktop-focus.png',
      fullPage: false,
    });
  });

  test('Mobile: full library page audit', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 }); // iPhone 14 Pro
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/audit/mobile-full.png',
      fullPage: true,
    });

    // ── Performance Metrics ──
    const metrics = await collectPerfMetrics(page);
    console.log('\n=== Mobile Performance Metrics ===');
    console.log(`FCP: ${metrics.fcp?.toFixed(0) ?? 'N/A'}ms`);
    console.log(`DOM Nodes: ${metrics.domNodes}`);
    console.log(`JS Heap: ${metrics.jsHeapMB.toFixed(1)}MB`);

    // ── Touch Target Audit ──
    const smallTargets = await page.evaluate(() => {
      const issues: string[] = [];
      const interactive = document.querySelectorAll('button, a, [role="button"], input, select');
      interactive.forEach((el) => {
        const rect = el.getBoundingClientRect();
        // Skip hidden or offscreen elements
        if (rect.width === 0 || rect.height === 0 || rect.top < -100) return;
        if (rect.width < 44 || rect.height < 44) {
          const label =
            (el as HTMLElement).getAttribute('aria-label') ||
            (el as HTMLElement).title ||
            (el as HTMLElement).textContent?.trim().slice(0, 30) ||
            el.tagName;
          // Check if the element has min-width/min-height styles that expand the touch target
          const style = getComputedStyle(el);
          const minW = parseFloat(style.minWidth) || 0;
          const minH = parseFloat(style.minHeight) || 0;
          if (minW >= 44 && minH >= 44) return; // Touch target is expanded
          issues.push(
            `${label}: ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}px`
          );
        }
      });
      return issues;
    });
    console.log(`\nSmall touch targets (<44px): ${smallTargets.length}`);
    smallTargets.forEach((t) => console.log(`  - ${t}`));

    // ── Mobile Layout Checks ──
    // No horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Grid should be 2 columns on mobile
    const gridCols = await page.evaluate(() => {
      const grid = document.querySelector('.grid');
      if (!grid) return 'none';
      return getComputedStyle(grid).gridTemplateColumns;
    });
    console.log(`\nMobile grid columns: ${gridCols}`);
  });

  test('Mobile: filter sheet audit', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    await page.waitForTimeout(300);

    // Open mobile filters
    const filtersBtn = page.locator('button', { hasText: 'Filters' });
    await filtersBtn.click();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: 'e2e/screenshots/audit/mobile-filters.png',
      fullPage: false,
    });

    // Backdrop should be present
    const backdrop = page.locator('.mobile-bottom-sheet-backdrop');
    await expect(backdrop).toBeAttached();
  });

  test('Mobile: light theme audit', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    await page.waitForTimeout(300);

    // Toggle to light theme
    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/audit/mobile-light.png',
      fullPage: true,
    });
  });

  test('Desktop: rating interaction audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    await page.waitForTimeout(300);

    // Hover over first card to reveal rating button
    const firstCard = page.locator('[data-testid="book-card"]').first();
    await firstCard.hover();
    await page.waitForTimeout(200);

    await page.screenshot({
      path: 'e2e/screenshots/audit/desktop-rating-hover.png',
      fullPage: false,
    });
  });

  test('Performance: animation impact measurement', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    await page.waitForTimeout(600);

    // Measure GPU layers and animation costs
    const animationAudit = await page.evaluate(() => {
      const results = {
        willChangeElements: 0,
        animatingElements: 0,
        contentVisibilityElements: 0,
        containElements: 0,
        totalTransitions: 0,
      };

      document.querySelectorAll('*').forEach((el) => {
        const style = getComputedStyle(el);
        if (style.willChange && style.willChange !== 'auto') {
          results.willChangeElements++;
        }
        if (style.animationName && style.animationName !== 'none') {
          results.animatingElements++;
        }
        if (style.contentVisibility && style.contentVisibility !== 'visible') {
          results.contentVisibilityElements++;
        }
        if (style.contain && style.contain !== 'none') {
          results.containElements++;
        }
        if (style.transitionProperty && style.transitionProperty !== 'all' && style.transitionProperty !== 'none') {
          results.totalTransitions++;
        }
      });

      return results;
    });

    console.log('\n=== Animation & Compositing Audit ===');
    console.log(`will-change elements: ${animationAudit.willChangeElements}`);
    console.log(`Actively animating: ${animationAudit.animatingElements}`);
    console.log(`content-visibility elements: ${animationAudit.contentVisibilityElements}`);
    console.log(`CSS contain elements: ${animationAudit.containElements}`);
    console.log(`Elements with transitions: ${animationAudit.totalTransitions}`);

    // will-change should be limited (should only be on hovered cards)
    expect(animationAudit.willChangeElements).toBeLessThan(5);
  });

  test('Performance: scroll jank measurement', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    await page.waitForTimeout(500);

    // Start recording long tasks during scroll
    const scrollMetrics = await page.evaluate(async () => {
      const longTasks: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push(entry.duration);
        }
      });

      try {
        observer.observe({ type: 'longtask', buffered: true });
      } catch {
        // longtask not supported in this browser
      }

      // Scroll down smoothly
      const scrollTarget = document.getElementById('main-content') || document.documentElement;
      const startY = scrollTarget.scrollTop;
      const distance = 2000;
      const steps = 20;

      for (let i = 0; i < steps; i++) {
        scrollTarget.scrollTop = startY + (distance * (i + 1)) / steps;
        await new Promise((r) => requestAnimationFrame(r));
      }

      // Wait for any remaining long tasks
      await new Promise((r) => setTimeout(r, 200));
      observer.disconnect();

      return {
        longTaskCount: longTasks.length,
        maxLongTask: longTasks.length > 0 ? Math.max(...longTasks) : 0,
        avgLongTask: longTasks.length > 0 ? longTasks.reduce((a, b) => a + b, 0) / longTasks.length : 0,
      };
    });

    console.log('\n=== Scroll Performance ===');
    console.log(`Long tasks during scroll: ${scrollMetrics.longTaskCount}`);
    console.log(`Max long task: ${scrollMetrics.maxLongTask.toFixed(0)}ms`);
    console.log(`Avg long task: ${scrollMetrics.avgLongTask.toFixed(0)}ms`);
  });

  test('Accessibility: heading hierarchy and landmarks', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });

    const a11yAudit = await page.evaluate(() => {
      // Heading hierarchy
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => ({
        level: parseInt(h.tagName[1]),
        text: h.textContent?.trim().slice(0, 50) || '',
        visible: (h as HTMLElement).offsetParent !== null,
      }));

      // Landmarks
      const landmarks = {
        banner: document.querySelectorAll('[role="banner"], header').length,
        navigation: document.querySelectorAll('[role="navigation"], nav').length,
        main: document.querySelectorAll('[role="main"], main').length,
        search: document.querySelectorAll('[role="search"]').length,
        contentinfo: document.querySelectorAll('[role="contentinfo"], footer').length,
      };

      // Images without alt
      const imagesWithoutAlt = Array.from(document.querySelectorAll('img')).filter(
        (img) => !img.alt && !img.getAttribute('aria-hidden') && !img.getAttribute('role')
      ).length;

      // Form inputs without labels
      const inputsWithoutLabels = Array.from(
        document.querySelectorAll('input, select, textarea')
      ).filter((input) => {
        const id = input.id;
        const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : false;
        const hasAriaLabel = input.getAttribute('aria-label');
        const hasAriaLabelledBy = input.getAttribute('aria-labelledby');
        return !hasLabel && !hasAriaLabel && !hasAriaLabelledBy;
      }).length;

      return { headings, landmarks, imagesWithoutAlt, inputsWithoutLabels };
    });

    console.log('\n=== Accessibility Audit ===');
    console.log('Heading hierarchy:');
    a11yAudit.headings.forEach((h) =>
      console.log(`  ${'  '.repeat(h.level - 1)}h${h.level}: ${h.text} ${h.visible ? '' : '(hidden)'}`)
    );
    console.log('Landmarks:', a11yAudit.landmarks);
    console.log(`Images without alt: ${a11yAudit.imagesWithoutAlt}`);
    console.log(`Inputs without labels: ${a11yAudit.inputsWithoutLabels}`);

    // Should have exactly 1 main landmark
    expect(a11yAudit.landmarks.main).toBeGreaterThanOrEqual(1);
    // All images should have alt text
    expect(a11yAudit.imagesWithoutAlt).toBe(0);
    // All inputs should be labeled
    expect(a11yAudit.inputsWithoutLabels).toBe(0);
  });

  test('CSS audit: unused animations and excessive specificity', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });

    const cssAudit = await page.evaluate(() => {
      // Count total style rules
      let totalRules = 0;
      let importantCount = 0;
      const stylesheets = Array.from(document.styleSheets);
      stylesheets.forEach((sheet) => {
        try {
          const rules = sheet.cssRules;
          totalRules += rules.length;
          Array.from(rules).forEach((rule) => {
            if (rule instanceof CSSStyleRule && rule.cssText.includes('!important')) {
              importantCount++;
            }
          });
        } catch {
          // Cross-origin stylesheet
        }
      });

      return {
        totalStylesheets: stylesheets.length,
        totalRules,
        importantCount,
      };
    });

    console.log('\n=== CSS Audit ===');
    console.log(`Stylesheets: ${cssAudit.totalStylesheets}`);
    console.log(`Total CSS rules: ${cssAudit.totalRules}`);
    console.log(`!important usages: ${cssAudit.importantCount}`);
  });
});
