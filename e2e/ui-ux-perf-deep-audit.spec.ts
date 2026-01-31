import { test, expect, type Page } from '@playwright/test';

// Realistic mock data for comprehensive testing
const MOCK_LIBRARY = [
  {
    id: 'book1',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    sourceType: 'pdf',
    progress: 72,
    lastRead: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
    cover: true,
    pinned: true,
    rating: 5,
    highlightCount: 23,
    totalPages: 562,
    currentChapter: 'Chapter 9: Consistency and Consensus',
    readingStats: { totalReadingTimeMs: 14400000, pagesPerHour: 25 },
  },
  {
    id: 'book2',
    title: 'The Pragmatic Programmer',
    author: 'David Thomas, Andrew Hunt',
    sourceType: 'epub',
    progress: 100,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    cover: true,
    pinned: false,
    rating: 4,
    highlightCount: 15,
    totalPages: 352,
    dateFinished: '2024-12-15T00:00:00Z',
    readingStats: { totalReadingTimeMs: 21600000, pagesPerHour: 30 },
  },
  {
    id: 'book3',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson, Gerald Jay Sussman',
    sourceType: 'pdf',
    progress: 34,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    cover: null,
    pinned: false,
    rating: null,
    highlightCount: 8,
    totalPages: 657,
    currentChapter: 'Chapter 2: Building Abstractions with Data',
    readingStats: { totalReadingTimeMs: 7200000, pagesPerHour: 18 },
  },
  {
    id: 'book4',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    sourceType: 'pdf',
    progress: 0,
    lastRead: null,
    cover: null,
    pinned: false,
    rating: null,
    highlightCount: 0,
    totalPages: 431,
    readingStats: null,
  },
  {
    id: 'book5',
    title: 'Refactoring: Improving the Design of Existing Code',
    author: 'Martin Fowler',
    sourceType: 'epub',
    progress: 88,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    cover: null,
    pinned: true,
    rating: 3,
    highlightCount: 5,
    totalPages: 418,
    currentChapter: 'Chapter 11: Refactoring APIs',
    readingStats: { totalReadingTimeMs: 10800000, pagesPerHour: 28 },
  },
  {
    id: 'book6',
    title: 'Introduction to Algorithms',
    author: 'Thomas H. Cormen, Charles E. Leiserson',
    sourceType: 'pdf',
    progress: 12,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    cover: null,
    pinned: false,
    rating: null,
    highlightCount: 2,
    totalPages: 1312,
    currentChapter: 'Chapter 3: Growth of Functions',
    readingStats: { totalReadingTimeMs: 3600000, pagesPerHour: 12 },
  },
];

const MOCK_READING_GOALS = {
  streak: { currentStreak: 7, longestStreak: 14, graceDaysUsed: 1, freezeDaysUsed: 0 },
  todayProgress: { totalDurationMs: 1200000, sessions: 2 },
  goals: { dailyGoalMinutes: 30 },
  streakAtRisk: null,
};

const MOCK_LIBRARY_STATS = {
  totalBooks: 6,
  booksCompleted: 1,
  booksInProgress: 4,
  booksUnread: 1,
  totalReadingTimeMs: 57600000,
  totalHighlights: 53,
  booksCompletedThisYear: 1,
  currentYear: 2026,
};

const MOCK_COLLECTIONS = { collections: ['Computer Science', 'Software Engineering'] };

async function setupMocks(page: Page) {
  await page.route('**/api/library**', async (route) => {
    const url = route.request().url();
    // Individual book request
    for (const book of MOCK_LIBRARY) {
      if (url.includes(`/library/${book.id}`) && !url.includes('/highlights') && !url.includes('/progress')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...book, highlights: [], frontmatter: {}, tags: ['literature-note'] }),
        });
      }
    }
    // Library list request
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_LIBRARY),
    });
  });

  await page.route('**/api/reading-goals**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_READING_GOALS),
    });
  });

  await page.route('**/api/library-stats**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_LIBRARY_STATS),
    });
  });

  await page.route('**/api/collections**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_COLLECTIONS),
    });
  });

  await page.route('**/api/search/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isComplete: true, indexedDocuments: 6, totalDocuments: 6, percentComplete: 100 }),
    });
  });

  // Cover images - return a small placeholder
  await page.route('**/api/covers/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#6c5ce7"/><text x="100" y="150" text-anchor="middle" fill="white" font-size="16">Cover</text></svg>',
    });
  });
}

test.describe('UI/UX & Performance Deep Audit', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('1. Initial load performance and layout', async ({ page }) => {
    const metrics: Record<string, unknown> = {};

    // Measure initial load
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    metrics.timeToFirstCard = Date.now() - startTime;

    // Check for layout shifts by measuring element positions
    const header = page.locator('header');
    await expect(header).toBeVisible();
    const headerBox = await header.boundingBox();
    metrics.headerHeight = headerBox?.height;

    // Verify no horizontal scroll on body
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    metrics.hasHorizontalScroll = hasHorizontalScroll;

    // Take full page screenshot
    await page.screenshot({
      path: 'e2e/screenshots/deep-audit/01-initial-load.png',
      fullPage: true,
    });

    // Collect performance metrics
    const perfMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const nav = entries[0];
      return {
        domContentLoaded: nav?.domContentLoadedEventEnd - nav?.startTime,
        loadComplete: nav?.loadEventEnd - nav?.startTime,
        domInteractive: nav?.domInteractive - nav?.startTime,
      };
    });
    metrics.navigation = perfMetrics;

    console.log('=== LOAD PERFORMANCE ===');
    console.log(JSON.stringify(metrics, null, 2));

    expect(hasHorizontalScroll).toBe(false);
  });

  test('2. Color contrast and text readability audit', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    const contrastIssues: string[] = [];

    // Check critical text elements for contrast
    const elements = await page.evaluate(() => {
      const results: { selector: string; color: string; bg: string; fontSize: string; text: string }[] = [];
      const checks = [
        { selector: 'h1', desc: 'Page title' },
        { selector: 'h2', desc: 'Section headers' },
        { selector: 'h3', desc: 'Card titles' },
        { selector: '.text-text-secondary', desc: 'Secondary text' },
        { selector: '.text-xs', desc: 'Small text' },
        { selector: '.text-accent-primary', desc: 'Accent text' },
      ];

      for (const check of checks) {
        const els = document.querySelectorAll(check.selector);
        els.forEach((el, i) => {
          if (i > 2) return; // Sample first 3
          const style = getComputedStyle(el);
          results.push({
            selector: `${check.desc} (${check.selector}:nth(${i}))`,
            color: style.color,
            bg: style.backgroundColor,
            fontSize: style.fontSize,
            text: (el.textContent || '').substring(0, 50),
          });
        });
      }
      return results;
    });

    // Check font sizes are readable
    for (const el of elements) {
      const fontSize = parseFloat(el.fontSize);
      if (fontSize < 11 && el.text.length > 5) {
        contrastIssues.push(`Small font (${el.fontSize}) on: "${el.text}" [${el.selector}]`);
      }
    }

    console.log('=== TEXT READABILITY ===');
    console.log(`Elements checked: ${elements.length}`);
    console.log(`Issues found: ${contrastIssues.length}`);
    contrastIssues.forEach(i => console.log(`  - ${i}`));

    await page.screenshot({ path: 'e2e/screenshots/deep-audit/02-contrast-dark.png', fullPage: true });

    // Switch to light mode and re-check
    await page.getByTitle('Toggle theme').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/deep-audit/02-contrast-light.png', fullPage: true });
  });

  test('3. Card layout consistency and spacing', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Get all card bounding boxes
    const cards = page.locator('[data-testid="book-card"]');
    const cardCount = await cards.count();
    const cardBoxes: { width: number; height: number; x: number; y: number }[] = [];

    for (let i = 0; i < cardCount; i++) {
      const box = await cards.nth(i).boundingBox();
      if (box) {
        cardBoxes.push({ width: Math.round(box.width), height: Math.round(box.height), x: Math.round(box.x), y: Math.round(box.y) });
      }
    }

    // Check width consistency (cards in same row should have same width)
    const widths = new Set(cardBoxes.map(b => b.width));
    const inconsistentWidths = widths.size > 2; // Allow small rounding differences

    // Check gaps between cards (horizontal)
    const rows = new Map<number, typeof cardBoxes>();
    for (const box of cardBoxes) {
      const rowKey = box.y;
      // Group by approximate row (within 5px tolerance)
      let found = false;
      for (const [key, row] of rows) {
        if (Math.abs(key - rowKey) < 5) {
          row.push(box);
          found = true;
          break;
        }
      }
      if (!found) {
        rows.set(rowKey, [box]);
      }
    }

    const gapIssues: string[] = [];
    for (const [, row] of rows) {
      if (row.length < 2) continue;
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) {
        const gap = row[i].x - (row[i - 1].x + row[i - 1].width);
        if (gap < 12 || gap > 20) { // gap-4 = 16px, allow some tolerance
          gapIssues.push(`Gap between cards ${i - 1} and ${i}: ${gap}px (expected ~16px)`);
        }
      }
    }

    console.log('=== CARD LAYOUT ===');
    console.log(`Cards found: ${cardCount}`);
    console.log(`Unique widths: ${[...widths].join(', ')}`);
    console.log(`Inconsistent widths: ${inconsistentWidths}`);
    console.log(`Gap issues: ${gapIssues.length}`);
    gapIssues.forEach(i => console.log(`  - ${i}`));

    await page.screenshot({ path: 'e2e/screenshots/deep-audit/03-card-layout.png', fullPage: true });
  });

  test('4. Interactive element touch targets', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Audit all interactive elements for touch target compliance (44x44px minimum)
    const touchTargetIssues = await page.evaluate(() => {
      const issues: string[] = [];
      const interactiveElements = document.querySelectorAll('button, a, input, select, [role="button"], [tabindex="0"]');

      interactiveElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        // Skip hidden elements
        if (rect.width === 0 || rect.height === 0) return;
        // Skip elements that are part of screen-reader-only content
        const style = getComputedStyle(el);
        if (style.position === 'absolute' && rect.width === 1 && rect.height === 1) return;

        if (rect.width < 44 || rect.height < 44) {
          const text = (el.textContent || '').trim().substring(0, 40);
          const tag = el.tagName.toLowerCase();
          const cls = el.className?.toString().substring(0, 80) || '';
          issues.push(`${tag}: ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}px "${text}" [${cls}]`);
        }
      });

      return issues;
    });

    console.log('=== TOUCH TARGET AUDIT ===');
    console.log(`Total issues: ${touchTargetIssues.length}`);
    touchTargetIssues.forEach(i => console.log(`  - ${i}`));
  });

  test('5. Hover interactions and card actions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Screenshot before hover
    const firstCard = page.locator('[data-testid="book-card"]').first();
    await page.screenshot({ path: 'e2e/screenshots/deep-audit/05-before-hover.png' });

    // Hover on first card
    await firstCard.hover();
    await page.waitForTimeout(400); // Wait for hover animations
    await page.screenshot({ path: 'e2e/screenshots/deep-audit/05-card-hover.png' });

    // Check that action buttons become visible on hover
    const pinButton = firstCard.locator('button[aria-label="Pin"], button[aria-label="Unpin"]');
    const infoButton = firstCard.locator('button[aria-label="Show metadata"]');
    await expect(pinButton).toBeVisible();
    await expect(infoButton).toBeVisible();

    // Check hover transform
    const transform = await firstCard.evaluate((el) => {
      return getComputedStyle(el.querySelector('.library-card')!).transform;
    });
    console.log('=== HOVER STATE ===');
    console.log(`Card transform on hover: ${transform}`);
  });

  test('6. Filter interactions and state feedback', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Screenshot initial state
    await page.screenshot({ path: 'e2e/screenshots/deep-audit/06-filters-default.png' });

    // Click PDF filter
    const pdfFilter = page.getByRole('button', { name: 'PDF' });
    if (await pdfFilter.isVisible()) {
      await pdfFilter.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'e2e/screenshots/deep-audit/06-filters-pdf.png' });

      // Check filter active state is visually distinct
      const isPressed = await pdfFilter.getAttribute('aria-pressed');
      expect(isPressed).toBe('true');

      // Verify the filter results message appears
      const filterInfo = page.locator('text=Showing');
      if (await filterInfo.isVisible()) {
        const text = await filterInfo.textContent();
        console.log(`Filter feedback: ${text}`);
      }
    }

    // Test "Reading" progress filter
    const readingFilter = page.getByRole('button', { name: 'Reading' });
    if (await readingFilter.isVisible()) {
      await readingFilter.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'e2e/screenshots/deep-audit/06-filters-reading.png' });
    }

    // Test clear filters
    const clearBtn = page.getByRole('button', { name: 'Clear filters' });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('7. Search experience', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    const searchInput = page.locator('input[type="search"]');

    // Focus search with keyboard shortcut
    await page.keyboard.press('/');
    await expect(searchInput).toBeFocused();

    // Type search query
    await searchInput.fill('Design');
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'e2e/screenshots/deep-audit/07-search-active.png' });

    // Check clear button appears
    const clearButton = page.locator('button[aria-label="Clear search"]');
    await expect(clearButton).toBeVisible();

    // Test escape to blur
    await page.keyboard.press('Escape');
    await expect(searchInput).not.toBeFocused();

    // Test no results
    await searchInput.fill('xyznonexistentbook');
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'e2e/screenshots/deep-audit/07-search-no-results.png' });
  });

  test('8. Light theme full audit', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Switch to light mode
    await page.getByTitle('Toggle theme').click();
    await page.waitForTimeout(600);

    await page.screenshot({ path: 'e2e/screenshots/deep-audit/08-light-theme-full.png', fullPage: true });

    // Check light mode specific CSS variables
    const cssVars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        bgDeep: style.getPropertyValue('--color-bg-deep').trim(),
        bgSurface: style.getPropertyValue('--color-bg-surface').trim(),
        textPrimary: style.getPropertyValue('--color-text-primary').trim(),
        textSecondary: style.getPropertyValue('--color-text-secondary').trim(),
      };
    });

    console.log('=== LIGHT THEME CSS VARS ===');
    console.log(JSON.stringify(cssVars, null, 2));

    // Hover on card in light mode
    await page.locator('[data-testid="book-card"]').first().hover();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'e2e/screenshots/deep-audit/08-light-hover.png' });
  });

  test('9. List view audit', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Switch to list view
    const listViewBtn = page.locator('button[aria-label="List view"]');
    if (await listViewBtn.isVisible()) {
      await listViewBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'e2e/screenshots/deep-audit/09-list-view.png', fullPage: true });

      // Check list view in light mode too
      await page.getByTitle('Toggle theme').click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: 'e2e/screenshots/deep-audit/09-list-view-light.png', fullPage: true });
    }
  });

  test('10. Mobile layout audit', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Mobile tests only on Chromium');

    // Set mobile viewport
    await page.setViewportSize({ width: 393, height: 851 }); // Pixel 5
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    await page.screenshot({ path: 'e2e/screenshots/deep-audit/10-mobile-default.png', fullPage: true });

    // Check mobile-specific elements
    const mobileFilterBtn = page.locator('button:has-text("Filters")');
    if (await mobileFilterBtn.isVisible()) {
      await mobileFilterBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'e2e/screenshots/deep-audit/10-mobile-filters.png', fullPage: true });

      // Close filters - use the close button inside the sheet instead of backdrop
      // (backdrop click can be intercepted by the sheet overlay)
      const closeBtn = page.locator('#library-filters-sheet button[aria-label="Close"]');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      } else {
        // Fallback: press Escape to close
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }

    // Test mobile light mode
    await page.getByTitle('Toggle theme').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/screenshots/deep-audit/10-mobile-light.png', fullPage: true });
  });

  test('11. Keyboard navigation and focus management', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Tab through interactive elements and check focus visibility
    const focusIssues: string[] = [];

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;

        const style = getComputedStyle(el);
        const outline = style.outline;
        const boxShadow = style.boxShadow;

        return {
          tag: el.tagName,
          text: (el.textContent || '').trim().substring(0, 40),
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
          outline,
          boxShadow,
          hasVisibleFocus: outline !== 'none' || boxShadow !== 'none',
        };
      });

      if (focused && !focused.hasVisibleFocus) {
        focusIssues.push(`No visible focus on: ${focused.tag} "${focused.text}" (role=${focused.role})`);
      }
    }

    console.log('=== KEYBOARD NAVIGATION ===');
    console.log(`Focus visibility issues: ${focusIssues.length}`);
    focusIssues.forEach(i => console.log(`  - ${i}`));

    // Screenshot with focus visible
    await page.keyboard.press('Tab');
    await page.screenshot({ path: 'e2e/screenshots/deep-audit/11-focus-state.png' });
  });

  test('12. Animation and transition performance', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Measure long animation frame durations during card hover
    const animationMetrics = await page.evaluate(async () => {
      return new Promise<{ longFrames: number; maxFrameTime: number }>((resolve) => {
        let longFrames = 0;
        let maxFrameTime = 0;
        let lastTime = performance.now();
        let frames = 0;

        function measure(time: number) {
          const delta = time - lastTime;
          if (delta > 16.67) longFrames++;
          if (delta > maxFrameTime) maxFrameTime = delta;
          lastTime = time;
          frames++;
          if (frames < 60) {
            requestAnimationFrame(measure);
          } else {
            resolve({ longFrames, maxFrameTime: Math.round(maxFrameTime) });
          }
        }

        requestAnimationFrame(measure);
      });
    });

    console.log('=== ANIMATION PERFORMANCE ===');
    console.log(`Long frames (>16.67ms): ${animationMetrics.longFrames}`);
    console.log(`Max frame time: ${animationMetrics.maxFrameTime}ms`);

    // Check for excessive DOM nodes
    const domMetrics = await page.evaluate(() => {
      const allNodes = document.querySelectorAll('*');
      const hiddenNodes = Array.from(allNodes).filter(el => {
        const style = getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden';
      });
      return {
        totalNodes: allNodes.length,
        hiddenNodes: hiddenNodes.length,
      };
    });

    console.log('=== DOM METRICS ===');
    console.log(`Total DOM nodes: ${domMetrics.totalNodes}`);
    console.log(`Hidden nodes: ${domMetrics.hiddenNodes}`);
  });

  test('13. Continue reading section', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // The "Continue Reading" section should be visible with our mock data
    const continueReading = page.locator('text=Continue Reading');
    if (await continueReading.isVisible()) {
      await page.screenshot({ path: 'e2e/screenshots/deep-audit/13-continue-reading.png' });

      // Hover on continue reading card
      const crCard = page.locator('.continue-reading-glow').first();
      if (await crCard.isVisible()) {
        await crCard.hover();
        await page.waitForTimeout(400);
        await page.screenshot({ path: 'e2e/screenshots/deep-audit/13-continue-reading-hover.png' });
      }
    }
  });

  test('14. Empty states and error handling', async ({ page }) => {
    // Test empty library
    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');
    await page.waitForSelector('text=Your library awaits');
    await page.screenshot({ path: 'e2e/screenshots/deep-audit/14-empty-state.png', fullPage: true });

    // Check empty state styling
    const emptyStateBox = await page.locator('.animate-float').boundingBox();
    console.log('=== EMPTY STATE ===');
    console.log(`Empty state element dimensions: ${emptyStateBox?.width}x${emptyStateBox?.height}`);
  });

  test('15. Stats bar overflow and alignment', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Check stats bar
    const statsBar = page.locator('[aria-label="Library statistics"]');
    if (await statsBar.isVisible()) {
      const box = await statsBar.boundingBox();
      const overflows = await statsBar.evaluate((el) => {
        return {
          overflowX: el.scrollWidth > el.clientWidth,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        };
      });

      console.log('=== STATS BAR ===');
      console.log(`Dimensions: ${box?.width}x${box?.height}`);
      console.log(`Overflows: ${JSON.stringify(overflows)}`);

      await page.screenshot({ path: 'e2e/screenshots/deep-audit/15-stats-bar.png' });
    }
  });

  test('16. Rating interaction audit', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Find a card with a rating and click the rating button
    const ratingBtn = page.locator('[data-testid="book-card"]').first().locator('button[aria-haspopup="true"]');
    if (await ratingBtn.isVisible()) {
      await ratingBtn.click();
      await page.waitForTimeout(300);

      // Check rating popup is visible and properly positioned
      const ratingMenu = page.locator('[role="radiogroup"][aria-label="Select rating"]');
      if (await ratingMenu.isVisible()) {
        await page.screenshot({ path: 'e2e/screenshots/deep-audit/16-rating-open.png' });

        // Check star buttons are accessible
        const stars = ratingMenu.locator('[role="radio"]');
        const starCount = await stars.count();
        expect(starCount).toBe(5);
      }
    }
  });

  test('17. Responsive breakpoint transitions', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Resize tests only on Chromium');

    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    const breakpoints = [
      { width: 1920, height: 1080, name: '1080p' },
      { width: 1280, height: 800, name: 'laptop' },
      { width: 1024, height: 768, name: 'tablet-landscape' },
      { width: 768, height: 1024, name: 'tablet-portrait' },
      { width: 640, height: 960, name: 'small-tablet' },
      { width: 375, height: 812, name: 'phone' },
    ];

    for (const bp of breakpoints) {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.waitForTimeout(300);

      // Count visible columns
      const cards = page.locator('[data-testid="book-card"]');
      const firstCardBox = await cards.first().boundingBox();
      const secondCardBox = await cards.nth(1).boundingBox();

      let columns = 'unknown';
      if (firstCardBox && secondCardBox) {
        if (Math.abs(firstCardBox.y - secondCardBox.y) < 5) {
          // Cards are in the same row
          columns = `${Math.round(bp.width / firstCardBox.width)}`;
        } else {
          columns = '1';
        }
      }

      await page.screenshot({ path: `e2e/screenshots/deep-audit/17-breakpoint-${bp.name}.png` });
      console.log(`Breakpoint ${bp.name} (${bp.width}px): ~${columns} columns`);
    }
  });

  test('18. Prefers-reduced-motion compliance', async ({ page }) => {
    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]');

    // Check that animations are suppressed
    const animationState = await page.evaluate(() => {
      const card = document.querySelector('.library-card');
      if (!card) return null;
      const style = getComputedStyle(card);
      return {
        transitionDuration: style.transitionDuration,
        animationDuration: style.animationDuration,
      };
    });

    console.log('=== REDUCED MOTION ===');
    console.log(JSON.stringify(animationState, null, 2));

    await page.screenshot({ path: 'e2e/screenshots/deep-audit/18-reduced-motion.png' });
  });
});
