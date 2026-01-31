import { test, expect, Page } from '@playwright/test';

// Mock data matching the app's LiteratureNoteSummary interface
const NOW = Date.now();
const HOUR = 3600000;
const DAY = 86400000;

const mockLibrary = [
  {
    id: 'book-1',
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    sourceType: 'pdf',
    path: '/books/design-things.pdf',
    progress: 73,
    totalPages: 368,
    currentPage: 269,
    currentChapter: 'Chapter 5: Human Error? No, Bad Design',
    lastRead: new Date(NOW - HOUR * 2).toISOString(),
    dateCreated: new Date(NOW - DAY * 30).toISOString(),
    cover: null,
    rating: 5,
    pinned: true,
    highlightCount: 12,
    readingStats: {
      totalReadingTimeMs: 18000000,
      totalPagesRead: 269,
      pagesPerHour: 14.9,
      lastSessionDate: new Date(NOW - HOUR * 2).toISOString(),
      sessionsCount: 15,
      estimatedCompletionDate: null,
    },
  },
  {
    id: 'book-2',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    sourceType: 'pdf',
    path: '/books/thinking.pdf',
    progress: 45,
    totalPages: 499,
    currentPage: 225,
    currentChapter: null,
    lastRead: new Date(NOW - HOUR * 6).toISOString(),
    dateCreated: new Date(NOW - DAY * 45).toISOString(),
    cover: null,
    rating: 4,
    pinned: false,
    highlightCount: 8,
    readingStats: {
      totalReadingTimeMs: 14400000,
      totalPagesRead: 225,
      pagesPerHour: 11.2,
      lastSessionDate: new Date(NOW - HOUR * 6).toISOString(),
      sessionsCount: 12,
      estimatedCompletionDate: null,
    },
  },
  {
    id: 'book-3',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    author: 'Robert C. Martin',
    sourceType: 'pdf',
    path: '/books/clean-code.pdf',
    progress: 100,
    totalPages: 464,
    currentPage: 464,
    currentChapter: null,
    lastRead: new Date(NOW - DAY * 7).toISOString(),
    dateCreated: new Date(NOW - DAY * 90).toISOString(),
    dateFinished: new Date(NOW - DAY * 7).toISOString(),
    cover: null,
    rating: 5,
    pinned: false,
    highlightCount: 24,
    readingStats: {
      totalReadingTimeMs: 28800000,
      totalPagesRead: 464,
      pagesPerHour: 16.1,
      lastSessionDate: new Date(NOW - DAY * 7).toISOString(),
      sessionsCount: 20,
      estimatedCompletionDate: null,
    },
  },
  {
    id: 'book-4',
    title: 'The Pragmatic Programmer',
    author: 'David Thomas, Andrew Hunt',
    sourceType: 'epub',
    path: '/books/pragmatic.epub',
    progress: 15,
    totalPages: 352,
    currentPage: 53,
    currentChapter: 'A Pragmatic Philosophy',
    lastRead: new Date(NOW - DAY * 2).toISOString(),
    dateCreated: new Date(NOW - DAY * 14).toISOString(),
    cover: null,
    rating: 0,
    pinned: false,
    highlightCount: 2,
    readingStats: {
      totalReadingTimeMs: 3600000,
      totalPagesRead: 53,
      pagesPerHour: 14.7,
      lastSessionDate: new Date(NOW - DAY * 2).toISOString(),
      sessionsCount: 3,
      estimatedCompletionDate: null,
    },
  },
  {
    id: 'book-5',
    title: 'Refactoring: Improving the Design of Existing Code',
    author: 'Martin Fowler',
    sourceType: 'pdf',
    path: '/books/refactoring.pdf',
    progress: 0,
    totalPages: 448,
    currentPage: 0,
    currentChapter: null,
    lastRead: null,
    dateCreated: new Date(NOW - DAY * 3).toISOString(),
    cover: null,
    rating: 0,
    pinned: false,
    highlightCount: 0,
    readingStats: null,
  },
  {
    id: 'book-6',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson, Gerald Jay Sussman',
    sourceType: 'pdf',
    path: '/books/sicp.pdf',
    progress: 28,
    totalPages: 657,
    currentPage: 184,
    currentChapter: 'Building Abstractions with Procedures',
    lastRead: new Date(NOW - DAY * 5).toISOString(),
    dateCreated: new Date(NOW - DAY * 60).toISOString(),
    cover: null,
    rating: 5,
    pinned: true,
    highlightCount: 15,
    readingStats: {
      totalReadingTimeMs: 10800000,
      totalPagesRead: 184,
      pagesPerHour: 10.2,
      lastSessionDate: new Date(NOW - DAY * 5).toISOString(),
      sessionsCount: 8,
      estimatedCompletionDate: null,
    },
  },
];

const mockLibraryStats = {
  totalBooks: mockLibrary.length,
  totalPagesRead: 1195,
  booksCompleted: 1,
  booksInProgress: 4,
  totalReadingTime: 75600000,
  averageReadingSpeed: 0.95,
  currentStreak: 5,
  longestStreak: 12,
};

async function setupMocks(page: Page) {
  await page.route('**/api/library', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLibrary),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/library-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockLibraryStats),
    });
  });

  await page.route('**/api/collections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ collections: ['Programming', 'Design', 'Philosophy'] }),
    });
  });

  await page.route('**/api/reading-stats/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.route('**/api/covers/**', async (route) => {
    await route.fulfill({ status: 404 });
  });

  await page.route('**/api/search/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isComplete: true, indexedDocuments: 6, totalDocuments: 6, percentComplete: 100 }),
    });
  });
}

async function waitForLibrary(page: Page) {
  await page.waitForSelector('[data-testid="book-card"], [data-testid="library-grid"]', { timeout: 15000 });
  await page.waitForTimeout(600);
}

// ============================================================
// AUDIT TESTS
// ============================================================

test.describe('UI/UX and Performance Audit', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  // ----------------------------------------------------------
  // 1. Desktop Dark Theme — Full Page
  // ----------------------------------------------------------
  test('01 - Desktop dark theme full page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    await page.screenshot({
      path: 'e2e/screenshots/audit/01-desktop-dark.png',
      fullPage: true,
    });

    // Verify basic structure
    const cards = page.locator('[data-testid="book-card"]');
    const cardCount = await cards.count();
    console.log(`[Audit] Desktop dark: ${cardCount} book cards rendered`);
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  // ----------------------------------------------------------
  // 2. Desktop Light Theme — Full Page
  // ----------------------------------------------------------
  test('02 - Desktop light theme full page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    // Toggle to light theme
    const themeBtn = page.locator('button[aria-label*="theme" i], button[aria-label*="light" i], button[aria-label*="dark" i]').first();
    if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeBtn.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit/02-desktop-light.png',
      fullPage: true,
    });

    // Check light theme applied
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    console.log(`[Audit] Theme after toggle: ${theme}`);
  });

  // ----------------------------------------------------------
  // 3. Card Hover State & Interactive Elements
  // ----------------------------------------------------------
  test('03 - Card hover states', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const firstCard = page.locator('[data-testid="book-card"]').first();
    await firstCard.hover();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: 'e2e/screenshots/audit/03-card-hover.png',
      fullPage: false,
    });

    // Check hover reveals action buttons
    const pinBtn = firstCard.locator('button[aria-label="Pin"], button[aria-label="Unpin"]');
    const infoBtn = firstCard.locator('button[aria-label="Show metadata"]');
    const pinVisible = await pinBtn.isVisible().catch(() => false);
    const infoVisible = await infoBtn.isVisible().catch(() => false);
    console.log(`[Audit] Hover reveals: pin=${pinVisible}, info=${infoVisible}`);
  });

  // ----------------------------------------------------------
  // 4. List View
  // ----------------------------------------------------------
  test('04 - List view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const listBtn = page.locator('button[aria-label*="list" i]').first();
    if (await listBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await listBtn.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit/04-list-view.png',
      fullPage: true,
    });
  });

  // ----------------------------------------------------------
  // 5. Mobile Dark Theme
  // ----------------------------------------------------------
  test('05 - Mobile dark theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForLibrary(page);

    await page.screenshot({
      path: 'e2e/screenshots/audit/05-mobile-dark.png',
      fullPage: true,
    });

    // Check mobile touch targets are at least 44x44
    const touchTargets = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      const undersized: string[] = [];
      buttons.forEach(btn => {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          const label = btn.getAttribute('aria-label') || btn.textContent?.trim().slice(0, 30) || 'unknown';
          undersized.push(`${label} (${Math.round(rect.width)}x${Math.round(rect.height)})`);
        }
      });
      return undersized;
    });
    console.log(`[Audit] Undersized touch targets on mobile: ${touchTargets.length}`);
    if (touchTargets.length > 0) {
      console.log(`  → ${touchTargets.join('\n  → ')}`);
    }
  });

  // ----------------------------------------------------------
  // 6. Mobile Filters
  // ----------------------------------------------------------
  test('06 - Mobile filters sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForLibrary(page);

    const filterBtn = page.locator('button:has-text("Filters")').first();
    if (await filterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterBtn.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit/06-mobile-filters.png',
      fullPage: false,
    });
  });

  // ----------------------------------------------------------
  // 7. Search Interaction
  // ----------------------------------------------------------
  test('07 - Search UX', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const searchInput = page.locator('input[type="search"]').first();
    await searchInput.click();
    await searchInput.fill('design');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/audit/07-search.png',
      fullPage: true,
    });

    // Check search filtering works
    const cards = page.locator('[data-testid="book-card"]');
    const filteredCount = await cards.count();
    console.log(`[Audit] Search "design": ${filteredCount} results`);
  });

  // ----------------------------------------------------------
  // 8. Empty State (no results)
  // ----------------------------------------------------------
  test('08 - Empty filter state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const searchInput = page.locator('input[type="search"]').first();
    await searchInput.fill('zzzznonexistent');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/audit/08-empty-state.png',
      fullPage: true,
    });
  });

  // ----------------------------------------------------------
  // 9. Loading Skeleton
  // ----------------------------------------------------------
  test('09 - Loading skeleton', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Override the mock to delay the response
    await page.route('**/api/library', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLibrary),
      });
    });

    await page.route('**/api/library-stats', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLibraryStats),
      });
    });

    await page.route('**/api/collections', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ collections: [] }),
      });
    });

    await page.route('**/api/covers/**', async (route) => {
      await route.fulfill({ status: 404 });
    });

    await page.goto('/');
    await page.waitForTimeout(500); // Give time for skeleton to render

    await page.screenshot({
      path: 'e2e/screenshots/audit/09-loading-skeleton.png',
      fullPage: true,
    });
  });

  // ----------------------------------------------------------
  // 10. Accessibility Audit
  // ----------------------------------------------------------
  test('10 - Accessibility check', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const a11yResults = await page.evaluate(() => {
      const issues: string[] = [];

      // Check heading hierarchy
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      const levels = headings.map(h => parseInt(h.tagName[1]));
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] > levels[i - 1] + 1) {
          issues.push(`Heading skip: h${levels[i - 1]} → h${levels[i]} (${headings[i].textContent?.trim().slice(0, 30)})`);
        }
      }

      // Check images for alt text
      const imgs = document.querySelectorAll('img');
      imgs.forEach(img => {
        if (!img.hasAttribute('alt') || img.alt === '') {
          issues.push(`Image missing alt text: ${img.src.slice(-40)}`);
        }
      });

      // Check buttons for accessible names
      const btns = document.querySelectorAll('button');
      btns.forEach(btn => {
        const hasName = btn.getAttribute('aria-label') ||
                        btn.textContent?.trim() ||
                        btn.querySelector('[aria-label]');
        if (!hasName) {
          issues.push(`Button without accessible name: ${btn.outerHTML.slice(0, 80)}`);
        }
      });

      // Check for skip link
      const skipLink = document.querySelector('.skip-link, a[href="#main-content"]');
      if (!skipLink) {
        issues.push('No skip link found for keyboard navigation');
      }

      // Check color contrast on key elements (basic check)
      const body = getComputedStyle(document.body);
      const bgColor = body.backgroundColor;
      const textColor = body.color;

      // Check focus-visible styles exist
      const interactiveElements = document.querySelectorAll('a[href], button, input, select');
      let hasFocusStyles = 0;
      interactiveElements.forEach(el => {
        const style = getComputedStyle(el);
        if (style.outlineStyle !== 'none' || style.boxShadow !== 'none') {
          hasFocusStyles++;
        }
      });

      return {
        issues,
        headingCount: headings.length,
        imageCount: imgs.length,
        buttonCount: btns.length,
        hasSkipLink: !!skipLink,
        interactiveCount: interactiveElements.length,
        bgColor,
        textColor,
      };
    });

    console.log(`[Audit] Accessibility:`);
    console.log(`  Headings: ${a11yResults.headingCount}`);
    console.log(`  Images: ${a11yResults.imageCount}`);
    console.log(`  Buttons: ${a11yResults.buttonCount}`);
    console.log(`  Skip link: ${a11yResults.hasSkipLink}`);
    console.log(`  Interactive elements: ${a11yResults.interactiveCount}`);
    console.log(`  Colors: bg=${a11yResults.bgColor}, text=${a11yResults.textColor}`);
    if (a11yResults.issues.length > 0) {
      console.log(`  Issues (${a11yResults.issues.length}):`);
      a11yResults.issues.forEach(i => console.log(`    → ${i}`));
    } else {
      console.log(`  No issues found`);
    }
  });

  // ----------------------------------------------------------
  // 11. Performance Metrics
  // ----------------------------------------------------------
  test('11 - Performance metrics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const start = Date.now();
    await page.goto('/');
    await waitForLibrary(page);
    const loadTime = Date.now() - start;

    const perfMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const nav = entries[0];
      return {
        domContentLoaded: nav?.domContentLoadedEventEnd - nav?.startTime,
        loadComplete: nav?.loadEventEnd - nav?.startTime,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      };
    });

    // Measure CLS
    const cls = await page.evaluate(() => {
      return new Promise<number>(resolve => {
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
        }, 1500);
      });
    });

    // Measure DOM complexity
    const domStats = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      let maxDepth = 0;
      allElements.forEach(el => {
        let depth = 0;
        let node: Element | null = el;
        while (node) {
          depth++;
          node = node.parentElement;
        }
        maxDepth = Math.max(maxDepth, depth);
      });
      return {
        totalElements: allElements.length,
        maxDepth,
      };
    });

    console.log(`[Audit] Performance:`);
    console.log(`  Total Load Time: ${loadTime}ms`);
    console.log(`  DOM Content Loaded: ${perfMetrics.domContentLoaded?.toFixed(0)}ms`);
    console.log(`  Load Complete: ${perfMetrics.loadComplete?.toFixed(0)}ms`);
    console.log(`  First Paint: ${perfMetrics.firstPaint?.toFixed(0)}ms`);
    console.log(`  First Contentful Paint: ${perfMetrics.firstContentfulPaint?.toFixed(0)}ms`);
    console.log(`  Cumulative Layout Shift: ${cls.toFixed(4)}`);
    console.log(`  DOM Elements: ${domStats.totalElements}`);
    console.log(`  Max DOM Depth: ${domStats.maxDepth}`);

    // Assertions
    expect(perfMetrics.firstContentfulPaint).toBeLessThan(3000);
    expect(cls).toBeLessThan(0.25);
    expect(domStats.totalElements).toBeLessThan(5000);
  });

  // ----------------------------------------------------------
  // 12. Scroll Performance
  // ----------------------------------------------------------
  test('12 - Scroll performance', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const scrollMetrics = await page.evaluate(async () => {
      return new Promise<{ avgFps: number; minFps: number; frameCount: number }>(resolve => {
        const frameTimes: number[] = [];
        let lastTime = performance.now();
        let scrollPos = 0;

        const measure = () => {
          const now = performance.now();
          frameTimes.push(1000 / (now - lastTime));
          lastTime = now;
        };

        const interval = setInterval(() => {
          scrollPos += 50;
          window.scrollTo(0, scrollPos);
          measure();

          if (scrollPos > 1000) {
            clearInterval(interval);
            const avgFps = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            const minFps = Math.min(...frameTimes);
            resolve({ avgFps, minFps, frameCount: frameTimes.length });
          }
        }, 16);
      });
    });

    console.log(`[Audit] Scroll Performance:`);
    console.log(`  Average FPS: ${scrollMetrics.avgFps.toFixed(1)}`);
    console.log(`  Min FPS: ${scrollMetrics.minFps.toFixed(1)}`);
    console.log(`  Frames: ${scrollMetrics.frameCount}`);
  });

  // ----------------------------------------------------------
  // 13. Focus & Keyboard Navigation
  // ----------------------------------------------------------
  test('13 - Keyboard navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    // Tab through interactive elements
    const tabOrder: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return 'null';
        return `${el.tagName}[${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20) || ''}]`;
      });
      tabOrder.push(focused);
    }

    console.log(`[Audit] Tab order (first 15):`);
    tabOrder.forEach((el, i) => console.log(`  ${i + 1}. ${el}`));

    // Test "/" shortcut focuses search
    await page.keyboard.press('/');
    const searchFocused = await page.evaluate(() =>
      document.activeElement?.tagName === 'INPUT' &&
      (document.activeElement as HTMLInputElement).type === 'search'
    );
    console.log(`[Audit] "/" shortcut focuses search: ${searchFocused}`);

    await page.screenshot({
      path: 'e2e/screenshots/audit/13-focus-states.png',
      fullPage: false,
    });
  });

  // ----------------------------------------------------------
  // 14. CSS Animation & Transition Audit
  // ----------------------------------------------------------
  test('14 - Animation audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const animationStats = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      let animatedCount = 0;
      let willChangeCount = 0;
      const animations: string[] = [];

      allElements.forEach(el => {
        const style = getComputedStyle(el);
        if (style.animationName && style.animationName !== 'none') {
          animatedCount++;
          animations.push(`${el.tagName}.${el.className.split(' ')[0]}: ${style.animationName}`);
        }
        if (style.willChange && style.willChange !== 'auto') {
          willChangeCount++;
        }
      });

      return { animatedCount, willChangeCount, animations: animations.slice(0, 10) };
    });

    console.log(`[Audit] Animations:`);
    console.log(`  Active animations: ${animationStats.animatedCount}`);
    console.log(`  will-change elements: ${animationStats.willChangeCount}`);
    if (animationStats.animations.length > 0) {
      animationStats.animations.forEach(a => console.log(`    → ${a}`));
    }
  });

  // ----------------------------------------------------------
  // 15. Responsive Layout Breakpoints
  // ----------------------------------------------------------
  test('15 - Responsive breakpoints', async ({ page }) => {
    await page.goto('/');

    const breakpoints = [
      { name: 'mobile-sm', width: 375, height: 667 },
      { name: 'mobile', width: 390, height: 844 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop-sm', width: 1024, height: 768 },
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'desktop-xl', width: 1920, height: 1080 },
    ];

    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');
      await waitForLibrary(page);

      const gridCols = await page.evaluate(() => {
        const grid = document.querySelector('[data-testid="library-grid"]');
        if (!grid) return 'N/A';
        return getComputedStyle(grid).gridTemplateColumns;
      });

      console.log(`[Audit] ${bp.name} (${bp.width}px): grid=${gridCols}`);
    }
  });

  // ----------------------------------------------------------
  // 16. Theme Transition
  // ----------------------------------------------------------
  test('16 - Theme transition quality', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    // Get initial theme colors
    const darkColors = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
    }));

    // Toggle theme
    const themeBtn = page.locator('button[aria-label*="theme" i], button[aria-label*="light" i], button[aria-label*="dark" i]').first();
    if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeBtn.click();
      await page.waitForTimeout(500);
    }

    // Get light theme colors
    const lightColors = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
    }));

    console.log(`[Audit] Theme colors:`);
    console.log(`  Dark:  bg=${darkColors.bg}, text=${darkColors.text}`);
    console.log(`  Light: bg=${lightColors.bg}, text=${lightColors.text}`);

    // Verify colors actually changed
    const colorsChanged = darkColors.bg !== lightColors.bg;
    console.log(`  Colors changed on toggle: ${colorsChanged}`);
  });

  // ----------------------------------------------------------
  // 17. Continue Reading Section
  // ----------------------------------------------------------
  test('17 - Continue reading card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    // Find continue reading section
    const continueSection = page.locator('text=Continue Reading').first();
    const hasContinue = await continueSection.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[Audit] Continue Reading section visible: ${hasContinue}`);

    if (hasContinue) {
      await continueSection.scrollIntoViewIfNeeded();

      await page.screenshot({
        path: 'e2e/screenshots/audit/17-continue-reading.png',
        fullPage: false,
      });
    }
  });

  // ----------------------------------------------------------
  // 18. Mobile Light Theme
  // ----------------------------------------------------------
  test('18 - Mobile light theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForLibrary(page);

    const themeBtn = page.locator('button[aria-label*="theme" i], button[aria-label*="light" i], button[aria-label*="dark" i]').first();
    if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeBtn.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit/18-mobile-light.png',
      fullPage: true,
    });
  });
});
