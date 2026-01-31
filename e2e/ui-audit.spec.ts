import { test, expect, Page } from '@playwright/test';

const NOW = Date.now();
const HOUR = 3600000;
const DAY = 86400000;

const mockLibrary = [
  {
    id: 'book-1',
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    sourceType: 'pdf',
    source: '/books/design-things.pdf',
    path: '/books/design-things.pdf',
    progress: 73,
    totalPages: 368,
    currentPage: 269,
    lastRead: new Date(NOW - HOUR * 2).toISOString(),
    dateCreated: new Date(NOW - DAY * 30).toISOString(),
    cover: null,
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
      estimatedCompletionDate: null,
    },
  },
  {
    id: 'book-2',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    sourceType: 'pdf',
    source: '/books/thinking.pdf',
    path: '/books/thinking.pdf',
    progress: 45,
    totalPages: 499,
    currentPage: 225,
    lastRead: new Date(NOW - HOUR * 6).toISOString(),
    dateCreated: new Date(NOW - DAY * 45).toISOString(),
    cover: null,
    rating: 4,
    pinned: false,
    highlightCount: 8,
    currentChapter: null,
    readingStats: {
      totalReadingTimeMs: 14400000,
      totalPagesRead: 225,
      pagesPerHour: 15,
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
    source: '/books/clean-code.pdf',
    path: '/books/clean-code.pdf',
    progress: 100,
    totalPages: 464,
    currentPage: 464,
    lastRead: new Date(NOW - DAY * 7).toISOString(),
    dateCreated: new Date(NOW - DAY * 90).toISOString(),
    dateFinished: new Date(NOW - DAY * 7).toISOString(),
    cover: null,
    rating: 5,
    pinned: false,
    highlightCount: 25,
    currentChapter: null,
    readingStats: {
      totalReadingTimeMs: 28800000,
      totalPagesRead: 464,
      pagesPerHour: 16,
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
    source: '/books/pragmatic.epub',
    path: '/books/pragmatic.epub',
    progress: 15,
    totalPages: 352,
    currentPage: 53,
    lastRead: new Date(NOW - DAY * 2).toISOString(),
    dateCreated: new Date(NOW - DAY * 14).toISOString(),
    cover: null,
    rating: 0,
    pinned: false,
    highlightCount: 2,
    currentChapter: 'Chapter 2: A Pragmatic Approach',
    readingStats: {
      totalReadingTimeMs: 3600000,
      totalPagesRead: 53,
      pagesPerHour: 14,
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
    source: '/books/refactoring.pdf',
    path: '/books/refactoring.pdf',
    progress: 0,
    totalPages: 448,
    currentPage: 0,
    lastRead: null,
    dateCreated: new Date(NOW - DAY * 3).toISOString(),
    cover: null,
    rating: 0,
    pinned: false,
    highlightCount: 0,
    currentChapter: null,
    readingStats: null,
  },
  {
    id: 'book-6',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson, Gerald Jay Sussman',
    sourceType: 'pdf',
    source: '/books/sicp.pdf',
    path: '/books/sicp.pdf',
    progress: 28,
    totalPages: 657,
    currentPage: 184,
    lastRead: new Date(NOW - DAY * 5).toISOString(),
    dateCreated: new Date(NOW - DAY * 60).toISOString(),
    cover: null,
    rating: 5,
    pinned: true,
    highlightCount: 18,
    currentChapter: null,
    readingStats: {
      totalReadingTimeMs: 10800000,
      totalPagesRead: 184,
      pagesPerHour: 12,
      lastSessionDate: new Date(NOW - DAY * 5).toISOString(),
      sessionsCount: 8,
      estimatedCompletionDate: null,
    },
  },
];

const mockReadingGoals = {
  streak: { currentStreak: 5, longestStreak: 12, graceDaysUsed: 0, freezeDaysUsed: 0 },
  todayProgress: { totalDurationMs: 1200000, pagesRead: 8 },
  goals: { dailyGoalMinutes: 30 },
  streakAtRisk: null,
};

const mockLibraryStats = {
  totalBooks: 6,
  booksCompleted: 1,
  booksInProgress: 4,
  booksUnread: 1,
  totalReadingTimeMs: 75600000,
  totalHighlights: 65,
  booksCompletedThisYear: 1,
  currentYear: 2026,
};

async function setupMocks(page: Page) {
  await page.route('**/api/library', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockLibrary),
    });
  });

  await page.route('**/api/reading-goals**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReadingGoals),
    });
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
      body: JSON.stringify({ collections: ['Programming', 'Design'] }),
    });
  });

  await page.route('**/api/covers/**', async (route) => {
    await route.fulfill({ status: 404 });
  });

  await page.route('**/api/search/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [] }),
    });
  });

  await page.route('**/api/search-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isComplete: true, indexedDocuments: 6, totalDocuments: 6, percentComplete: 100 }),
    });
  });
}

test.describe('UI/UX Audit', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('desktop dark theme - full page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/screenshots/audit/01-desktop-dark.png', fullPage: true });
  });

  test('desktop light theme - full page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    // Toggle to light theme
    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/screenshots/audit/02-desktop-light.png', fullPage: true });
  });

  test('card hover state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    await page.waitForTimeout(300);
    // Hover over second book card (first unpinned)
    const cards = page.locator('[data-testid="book-card"]');
    const card = cards.nth(2);
    await card.hover();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'e2e/screenshots/audit/03-card-hover.png', fullPage: true });
  });

  test('list view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    // Switch to list view
    const listBtn = page.locator('button[aria-label="List view"]');
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: 'e2e/screenshots/audit/04-list-view.png', fullPage: true });
  });

  test('search interaction', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    const search = page.locator('input[type="search"]').first();
    await search.fill('design');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit/05-search.png', fullPage: true });
  });

  test('filter - PDF only', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    // Click PDF filter
    const pdfBtn = page.getByRole('button', { name: 'PDF' });
    if (await pdfBtn.isVisible()) {
      await pdfBtn.click();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: 'e2e/screenshots/audit/06-filtered-pdf.png', fullPage: true });
  });

  test('mobile dark theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/screenshots/audit/07-mobile-dark.png', fullPage: true });
  });

  test('mobile light theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/screenshots/audit/08-mobile-light.png', fullPage: true });
  });

  test('mobile filters open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    const filterBtn = page.locator('button:has-text("Filters")');
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: 'e2e/screenshots/audit/09-mobile-filters.png', fullPage: true });
  });

  test('empty search state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    const search = page.locator('input[type="search"]').first();
    await search.fill('xyznonexistent');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit/10-empty-search.png', fullPage: true });
  });

  test('loading state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Override with delayed response
    await page.route('**/api/library', async (route) => {
      await new Promise(r => setTimeout(r, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLibrary),
      });
    });
    await page.goto('/');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/audit/11-loading.png', fullPage: true });
  });

  test('keyboard focus navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    // Tab through elements to check focus visibility
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
    }
    await page.screenshot({ path: 'e2e/screenshots/audit/12-focus.png', fullPage: true });
  });

  test('performance - layout shift measurement', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let totalCLS = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              totalCLS += (entry as any).value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(totalCLS);
        }, 2000);
      });
    });

    console.log(`CLS: ${cls.toFixed(4)}`);
    expect(cls).toBeLessThan(0.1);
  });

  test('performance - first contentful paint', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });

    const fcp = await page.evaluate(() => {
      const entry = performance.getEntriesByName('first-contentful-paint')[0];
      return entry?.startTime ?? null;
    });

    console.log(`FCP: ${fcp?.toFixed(0)}ms`);
    if (fcp) {
      expect(fcp).toBeLessThan(2000);
    }
  });

  test('accessibility - heading structure', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });

    const headings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((el) => ({
        level: parseInt(el.tagName[1]),
        text: el.textContent?.trim().slice(0, 60),
        visible: (el as HTMLElement).offsetParent !== null,
      }));
    });

    console.log('Heading structure:');
    headings.forEach((h) => console.log(`  H${h.level}: "${h.text}" (visible: ${h.visible})`));

    // Should have exactly one H1
    const h1s = headings.filter((h) => h.level === 1);
    expect(h1s.length).toBe(1);
  });

  test('accessibility - buttons without labels', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });

    const unlabeledButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).filter((btn) => {
        const hasText = btn.textContent?.trim().length > 0;
        const hasAriaLabel = btn.hasAttribute('aria-label');
        const hasTitle = btn.hasAttribute('title');
        const hasAriaLabelledBy = btn.hasAttribute('aria-labelledby');
        return !hasText && !hasAriaLabel && !hasTitle && !hasAriaLabelledBy;
      }).map((btn) => ({
        html: btn.outerHTML.slice(0, 120),
        classes: btn.className.slice(0, 80),
      }));
    });

    console.log(`Unlabeled buttons: ${unlabeledButtons.length}`);
    unlabeledButtons.forEach((b) => console.log(`  ${b.html}`));
  });

  test('accessibility - touch target sizes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });

    const smallTargets = await page.evaluate(() => {
      const interactive = document.querySelectorAll('button, a, input, select, [role="button"]');
      const small: { tag: string; label: string; width: number; height: number }[] = [];
      interactive.forEach((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          small.push({
            tag: el.tagName.toLowerCase(),
            label: (el as HTMLElement).getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || '',
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      });
      return small;
    });

    console.log(`Small touch targets (< 44px): ${smallTargets.length}`);
    smallTargets.forEach((t) => console.log(`  <${t.tag}> "${t.label}" ${t.width}x${t.height}`));
  });

  test('visual - text contrast check', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="book-card"]', { timeout: 10000 });

    const contrastIssues = await page.evaluate(() => {
      function getLuminance(r: number, g: number, b: number): number {
        const [rs, gs, bs] = [r, g, b].map((c) => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function getContrastRatio(l1: number, l2: number): number {
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function parseColor(color: string): [number, number, number] | null {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        return null;
      }

      const issues: { text: string; fg: string; bg: string; ratio: number }[] = [];
      const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button, label');

      textElements.forEach((el) => {
        const style = getComputedStyle(el as Element);
        const text = el.textContent?.trim().slice(0, 30);
        if (!text) return;

        const fg = parseColor(style.color);
        const bg = parseColor(style.backgroundColor);

        if (fg && bg) {
          const fgLum = getLuminance(...fg);
          const bgLum = getLuminance(...bg);
          const ratio = getContrastRatio(fgLum, bgLum);

          // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
          const fontSize = parseFloat(style.fontSize);
          const isBold = parseInt(style.fontWeight) >= 700;
          const isLarge = fontSize >= 18 || (fontSize >= 14 && isBold);
          const threshold = isLarge ? 3 : 4.5;

          if (ratio < threshold) {
            issues.push({
              text,
              fg: style.color,
              bg: style.backgroundColor,
              ratio: parseFloat(ratio.toFixed(2)),
            });
          }
        }
      });

      return issues.slice(0, 10);
    });

    console.log(`Contrast issues: ${contrastIssues.length}`);
    contrastIssues.forEach((i) => console.log(`  "${i.text}" ratio=${i.ratio} (fg=${i.fg}, bg=${i.bg})`));
  });
});
