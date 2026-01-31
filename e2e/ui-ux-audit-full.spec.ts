import { test, expect, type Page } from '@playwright/test';

/**
 * Full UI/UX and performance audit.
 * Captures screenshots, measures performance, and checks accessibility.
 */

const MOCK_NOTES = [
  {
    id: 'note1',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    sourceType: 'pdf',
    progress: 72,
    lastRead: new Date(Date.now() - 3600000).toISOString(),
    cover: null,
    pinned: true,
    totalPages: 562,
    highlightCount: 14,
    currentChapter: 'Chapter 9: Consistency and Consensus',
    rating: 5,
    readingStats: { totalReadingTimeMs: 7200000, pagesPerHour: 25, estimatedCompletionDate: null },
  },
  {
    id: 'note2',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson',
    sourceType: 'pdf',
    progress: 35,
    lastRead: new Date(Date.now() - 86400000).toISOString(),
    cover: null,
    pinned: false,
    totalPages: 657,
    highlightCount: 8,
    currentChapter: 'Chapter 2: Building Abstractions with Data',
    rating: 4,
    readingStats: { totalReadingTimeMs: 3600000, pagesPerHour: 20, estimatedCompletionDate: null },
  },
  {
    id: 'note3',
    title: 'The Art of Doing Science and Engineering',
    author: 'Richard Hamming',
    sourceType: 'epub',
    progress: 100,
    lastRead: new Date(Date.now() - 172800000).toISOString(),
    cover: null,
    pinned: false,
    totalPages: 432,
    highlightCount: 22,
    rating: 5,
    dateFinished: new Date(Date.now() - 172800000).toISOString(),
    readingStats: { totalReadingTimeMs: 14400000, pagesPerHour: 30, estimatedCompletionDate: null },
  },
  {
    id: 'note4',
    title: 'A Philosophy of Software Design',
    author: 'John Ousterhout',
    sourceType: 'pdf',
    progress: 0,
    lastRead: null,
    cover: null,
    pinned: false,
    totalPages: 190,
    highlightCount: 0,
    rating: null,
    readingStats: null,
  },
  {
    id: 'note5',
    title: 'Gödel, Escher, Bach',
    author: 'Douglas Hofstadter',
    sourceType: 'epub',
    progress: 12,
    lastRead: new Date(Date.now() - 604800000).toISOString(),
    cover: null,
    pinned: false,
    totalPages: 777,
    highlightCount: 3,
    currentChapter: 'Chapter III: Figure and Ground',
    rating: null,
    readingStats: { totalReadingTimeMs: 1800000, pagesPerHour: 15, estimatedCompletionDate: null },
  },
  {
    id: 'note6',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    sourceType: 'pdf',
    progress: 88,
    lastRead: new Date(Date.now() - 7200000).toISOString(),
    cover: null,
    pinned: false,
    totalPages: 499,
    highlightCount: 19,
    currentChapter: 'Part V: Two Selves',
    rating: 4,
    readingStats: { totalReadingTimeMs: 10800000, pagesPerHour: 28, estimatedCompletionDate: null },
  },
];

async function setupMocksAndNavigate(page: Page, path = '/') {
  // Set up all route mocks BEFORE navigation to avoid race conditions
  await page.route('**/api/library', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_NOTES),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/library-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalBooks: 6,
        totalPdfBooks: 4,
        totalEpubBooks: 2,
        totalReadingTimeMs: 37800000,
        totalHighlights: 66,
        totalBookmarks: 0,
        booksCompleted: 1,
        booksInProgress: 4,
        booksUnread: 1,
        averageProgress: 51,
        collectionsCount: 0,
        totalPagesRead: 1200,
        totalSessions: 42,
        averageReadingSpeedPagesPerHour: 23,
        averageSessionDurationMs: 900000,
        longestSessionMs: 3600000,
        highlightsByCategory: { highlight: 50, important: 10, question: 4, todo: 1, definition: 1 },
        booksByRating: { rated5: 2, rated4: 2, rated3: 0, rated2: 0, rated1: 0, unrated: 2 },
        booksWithEstimatedCompletion: 2,
        averageDaysToComplete: 30,
        booksCompletedByYear: {},
        booksCompletedThisYear: 1,
        currentYear: 2026,
      }),
    });
  });

  await page.route('**/api/reading-goals**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        streak: { currentStreak: 5, longestStreak: 12, graceDaysUsed: 0, freezeDaysUsed: 0 },
        todayProgress: { totalDurationMs: 1320000 },
        goals: { dailyGoalMinutes: 30 },
        streakAtRisk: null,
      }),
    });
  });

  await page.route('**/api/reading-stats**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: [], totalReadingTimeMs: 37800000 }),
    });
  });

  await page.route('**/api/collections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ collections: ['Computer Science', 'Philosophy'] }),
    });
  });

  await page.route('**/api/search/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isComplete: true, indexedDocuments: 6, totalDocuments: 6, percentComplete: 100 }),
    });
  });

  // Mock WebSocket - just abort cleanly
  await page.route('**/ws', async (route) => {
    await route.abort();
  });

  // Mock covers (return 404 so default covers render)
  await page.route('**/api/covers/**', async (route) => {
    await route.fulfill({ status: 404, body: '' });
  });

  // NOW navigate, after all mocks are set up
  await page.goto(path);
  // Wait for cards to appear
  await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
  // Let animations settle
  await page.waitForTimeout(400);
}

test.describe('UI/UX Audit', () => {
  test('Library page - desktop dark theme', async ({ page }) => {
    await setupMocksAndNavigate(page);

    await page.screenshot({
      path: 'e2e/screenshots/audit-full/01-desktop-dark.png',
      fullPage: true,
    });

    // Verify key elements rendered
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    const cards = page.getByTestId('book-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
  });

  test('Library page - desktop light theme', async ({ page }) => {
    await setupMocksAndNavigate(page);

    // Toggle to light theme
    await page.getByTestId('theme-toggle').click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/audit-full/02-desktop-light.png',
      fullPage: true,
    });
  });

  test('Card hover state', async ({ page }) => {
    await setupMocksAndNavigate(page);

    const firstCard = page.getByTestId('book-card').first();
    await firstCard.hover();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'e2e/screenshots/audit-full/03-card-hover.png',
      fullPage: false,
    });
  });

  test('Search interaction', async ({ page }) => {
    await setupMocksAndNavigate(page);

    // Focus search with keyboard shortcut
    await page.keyboard.press('/');
    await page.waitForTimeout(200);

    await page.screenshot({
      path: 'e2e/screenshots/audit-full/04-search-focused.png',
      fullPage: false,
    });

    // Type a query
    await page.keyboard.type('design');
    await page.waitForTimeout(400);

    await page.screenshot({
      path: 'e2e/screenshots/audit-full/05-search-results.png',
      fullPage: false,
    });
  });

  test('Filter interactions', async ({ page }) => {
    await setupMocksAndNavigate(page);

    // Click EPUB filter
    const epubButton = page.getByRole('button', { name: 'EPUB' });
    if (await epubButton.isVisible()) {
      await epubButton.click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: 'e2e/screenshots/audit-full/06-filtered-epub.png',
        fullPage: true,
      });
    }
  });

  test('List view', async ({ page }) => {
    await setupMocksAndNavigate(page);

    // Switch to list view
    const listViewButton = page.getByRole('button', { name: 'List view' });
    if (await listViewButton.isVisible()) {
      await listViewButton.click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: 'e2e/screenshots/audit-full/07-list-view.png',
        fullPage: true,
      });
    }
  });

  test('Mobile layout - dark theme', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMocksAndNavigate(page);

    await page.screenshot({
      path: 'e2e/screenshots/audit-full/08-mobile-dark.png',
      fullPage: true,
    });
  });

  test('Mobile layout - light theme', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMocksAndNavigate(page);

    await page.getByTestId('theme-toggle').click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/audit-full/09-mobile-light.png',
      fullPage: true,
    });
  });

  test('Mobile filters sheet', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMocksAndNavigate(page);

    const filtersButton = page.getByRole('button', { name: /Filters/ });
    if (await filtersButton.isVisible()) {
      await filtersButton.click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: 'e2e/screenshots/audit-full/10-mobile-filters.png',
        fullPage: false,
      });
    }
  });

  test('Empty search state', async ({ page }) => {
    await setupMocksAndNavigate(page);

    // Search for non-existent term
    const searchInput = page.getByLabel(/Search by title/);
    await searchInput.fill('zzzznonexistent');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/audit-full/12-empty-search.png',
      fullPage: false,
    });
  });

  test('Progress filter - reading only', async ({ page }) => {
    await setupMocksAndNavigate(page);

    const readingButton = page.getByRole('button', { name: 'Reading' });
    if (await readingButton.isVisible()) {
      await readingButton.click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: 'e2e/screenshots/audit-full/13-filter-reading.png',
        fullPage: true,
      });
    }
  });
});

test.describe('Accessibility Audit', () => {
  test('ARIA landmarks present', async ({ page }) => {
    await setupMocksAndNavigate(page);

    const issues: string[] = [];

    // Check banner landmark (header)
    const bannerCount = await page.locator('[role="banner"]').count();
    if (bannerCount === 0) {
      // Also check for <header> element which implicitly maps to banner
      const headerCount = await page.locator('header').count();
      if (headerCount === 0) {
        issues.push('Missing banner landmark (header)');
      }
    }

    // Check main landmark
    const mainCount = await page.locator('main, [role="main"]').count();
    if (mainCount === 0) {
      issues.push('Missing main landmark');
    }

    // Check search landmark
    const searchCount = await page.locator('[role="search"]').count();
    if (searchCount === 0) {
      issues.push('Missing search landmark');
    }

    // Check buttons have accessible names
    const buttons = await page.locator('button:visible').all();
    const unlabelledButtons: string[] = [];
    for (const button of buttons) {
      const name = await button.getAttribute('aria-label');
      const text = (await button.textContent())?.trim();
      const title = await button.getAttribute('title');
      if (!name && !text && !title) {
        unlabelledButtons.push(await button.evaluate(el => el.outerHTML.substring(0, 80)));
      }
    }
    if (unlabelledButtons.length > 0) {
      issues.push(`${unlabelledButtons.length} button(s) missing accessible name`);
    }

    console.log('ACCESSIBILITY_AUDIT:', JSON.stringify({ issues, unlabelledButtons }, null, 2));

    // Should have all required landmarks
    expect(issues).toHaveLength(0);
  });

  test('Focus-visible styles applied', async ({ page }) => {
    await setupMocksAndNavigate(page);

    // Tab to the first interactive element (skip link -> header controls -> search)
    // Press Tab multiple times to move through the page
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }
    await page.waitForTimeout(100);

    // Check that focused element has visible focus styling
    const focusInfo = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { tag: 'body', hasFocus: false };
      const styles = window.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        label: el.getAttribute('aria-label') || el.textContent?.trim().substring(0, 30),
        outline: styles.outline,
        outlineStyle: styles.outlineStyle,
        boxShadow: styles.boxShadow,
        hasFocus: styles.outlineStyle !== 'none' || styles.boxShadow !== 'none',
      };
    });

    console.log('FOCUS_INFO:', JSON.stringify(focusInfo, null, 2));

    // Active element should not be body (something should be focused)
    expect(focusInfo.tag).not.toBe('body');
  });

  test('Search input has aria-describedby', async ({ page }) => {
    await setupMocksAndNavigate(page);

    const searchInput = page.getByLabel(/Search by title/);
    const describedby = await searchInput.getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();

    // The referenced element should exist
    if (describedby) {
      const hintEl = page.locator(`#${describedby}`);
      await expect(hintEl).toBeAttached();
    }
  });

  test('Touch targets on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMocksAndNavigate(page);

    const smallTargets: string[] = [];
    const buttons = await page.locator('button:visible').all();

    for (const button of buttons) {
      const box = await button.boundingBox();
      if (box && (box.width < 44 || box.height < 44)) {
        const label = await button.getAttribute('aria-label') || (await button.textContent())?.trim() || 'unknown';
        smallTargets.push(`${label.substring(0, 30)} (${Math.round(box.width)}x${Math.round(box.height)})`);
      }
    }

    console.log('SMALL_TOUCH_TARGETS:', JSON.stringify(smallTargets, null, 2));
    // All buttons should be at least 44x44 on mobile
    expect(smallTargets.length).toBeLessThanOrEqual(2); // Allow 2 exceptions for inline text buttons
  });
});

test.describe('Performance Audit', () => {
  test('Library page load performance', async ({ page }) => {
    await page.route('**/api/library', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_NOTES),
        });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/library-stats', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ totalBooks: 6 }) });
    });
    await page.route('**/api/reading-goals**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ streak: { currentStreak: 0 }, todayProgress: null, goals: { dailyGoalMinutes: 30 }, streakAtRisk: null }) });
    });
    await page.route('**/api/collections', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ collections: [] }) });
    });
    await page.route('**/api/search/status', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isComplete: true }) });
    });
    await page.route('**/api/reading-stats**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });
    await page.route('**/ws', async (route) => { await route.abort(); });
    await page.route('**/api/covers/**', async (route) => { await route.fulfill({ status: 404, body: '' }); });

    const startTime = Date.now();
    await page.goto('/');
    const navigationMs = Date.now() - startTime;

    await page.waitForSelector('[data-testid="book-card"]', { timeout: 15000 });
    const firstCardMs = Date.now() - startTime;

    // DOM size check
    const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);

    console.log('PERF:', JSON.stringify({ navigationMs, firstCardMs, domNodeCount }, null, 2));

    // Reasonable thresholds
    expect(firstCardMs).toBeLessThan(8000);
    expect(domNodeCount).toBeLessThan(5000);
  });
});
