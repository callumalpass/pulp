import { test, expect, Page } from '@playwright/test';

// Comprehensive mock data
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
    lastRead: new Date(NOW - HOUR * 2).toISOString(),
    dateCreated: new Date(NOW - DAY * 30).toISOString(),
    cover: true,
    rating: 5,
    pinned: true,
    highlightCount: 12,
    currentChapter: 'Chapter 5: Human Error',
    readingStats: {
      totalReadingTimeMs: 18000000,
      totalPagesRead: 269,
      pagesPerHour: 18,
      lastSessionDate: new Date(NOW - HOUR * 2).toISOString(),
      sessionsCount: 15,
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
    lastRead: new Date(NOW - HOUR * 6).toISOString(),
    dateCreated: new Date(NOW - DAY * 45).toISOString(),
    cover: false,
    rating: 4,
    pinned: false,
    highlightCount: 8,
    readingStats: {
      totalReadingTimeMs: 14400000,
      totalPagesRead: 225,
      pagesPerHour: 15,
      lastSessionDate: new Date(NOW - HOUR * 6).toISOString(),
      sessionsCount: 12,
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
    lastRead: new Date(NOW - DAY * 7).toISOString(),
    dateCreated: new Date(NOW - DAY * 90).toISOString(),
    dateFinished: new Date(NOW - DAY * 7).toISOString(),
    cover: false,
    rating: 5,
    pinned: false,
    highlightCount: 24,
    readingStats: {
      totalReadingTimeMs: 28800000,
      totalPagesRead: 464,
      pagesPerHour: 16,
      lastSessionDate: new Date(NOW - DAY * 7).toISOString(),
      sessionsCount: 20,
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
    lastRead: new Date(NOW - DAY * 2).toISOString(),
    dateCreated: new Date(NOW - DAY * 14).toISOString(),
    cover: false,
    rating: 0,
    pinned: false,
    highlightCount: 2,
    readingStats: {
      totalReadingTimeMs: 3600000,
      totalPagesRead: 53,
      pagesPerHour: 14,
      lastSessionDate: new Date(NOW - DAY * 2).toISOString(),
      sessionsCount: 3,
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
    lastRead: null,
    dateCreated: new Date(NOW - DAY * 3).toISOString(),
    cover: false,
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
    lastRead: new Date(NOW - DAY * 5).toISOString(),
    dateCreated: new Date(NOW - DAY * 60).toISOString(),
    cover: false,
    rating: 5,
    pinned: true,
    highlightCount: 15,
    readingStats: {
      totalReadingTimeMs: 10800000,
      totalPagesRead: 184,
      pagesPerHour: 12,
      lastSessionDate: new Date(NOW - DAY * 5).toISOString(),
      sessionsCount: 8,
    },
  },
];

const mockLibraryStats = {
  totalBooks: mockLibrary.length,
  totalPagesRead: 1195,
  booksCompleted: 1,
  booksInProgress: 4,
  booksUnread: 1,
  totalReadingTimeMs: 75600000,
  totalHighlights: 61,
  booksCompletedThisYear: 1,
  currentYear: new Date().getFullYear(),
};

const mockReadingGoals = {
  streak: {
    currentStreak: 5,
    longestStreak: 12,
    graceDaysUsed: 0,
    freezeDaysUsed: 0,
  },
  todayProgress: {
    totalDurationMs: 1200000, // 20 minutes
  },
  goals: {
    dailyGoalMinutes: 30,
  },
  streakAtRisk: null,
};

async function setupMocks(page: Page) {
  await page.route('**/api/library', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockLibrary),
    });
  });

  await page.route('**/api/library-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockLibraryStats),
    });
  });

  await page.route('**/api/reading-goals', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReadingGoals),
    });
  });

  await page.route('**/api/collections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ collections: ['Programming', 'Design'] }),
    });
  });

  await page.route('**/api/covers/**', async (route) => {
    await route.fulfill({ status: 404 });
  });

  await page.route('**/api/search-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isComplete: true, indexedDocuments: 6, totalDocuments: 6, percentComplete: 100 }),
    });
  });

  // WebSocket mock
  await page.route('**/ws', async (route) => {
    await route.fulfill({ status: 404 });
  });
}

async function waitForApp(page: Page) {
  await page.waitForSelector('[data-testid="book-card"], a[href^="/read/"]', { timeout: 15000 });
  await page.waitForTimeout(500); // Allow animations to settle
}

// =============================
// COMPREHENSIVE AUDIT TESTS
// =============================

test.describe('Comprehensive UI/UX & Performance Audit', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  // ----- VISUAL AUDIT -----

  test('Desktop dark theme - full page audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    await page.screenshot({
      path: 'e2e/screenshots/audit-comprehensive/01-desktop-dark.png',
      fullPage: true,
    });

    // Verify key elements are present
    const searchInput = page.locator('input[type="search"]');
    await expect(searchInput).toBeVisible();

    const cards = page.locator('[data-testid="book-card"]');
    const cardCount = await cards.count();
    console.log(`[AUDIT] Desktop dark: ${cardCount} book cards rendered`);
    expect(cardCount).toBeGreaterThanOrEqual(4); // Some may be in "continue reading"
  });

  test('Desktop light theme - full page audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    // Toggle to light theme
    const themeToggle = page.locator('button[aria-label*="theme" i], button[aria-label*="light" i], button[aria-label*="dark" i]').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit-comprehensive/02-desktop-light.png',
      fullPage: true,
    });

    // Verify theme actually changed
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    console.log(`[AUDIT] Theme after toggle: ${theme}`);
  });

  test('Card hover state and interactions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    const firstCard = page.locator('[data-testid="book-card"]').first();
    await firstCard.hover();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'e2e/screenshots/audit-comprehensive/03-card-hover.png',
      fullPage: true,
    });

    // Check that hover reveals action buttons
    const pinButton = firstCard.locator('button[aria-label*="Pin" i], button[aria-label*="Unpin" i]');
    const infoButton = firstCard.locator('button[aria-label*="metadata" i], button[aria-label*="info" i]');
    console.log(`[AUDIT] Pin button visible on hover: ${await pinButton.isVisible()}`);
    console.log(`[AUDIT] Info button visible on hover: ${await infoButton.isVisible()}`);
  });

  test('Mobile viewport - layout audit', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForApp(page);

    await page.screenshot({
      path: 'e2e/screenshots/audit-comprehensive/04-mobile-default.png',
      fullPage: true,
    });

    // Check mobile-specific elements
    const filterButton = page.locator('button:has-text("Filters")');
    console.log(`[AUDIT] Mobile filter button visible: ${await filterButton.isVisible()}`);
  });

  test('Mobile filters bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForApp(page);

    const filterButton = page.locator('button:has-text("Filters")');
    if (await filterButton.isVisible()) {
      await filterButton.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit-comprehensive/05-mobile-filters.png',
      fullPage: true,
    });
  });

  test('List view mode', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    const listToggle = page.locator('button[aria-label*="list" i]').first();
    if (await listToggle.isVisible()) {
      await listToggle.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit-comprehensive/06-list-view.png',
      fullPage: true,
    });
  });

  test('Search active state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill('design');
    await page.waitForTimeout(400);

    await page.screenshot({
      path: 'e2e/screenshots/audit-comprehensive/07-search-active.png',
      fullPage: true,
    });

    // Verify search filters results
    const visibleCards = page.locator('[data-testid="book-card"]');
    const count = await visibleCards.count();
    console.log(`[AUDIT] Cards visible after searching "design": ${count}`);
  });

  test('Empty search results', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill('xyznonexistent123');
    await page.waitForTimeout(400);

    await page.screenshot({
      path: 'e2e/screenshots/audit-comprehensive/08-empty-search.png',
      fullPage: true,
    });
  });

  test('Loading skeleton state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Delay API response to capture loading state
    await page.route('**/api/library', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLibrary),
      });
    });

    await page.route('**/api/covers/**', async (route) => {
      await route.fulfill({ status: 404 });
    });

    await page.goto('/');
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'e2e/screenshots/audit-comprehensive/09-loading-skeleton.png',
      fullPage: true,
    });
  });

  // ----- PERFORMANCE AUDIT -----

  test('Core Web Vitals and performance metrics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const startTime = Date.now();

    await page.goto('/');
    await waitForApp(page);

    const loadTime = Date.now() - startTime;

    // Collect performance metrics
    const metrics = await page.evaluate(() => {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const nav = navEntries[0];
      return {
        domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
        loadComplete: nav ? nav.loadEventEnd - nav.startTime : null,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime ?? null,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
        resourceCount: performance.getEntriesByType('resource').length,
        transferSize: performance.getEntriesByType('resource').reduce((sum, r) => sum + ((r as PerformanceResourceTiming).transferSize || 0), 0),
      };
    });

    // CLS measurement
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

    console.log(`\n===== PERFORMANCE AUDIT =====`);
    console.log(`  Total Load Time: ${loadTime}ms`);
    console.log(`  DOM Content Loaded: ${metrics.domContentLoaded?.toFixed(0) ?? 'N/A'}ms`);
    console.log(`  Load Complete: ${metrics.loadComplete?.toFixed(0) ?? 'N/A'}ms`);
    console.log(`  First Paint: ${metrics.firstPaint?.toFixed(0) ?? 'N/A'}ms`);
    console.log(`  First Contentful Paint: ${metrics.firstContentfulPaint?.toFixed(0) ?? 'N/A'}ms`);
    console.log(`  Cumulative Layout Shift: ${cls.toFixed(4)}`);
    console.log(`  Resource Count: ${metrics.resourceCount}`);
    console.log(`  Transfer Size: ${(metrics.transferSize / 1024).toFixed(1)}KB`);
    console.log(`=============================\n`);

    // Assertions
    if (metrics.firstContentfulPaint) {
      expect(metrics.firstContentfulPaint).toBeLessThan(3000);
    }
    expect(cls).toBeLessThan(0.25);
    expect(loadTime).toBeLessThan(10000);
  });

  test('DOM complexity audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    const domMetrics = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const totalNodes = allElements.length;

      // Check for deep nesting
      let maxDepth = 0;
      function getDepth(el: Element, depth: number): number {
        if (depth > maxDepth) maxDepth = depth;
        for (const child of el.children) {
          getDepth(child, depth + 1);
        }
        return maxDepth;
      }
      getDepth(document.body, 0);

      // Count inline styles (performance concern)
      let inlineStyleCount = 0;
      allElements.forEach((el) => {
        if ((el as HTMLElement).style?.length > 0) inlineStyleCount++;
      });

      // Count event listeners (approximation via data attributes)
      let interactiveElements = 0;
      allElements.forEach((el) => {
        const tag = el.tagName.toLowerCase();
        if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || el.getAttribute('role') === 'button') {
          interactiveElements++;
        }
      });

      // Check for images without dimensions
      const images = document.querySelectorAll('img');
      let imagesWithoutDimensions = 0;
      images.forEach((img) => {
        if (!img.width && !img.height && !img.style.width && !img.style.height) {
          imagesWithoutDimensions++;
        }
      });

      return {
        totalNodes,
        maxDepth,
        inlineStyleCount,
        interactiveElements,
        imageCount: images.length,
        imagesWithoutDimensions,
      };
    });

    console.log(`\n===== DOM COMPLEXITY AUDIT =====`);
    console.log(`  Total DOM Nodes: ${domMetrics.totalNodes}`);
    console.log(`  Max Nesting Depth: ${domMetrics.maxDepth}`);
    console.log(`  Inline Styles: ${domMetrics.inlineStyleCount}`);
    console.log(`  Interactive Elements: ${domMetrics.interactiveElements}`);
    console.log(`  Images: ${domMetrics.imageCount}`);
    console.log(`  Images without Dimensions: ${domMetrics.imagesWithoutDimensions}`);
    console.log(`================================\n`);

    expect(domMetrics.totalNodes).toBeLessThan(3000);
    expect(domMetrics.maxDepth).toBeLessThan(30);
  });

  // ----- ACCESSIBILITY AUDIT -----

  test('Accessibility fundamentals', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    const a11yAudit = await page.evaluate(() => {
      // Check skip link
      const skipLink = document.querySelector('a[href="#main-content"], .skip-link');

      // Heading hierarchy
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => ({
        level: parseInt(h.tagName[1]),
        text: h.textContent?.trim().substring(0, 60) || '',
      }));

      // Check heading order (no skipping levels)
      let headingOrderIssues: string[] = [];
      for (let i = 1; i < headings.length; i++) {
        if (headings[i].level > headings[i - 1].level + 1) {
          headingOrderIssues.push(`H${headings[i - 1].level} -> H${headings[i].level} (skipped level)`);
        }
      }

      // Buttons without accessible names
      const buttons = Array.from(document.querySelectorAll('button'));
      const unlabeledButtons = buttons.filter((btn) => {
        const text = btn.textContent?.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        const ariaLabelledBy = btn.getAttribute('aria-labelledby');
        const title = btn.getAttribute('title');
        return !text && !ariaLabel && !ariaLabelledBy && !title;
      });

      // Images without alt text
      const images = Array.from(document.querySelectorAll('img'));
      const noAltImages = images.filter((img) => !img.hasAttribute('alt'));

      // Interactive elements without focus-visible styles
      const focusableElements = document.querySelectorAll('a, button, input, select, textarea, [tabindex]');

      // ARIA roles and landmarks
      const landmarks = Array.from(document.querySelectorAll('[role="main"], [role="navigation"], [role="search"], [role="banner"], [role="contentinfo"], main, nav, header, footer'));

      // Form inputs without labels
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      const unlabeledInputs = inputs.filter((input) => {
        const id = input.id;
        const label = id ? document.querySelector(`label[for="${id}"]`) : null;
        const ariaLabel = input.getAttribute('aria-label');
        const ariaLabelledBy = input.getAttribute('aria-labelledby');
        return !label && !ariaLabel && !ariaLabelledBy;
      });

      // Touch targets (min 44x44)
      const smallTouchTargets: string[] = [];
      buttons.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          smallTouchTargets.push(`${btn.getAttribute('aria-label') || btn.textContent?.trim().substring(0, 20) || 'unnamed'} (${Math.round(rect.width)}x${Math.round(rect.height)})`);
        }
      });

      return {
        hasSkipLink: !!skipLink,
        headings,
        headingOrderIssues,
        totalButtons: buttons.length,
        unlabeledButtons: unlabeledButtons.map((b) => b.outerHTML.substring(0, 100)),
        totalImages: images.length,
        noAltImages: noAltImages.length,
        focusableCount: focusableElements.length,
        landmarks: landmarks.map((l) => l.tagName.toLowerCase() + (l.getAttribute('role') ? `[role=${l.getAttribute('role')}]` : '')),
        unlabeledInputs: unlabeledInputs.map((i) => i.outerHTML.substring(0, 100)),
        smallTouchTargets: smallTouchTargets.slice(0, 10),
      };
    });

    console.log(`\n===== ACCESSIBILITY AUDIT =====`);
    console.log(`  Skip Link: ${a11yAudit.hasSkipLink ? 'PASS' : 'FAIL'}`);
    console.log(`  Headings: ${a11yAudit.headings.map((h) => `H${h.level}(${h.text.substring(0, 20)})`).join(', ')}`);
    console.log(`  Heading Order Issues: ${a11yAudit.headingOrderIssues.length === 0 ? 'PASS' : a11yAudit.headingOrderIssues.join(', ')}`);
    console.log(`  Unlabeled Buttons: ${a11yAudit.unlabeledButtons.length} of ${a11yAudit.totalButtons}`);
    if (a11yAudit.unlabeledButtons.length > 0) {
      a11yAudit.unlabeledButtons.forEach((b) => console.log(`    - ${b}`));
    }
    console.log(`  Images without alt: ${a11yAudit.noAltImages} of ${a11yAudit.totalImages}`);
    console.log(`  Landmarks: ${a11yAudit.landmarks.join(', ')}`);
    console.log(`  Unlabeled Inputs: ${a11yAudit.unlabeledInputs.length}`);
    if (a11yAudit.unlabeledInputs.length > 0) {
      a11yAudit.unlabeledInputs.forEach((i) => console.log(`    - ${i}`));
    }
    console.log(`  Small Touch Targets (<44px): ${a11yAudit.smallTouchTargets.length}`);
    if (a11yAudit.smallTouchTargets.length > 0) {
      a11yAudit.smallTouchTargets.forEach((t) => console.log(`    - ${t}`));
    }
    console.log(`  Focusable Elements: ${a11yAudit.focusableCount}`);
    console.log(`================================\n`);

    // Key assertions
    expect(a11yAudit.hasSkipLink).toBe(true);
    expect(a11yAudit.headings.length).toBeGreaterThanOrEqual(1);
  });

  test('Keyboard navigation audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    // Test Tab key navigation
    const tabStops: string[] = [];

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return {
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().substring(0, 30) || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          role: el.getAttribute('role') || '',
        };
      });
      if (focused) {
        tabStops.push(`${focused.tag}(${focused.ariaLabel || focused.text || focused.role})`);
      }
    }

    console.log(`\n===== KEYBOARD NAV AUDIT =====`);
    console.log(`  Tab stops (first 15): ${tabStops.join(' -> ')}`);

    // Test "/" shortcut to focus search
    await page.keyboard.press('Escape'); // Ensure nothing is focused
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('/');
    const searchFocused = await page.evaluate(() => {
      return document.activeElement?.tagName === 'INPUT' &&
        (document.activeElement as HTMLInputElement).type === 'search';
    });
    console.log(`  "/" shortcut focuses search: ${searchFocused ? 'PASS' : 'FAIL'}`);

    // Test "?" shortcut for keyboard shortcuts panel
    await page.keyboard.press('Escape');
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('?');
    await page.waitForTimeout(300);
    const shortcutsVisible = await page.evaluate(() => {
      return !!document.querySelector('[class*="keyboard-shortcuts"]') ||
        !!document.querySelector('[aria-label*="keyboard" i]') ||
        !!document.querySelector('[class*="shortcuts-panel"]');
    });
    console.log(`  "?" shortcut shows help: ${shortcutsVisible ? 'PASS' : 'MAYBE - panel may not be visible'}`);

    console.log(`===============================\n`);

    expect(tabStops.length).toBeGreaterThan(3);
    expect(searchFocused).toBe(true);
  });

  // ----- UI CONSISTENCY AUDIT -----

  test('Visual consistency check', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    const consistencyReport = await page.evaluate(() => {
      const issues: string[] = [];
      const suggestions: string[] = [];

      // Check consistent border-radius on cards
      const cards = document.querySelectorAll('[data-testid="book-card"]');
      const cardRadii = new Set<string>();
      cards.forEach((c) => {
        const style = getComputedStyle(c.firstElementChild as Element);
        cardRadii.add(style.borderRadius);
      });
      if (cardRadii.size > 1) {
        issues.push(`Inconsistent card border-radius: ${[...cardRadii].join(', ')}`);
      }

      // Check font consistency
      const textElements = document.querySelectorAll('h1, h2, h3, p, span, a, button');
      const fonts = new Set<string>();
      textElements.forEach((el) => {
        const computed = getComputedStyle(el);
        const fontFamily = computed.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
        if (fontFamily) fonts.add(fontFamily);
      });
      if (fonts.size > 3) {
        suggestions.push(`Many font families detected (${fonts.size}): ${[...fonts].join(', ')}`);
      }

      // Check color contrast of text
      const bodyStyle = getComputedStyle(document.body);
      const bgColor = bodyStyle.backgroundColor;
      const textColor = bodyStyle.color;

      // Check for elements with overflow issues
      const overflowElements: string[] = [];
      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 5) {
          overflowElements.push(`${el.tagName.toLowerCase()}${el.className ? `.${el.className.split(' ')[0]}` : ''} overflows by ${Math.round(rect.right - window.innerWidth)}px`);
        }
      });
      if (overflowElements.length > 0) {
        issues.push(`Horizontal overflow: ${overflowElements.slice(0, 3).join('; ')}`);
      }

      // Check spacing consistency
      const gaps = new Set<string>();
      document.querySelectorAll('[class*="gap-"]').forEach((el) => {
        const style = getComputedStyle(el);
        gaps.add(style.gap || style.rowGap || '');
      });

      // Check button sizing consistency
      const buttons = document.querySelectorAll('button');
      const buttonHeights = new Map<string, number>();
      buttons.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        if (rect.height > 0) {
          const h = Math.round(rect.height);
          buttonHeights.set(String(h), (buttonHeights.get(String(h)) || 0) + 1);
        }
      });

      return {
        issues,
        suggestions,
        bgColor,
        textColor,
        fontFamilies: [...fonts],
        overflowElements: overflowElements.slice(0, 5),
        gapValues: [...gaps].filter(Boolean),
        buttonHeightDistribution: Object.fromEntries(buttonHeights),
      };
    });

    console.log(`\n===== UI CONSISTENCY AUDIT =====`);
    console.log(`  Background: ${consistencyReport.bgColor}`);
    console.log(`  Text Color: ${consistencyReport.textColor}`);
    console.log(`  Font Families: ${consistencyReport.fontFamilies.join(', ')}`);
    console.log(`  Issues: ${consistencyReport.issues.length === 0 ? 'None' : ''}`);
    consistencyReport.issues.forEach((i) => console.log(`    - ${i}`));
    console.log(`  Suggestions: ${consistencyReport.suggestions.length === 0 ? 'None' : ''}`);
    consistencyReport.suggestions.forEach((s) => console.log(`    - ${s}`));
    console.log(`  Overflow Elements: ${consistencyReport.overflowElements.length === 0 ? 'None' : consistencyReport.overflowElements.join('; ')}`);
    console.log(`  Button Height Distribution: ${JSON.stringify(consistencyReport.buttonHeightDistribution)}`);
    console.log(`=================================\n`);
  });

  // ----- INTERACTION AUDIT -----

  test('Filter interaction responsiveness', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    // Test type filter
    const pdfFilter = page.locator('button:has-text("PDF")').first();
    if (await pdfFilter.isVisible()) {
      const beforeCount = await page.locator('[data-testid="book-card"]').count();
      await pdfFilter.click();
      await page.waitForTimeout(300);
      const afterCount = await page.locator('[data-testid="book-card"]').count();
      console.log(`[AUDIT] PDF filter: ${beforeCount} -> ${afterCount} cards`);

      await page.screenshot({
        path: 'e2e/screenshots/audit-comprehensive/10-pdf-filtered.png',
        fullPage: true,
      });
    }

    // Test sort change
    const titleSort = page.locator('button:has-text("Title")').first();
    if (await titleSort.isVisible()) {
      await titleSort.click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: 'e2e/screenshots/audit-comprehensive/11-sorted-title.png',
        fullPage: true,
      });
    }
  });

  test('Theme toggle animation smoothness', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    // Capture pre-toggle state
    const themeToggle = page.locator('button[aria-label*="theme" i], button[aria-label*="light" i], button[aria-label*="dark" i]').first();

    if (await themeToggle.isVisible()) {
      // Track paint count during theme toggle
      const paintsBefore = await page.evaluate(() => {
        return performance.getEntriesByType('paint').length;
      });

      await themeToggle.click();
      await page.waitForTimeout(500);

      const paintsAfter = await page.evaluate(() => {
        return performance.getEntriesByType('paint').length;
      });

      console.log(`[AUDIT] Theme toggle paints: ${paintsBefore} -> ${paintsAfter}`);

      // Toggle back
      await themeToggle.click();
      await page.waitForTimeout(500);
    }
  });

  // ----- RESPONSIVE DESIGN AUDIT -----

  test('Responsive breakpoint audit', async ({ page }) => {
    const breakpoints = [
      { name: 'mobile-sm', width: 320, height: 568 },
      { name: 'mobile', width: 390, height: 844 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'laptop', width: 1024, height: 768 },
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'wide', width: 1920, height: 1080 },
    ];

    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');
      await waitForApp(page);

      // Check for horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      // Count grid columns
      const gridInfo = await page.evaluate(() => {
        const grid = document.querySelector('.grid');
        if (!grid) return { cols: 0, gap: '' };
        const style = getComputedStyle(grid);
        const cols = style.gridTemplateColumns.split(' ').length;
        return { cols, gap: style.gap };
      });

      await page.screenshot({
        path: `e2e/screenshots/audit-comprehensive/responsive-${bp.name}.png`,
        fullPage: false, // viewport only
      });

      console.log(`[AUDIT] ${bp.name} (${bp.width}px): ${gridInfo.cols} cols, overflow: ${hasOverflow}`);

      if (hasOverflow) {
        console.log(`  WARNING: Horizontal overflow at ${bp.name} (${bp.width}px)`);
      }
    }
  });

  // ----- ANIMATION PERFORMANCE -----

  test('Animation performance audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    const animationAudit = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      let animatedCount = 0;
      let willChangeCount = 0;
      const willChangeProperties: string[] = [];
      let containCount = 0;

      allElements.forEach((el) => {
        const style = getComputedStyle(el);
        if (style.animation && style.animation !== 'none') animatedCount++;
        if (style.willChange && style.willChange !== 'auto') {
          willChangeCount++;
          willChangeProperties.push(style.willChange);
        }
        if (style.contain && style.contain !== 'none') containCount++;
      });

      return {
        animatedCount,
        willChangeCount,
        willChangeProperties: [...new Set(willChangeProperties)],
        containCount,
      };
    });

    console.log(`\n===== ANIMATION PERFORMANCE =====`);
    console.log(`  Currently Animated Elements: ${animationAudit.animatedCount}`);
    console.log(`  will-change Elements: ${animationAudit.willChangeCount} (${animationAudit.willChangeProperties.join(', ')})`);
    console.log(`  CSS contain Elements: ${animationAudit.containCount}`);
    console.log(`=================================\n`);

    // Too many will-change properties can hurt performance
    expect(animationAudit.willChangeCount).toBeLessThan(20);
  });
});
