import { test, expect, type Page } from '@playwright/test';

// Comprehensive mock library with diverse states for thorough testing
const MOCK_LIBRARY = [
  {
    id: 'continue-reading',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    sourceType: 'pdf',
    source: '/test/ddia.pdf',
    cover: '/api/covers/continue-reading',
    progress: 67,
    totalPages: 562,
    lastRead: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    pinned: false,
    paused: false,
    pausedAt: null,
    highlightCount: 24,
    rating: 5,
    currentChapter: 'Chapter 9: Consistency and Consensus',
    readingStats: { totalReadingTimeMs: 7200000, totalSessions: 12, averageSessionMs: 600000, firstReadDate: null, pagesPerHour: 30, totalPagesRead: 376, longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null },
    collections: ['Computer Science'],
    dateCreated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    citekey: null,
    csl: null,
  },
  {
    id: 'pinned-1',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson, Gerald Jay Sussman',
    sourceType: 'pdf',
    source: '/test/sicp.pdf',
    cover: '/api/covers/pinned-1',
    progress: 12,
    totalPages: 657,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    pinned: true,
    paused: false,
    pausedAt: null,
    highlightCount: 5,
    rating: 4,
    currentChapter: null,
    readingStats: { totalReadingTimeMs: 1800000, totalSessions: 4, averageSessionMs: 450000, firstReadDate: null, pagesPerHour: 25, totalPagesRead: 79, longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null },
    collections: ['Computer Science'],
    dateCreated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    citekey: null,
    csl: null,
  },
  {
    id: 'pinned-2',
    title: 'The Art of Doing Science and Engineering',
    author: 'Richard Hamming',
    sourceType: 'epub',
    source: '/test/hamming.epub',
    cover: '/api/covers/pinned-2',
    progress: 45,
    totalPages: 400,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    pinned: true,
    paused: false,
    pausedAt: null,
    highlightCount: 8,
    rating: null,
    currentChapter: null,
    readingStats: { totalReadingTimeMs: 3600000, totalSessions: 6, averageSessionMs: 600000, firstReadDate: null, pagesPerHour: 35, totalPagesRead: 180, longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null },
    collections: [],
    dateCreated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    citekey: null,
    csl: null,
  },
  {
    id: 'completed-1',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    sourceType: 'epub',
    source: '/test/tfs.epub',
    cover: null,
    progress: 100,
    totalPages: 499,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    pinned: false,
    paused: false,
    pausedAt: null,
    highlightCount: 42,
    rating: 4,
    currentChapter: null,
    dateFinished: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    yearCompleted: 2025,
    readingStats: { totalReadingTimeMs: 14400000, totalSessions: 20, averageSessionMs: 720000, firstReadDate: null, pagesPerHour: 28, totalPagesRead: 499, longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null },
    collections: ['Psychology'],
    dateCreated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
    citekey: null,
    csl: null,
  },
  {
    id: 'unread-1',
    title: 'Category Theory for Programmers',
    author: 'Bartosz Milewski',
    sourceType: 'pdf',
    source: '/test/ctfp.pdf',
    cover: null,
    progress: 0,
    totalPages: 498,
    lastRead: null,
    pinned: false,
    paused: false,
    pausedAt: null,
    highlightCount: 0,
    rating: null,
    currentChapter: null,
    readingStats: null,
    collections: ['Computer Science'],
    dateCreated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    citekey: null,
    csl: null,
  },
  {
    id: 'reading-2',
    title: 'Gödel, Escher, Bach: An Eternal Golden Braid',
    author: 'Douglas Hofstadter',
    sourceType: 'epub',
    source: '/test/geb.epub',
    cover: '/api/covers/reading-2',
    progress: 34,
    totalPages: 777,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    pinned: false,
    paused: false,
    pausedAt: null,
    highlightCount: 15,
    rating: 5,
    currentChapter: 'Chapter XII: Minds and Thoughts',
    readingStats: { totalReadingTimeMs: 5400000, totalSessions: 8, averageSessionMs: 675000, firstReadDate: null, pagesPerHour: 20, totalPagesRead: 264, longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null },
    collections: ['Philosophy'],
    dateCreated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    citekey: null,
    csl: null,
  },
  {
    id: 'unread-2',
    title: 'The Pragmatic Programmer',
    author: 'David Thomas, Andrew Hunt',
    sourceType: 'pdf',
    source: '/test/pragmatic.pdf',
    cover: '/api/covers/unread-2',
    progress: 0,
    totalPages: 352,
    lastRead: null,
    pinned: false,
    paused: false,
    pausedAt: null,
    highlightCount: 0,
    rating: null,
    currentChapter: null,
    readingStats: null,
    collections: ['Computer Science'],
    dateCreated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    citekey: null,
    csl: null,
  },
  {
    id: 'completed-2',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    sourceType: 'epub',
    source: '/test/meditations.epub',
    cover: null,
    progress: 100,
    totalPages: 256,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    pinned: false,
    paused: false,
    pausedAt: null,
    highlightCount: 31,
    rating: 5,
    currentChapter: null,
    dateFinished: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    yearCompleted: 2025,
    readingStats: { totalReadingTimeMs: 10800000, totalSessions: 15, averageSessionMs: 720000, firstReadDate: null, pagesPerHour: 40, totalPagesRead: 256, longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null },
    collections: ['Philosophy'],
    dateCreated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 180).toISOString(),
    citekey: null,
    csl: null,
  },
];

const COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#6c5ce7" rx="4"/><text x="100" y="150" text-anchor="middle" fill="white" font-size="14" font-family="sans-serif">Cover</text></svg>`;

async function setupMocks(page: Page) {
  // Use the same broad glob pattern as the existing library.spec.ts
  // This intercepts ALL /api/* calls
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/api/covers/')) {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: COVER_SVG });
      return;
    }
    if (url.includes('/api/library-stats')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalBooks: 8, booksReading: 3, booksCompleted: 2,
          totalHighlights: 125, totalReadingTimeMs: 43200000,
        }),
      });
      return;
    }
    if (url.includes('/api/collections')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ collections: ['Computer Science', 'Philosophy', 'Psychology'] }),
      });
      return;
    }
    if (url.includes('/api/reading-stats')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    if (url.includes('/api/reading-goals')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ goals: [], streak: null }) });
      return;
    }
    if (url.includes('/api/search/status')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ isComplete: true, indexedDocuments: 8, totalDocuments: 8, percentComplete: 100 }),
      });
      return;
    }
    if (url.includes('/api/library')) {
      // Check if it's a specific book request (has ID after /library/)
      const match = url.match(/\/api\/library\/([^/?]+)/);
      if (match) {
        const id = match[1];
        const note = MOCK_LIBRARY.find((n) => n.id === id);
        if (note) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(note) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
        }
      } else {
        // Library list
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_LIBRARY) });
      }
      return;
    }
    // Fallback: let unhandled API calls through
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function loadLibrary(page: Page) {
  await page.goto('/');
  // Wait for either book cards or the empty state text
  await page.waitForSelector('[data-testid="book-card"], [data-testid="theme-toggle"]', { timeout: 15000 });
  await page.waitForTimeout(700); // Let card entrance animations complete
}

test.describe('Focused UI/UX & Performance Audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await setupMocks(page);
  });

  test('01 - Desktop dark theme overview', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/01-desktop-dark.png', fullPage: true });
  });

  test('02 - Desktop light theme overview', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/02-desktop-light.png', fullPage: true });
  });

  test('03 - Card hover state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    const cards = page.locator('[data-testid="book-card"]');
    const count = await cards.count();
    if (count > 0) {
      await cards.first().hover();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/03-card-hover.png', fullPage: false });
  });

  test('04 - List view dark', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    const listBtn = page.locator('button[aria-label="List view"]');
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/04-list-view-dark.png', fullPage: true });
  });

  test('05 - List view light', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    const listBtn = page.locator('button[aria-label="List view"]');
    if (await listBtn.isVisible()) await listBtn.click();
    await page.waitForTimeout(200);

    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/05-list-view-light.png', fullPage: true });
  });

  test('06 - Search focused and active', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    const searchInput = page.locator('input[type="search"]');
    if (await searchInput.isVisible()) {
      await searchInput.focus();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'e2e/screenshots/audit-focused/06-search-focused.png', fullPage: false });

      await searchInput.fill('Data');
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'e2e/screenshots/audit-focused/07-search-active.png', fullPage: false });
    }
  });

  test('08 - Filter: Reading status', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    const readingBtn = page.locator('button[aria-pressed]', { hasText: 'Reading' });
    if (await readingBtn.isVisible()) {
      await readingBtn.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/08-filtered-reading.png', fullPage: true });
  });

  test('09 - Empty filter state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    const searchInput = page.locator('input[type="search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('xyznonexistent');
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/09-empty-filter.png', fullPage: false });
  });

  test('10 - Mobile dark', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loadLibrary(page);

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/10-mobile-dark.png', fullPage: true });
  });

  test('11 - Mobile light', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loadLibrary(page);

    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/11-mobile-light.png', fullPage: true });
  });

  test('12 - Mobile filters', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loadLibrary(page);

    const filtersBtn = page.locator('button', { hasText: 'Filters' });
    if (await filtersBtn.isVisible()) {
      await filtersBtn.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/12-mobile-filters.png', fullPage: false });
  });

  test('13 - Tablet layout', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loadLibrary(page);

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/13-tablet.png', fullPage: true });
  });

  test('14 - Continue reading hover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    const continueCard = page.locator('.continue-reading-glow').first();
    if (await continueCard.isVisible()) {
      await continueCard.hover();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: 'e2e/screenshots/audit-focused/14-continue-reading-hover.png', fullPage: false });
  });

  test('15 - Performance & accessibility audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    // === DOM Complexity ===
    const domMetrics = await page.evaluate(() => {
      const result: Record<string, number> = {};
      result.domNodeCount = document.querySelectorAll('*').length;
      result.bookCardCount = document.querySelectorAll('[data-testid="book-card"]').length;
      // Count animation elements that are running (not paused)
      result.animatingElements = document.querySelectorAll('[class*="animate-"]').length;

      // Max DOM depth
      let maxDepth = 0;
      const walk = (node: Element, depth: number) => {
        if (depth > maxDepth) maxDepth = depth;
        for (const child of node.children) walk(child, depth + 1);
      };
      walk(document.documentElement, 0);
      result.maxDomDepth = maxDepth;
      return result;
    });

    // === Accessibility ===
    const a11y = await page.evaluate(() => {
      const result: Record<string, unknown> = {};
      result.imagesWithoutAlt = document.querySelectorAll('img:not([alt])').length;
      result.buttonsWithoutLabel = Array.from(document.querySelectorAll('button')).filter(
        (btn) => !btn.textContent?.trim() && !btn.getAttribute('aria-label') && !btn.getAttribute('title')
      ).length;
      result.inputsWithoutLabel = Array.from(document.querySelectorAll('input')).filter(
        (input) => !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby') && !document.querySelector(`label[for="${input.id}"]`)
      ).length;

      // Touch targets < 44px
      const smallTargets: string[] = [];
      document.querySelectorAll('button, a[href], input, select').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          const label = el.getAttribute('aria-label') || el.textContent?.trim().substring(0, 30) || el.tagName;
          smallTargets.push(`${el.tagName}[${Math.round(rect.width)}x${Math.round(rect.height)}]: ${label}`);
        }
      });
      result.smallTouchTargets = smallTargets;

      // Focus indicators - check if focus-visible styles exist
      result.focusVisibleRulesExist = Array.from(document.styleSheets).some(sheet => {
        try {
          return Array.from(sheet.cssRules).some(rule => rule.cssText.includes('focus-visible'));
        } catch { return false; }
      });

      return result;
    });

    // === Theme Variable Check ===
    const theme = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        bgDeep: root.getPropertyValue('--color-bg-deep').trim(),
        bgSurface: root.getPropertyValue('--color-bg-surface').trim(),
        accentPrimary: root.getPropertyValue('--color-accent-primary').trim(),
        textPrimary: root.getPropertyValue('--color-text-primary').trim(),
        textSecondary: root.getPropertyValue('--color-text-secondary').trim(),
      };
    });

    // === Theme Switch Performance ===
    const themeSwitchMs = await page.evaluate(() => {
      const start = performance.now();
      const toggle = document.querySelector('[data-testid="theme-toggle"]') as HTMLElement;
      toggle?.click();
      document.documentElement.getBoundingClientRect(); // Force layout
      return performance.now() - start;
    });

    console.log('=== AUDIT RESULTS ===');
    console.log('\nDOM Metrics:', JSON.stringify(domMetrics, null, 2));
    console.log('\nAccessibility:', JSON.stringify(a11y, null, 2));
    console.log('\nTheme Variables:', JSON.stringify(theme, null, 2));
    console.log('\nTheme Switch Layout Time:', themeSwitchMs.toFixed(2), 'ms');

    // Assertions for quality gates
    expect(domMetrics.domNodeCount).toBeLessThan(5000);
    expect(a11y.imagesWithoutAlt).toBe(0);
    expect(a11y.buttonsWithoutLabel).toBe(0);
    expect(themeSwitchMs).toBeLessThan(100);
  });

  test('16 - Contrast audit both themes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    for (const themeName of ['dark', 'light']) {
      if (themeName === 'light') {
        await page.click('[data-testid="theme-toggle"]');
        await page.waitForTimeout(500);
      }

      const data = await page.evaluate((t) => {
        function getLuminance(r: number, g: number, b: number): number {
          const [rs, gs, bs] = [r, g, b].map((c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        }

        function getContrastRatio(l1: number, l2: number): number {
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        }

        function parseColor(color: string): [number, number, number] | null {
          const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
        }

        const issues: Array<{ element: string; ratio: number; text: string }> = [];
        document.querySelectorAll('h1, h2, h3, p, span, a, button, label').forEach((el) => {
          const style = getComputedStyle(el);
          const text = el.textContent?.trim();
          if (!text || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

          const fgColor = parseColor(style.color);
          if (!fgColor) return;

          let bg: [number, number, number] | null = null;
          let parent: Element | null = el as Element;
          while (parent) {
            const ps = getComputedStyle(parent);
            const parsed = parseColor(ps.backgroundColor);
            if (parsed && !(parsed[0] === 0 && parsed[1] === 0 && parsed[2] === 0 && ps.backgroundColor.includes('0)'))) {
              bg = parsed;
              break;
            }
            parent = parent.parentElement;
          }
          if (!bg) return;

          const ratio = getContrastRatio(getLuminance(...fgColor), getLuminance(...bg));
          const fontSize = parseFloat(style.fontSize);
          const isBold = parseInt(style.fontWeight) >= 700;
          const isLarge = fontSize >= 18 || (fontSize >= 14 && isBold);
          const minRatio = isLarge ? 3.0 : 4.5;

          if (ratio < minRatio) {
            issues.push({
              element: `${el.tagName.toLowerCase()}`,
              ratio: Math.round(ratio * 100) / 100,
              text: text.substring(0, 40),
            });
          }
        });

        return { theme: t, issues, total: document.querySelectorAll('h1,h2,h3,p,span,a,button,label').length };
      }, themeName);

      console.log(`\n=== CONTRAST (${themeName}) ===`);
      console.log(`Checked ${data.total} elements, found ${data.issues.length} issues`);
      if (data.issues.length > 0) {
        console.log('Issues:', JSON.stringify(data.issues, null, 2));
      }
    }
  });

  test('17 - Keyboard navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadLibrary(page);

    // Tab through elements and record focus path
    const focusPath: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(50);
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'BODY';
        const label = el.getAttribute('aria-label') || el.textContent?.trim().substring(0, 25) || '';
        return `${el.tagName}[${label}]`;
      });
      focusPath.push(info);
    }

    console.log('\n=== KEYBOARD NAVIGATION ===');
    console.log('Tab order (first 15 stops):');
    focusPath.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

    // Screenshot with focus ring visible
    await page.screenshot({ path: 'e2e/screenshots/audit-focused/15-keyboard-focus.png', fullPage: false });

    // Test "/" shortcut
    await page.locator('body').click();
    await page.waitForTimeout(100);
    await page.keyboard.press('/');
    await page.waitForTimeout(200);
    const searchFocused = await page.evaluate(() => document.activeElement?.getAttribute('type') === 'search');
    console.log(`"/" shortcut focuses search: ${searchFocused}`);
  });
});
