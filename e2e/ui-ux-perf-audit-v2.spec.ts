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
    type: 'pdf',
    sourceType: 'pdf',
    path: '/books/design-things.pdf',
    progress: 73,
    totalPages: 368,
    currentPage: 269,
    currentChapter: 'Chapter 5: Human Error? No, Bad Design',
    lastRead: NOW - HOUR * 2,
    dateCreated: NOW - DAY * 30,
    cover: null,
    coverUrl: null,
    rating: 5,
    isPinned: true,
    pinned: true,
    highlightCount: 12,
    readingStats: {
      totalReadingTimeMs: 18000000,
      totalPagesRead: 269,
      pagesPerHour: 15,
      lastSessionDate: NOW - HOUR * 2,
      sessionsCount: 15,
    },
  },
  {
    id: 'book-2',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    type: 'pdf',
    sourceType: 'pdf',
    path: '/books/thinking.pdf',
    progress: 45,
    totalPages: 499,
    currentPage: 225,
    currentChapter: 'Part III: Overconfidence',
    lastRead: NOW - HOUR * 6,
    dateCreated: NOW - DAY * 45,
    cover: null,
    coverUrl: null,
    rating: 4,
    isPinned: false,
    pinned: false,
    highlightCount: 8,
    readingStats: {
      totalReadingTimeMs: 14400000,
      totalPagesRead: 225,
      pagesPerHour: 12,
      lastSessionDate: NOW - HOUR * 6,
      sessionsCount: 12,
    },
  },
  {
    id: 'book-3',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    author: 'Robert C. Martin',
    type: 'pdf',
    sourceType: 'pdf',
    path: '/books/clean-code.pdf',
    progress: 100,
    totalPages: 464,
    currentPage: 464,
    lastRead: NOW - DAY * 7,
    dateCreated: NOW - DAY * 90,
    dateFinished: new Date(NOW - DAY * 7).toISOString(),
    cover: null,
    coverUrl: null,
    rating: 5,
    isPinned: false,
    pinned: false,
    highlightCount: 22,
    readingStats: {
      totalReadingTimeMs: 28800000,
      totalPagesRead: 464,
      pagesPerHour: 14,
      lastSessionDate: NOW - DAY * 7,
      sessionsCount: 20,
    },
  },
  {
    id: 'book-4',
    title: 'The Pragmatic Programmer',
    author: 'David Thomas, Andrew Hunt',
    type: 'epub',
    sourceType: 'epub',
    path: '/books/pragmatic.epub',
    progress: 15,
    totalPages: 352,
    currentPage: 53,
    lastRead: NOW - DAY * 2,
    dateCreated: NOW - DAY * 14,
    cover: null,
    coverUrl: null,
    rating: 0,
    isPinned: false,
    pinned: false,
    highlightCount: 3,
    readingStats: {
      totalReadingTimeMs: 3600000,
      totalPagesRead: 53,
      pagesPerHour: 10,
      lastSessionDate: NOW - DAY * 2,
      sessionsCount: 3,
    },
  },
  {
    id: 'book-5',
    title: 'Refactoring: Improving the Design of Existing Code',
    author: 'Martin Fowler',
    type: 'pdf',
    sourceType: 'pdf',
    path: '/books/refactoring.pdf',
    progress: 0,
    totalPages: 448,
    currentPage: 0,
    lastRead: null,
    dateCreated: NOW - DAY * 3,
    cover: null,
    coverUrl: null,
    rating: 0,
    isPinned: false,
    pinned: false,
    highlightCount: 0,
    readingStats: null,
  },
  {
    id: 'book-6',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson, Gerald Jay Sussman',
    type: 'pdf',
    sourceType: 'pdf',
    path: '/books/sicp.pdf',
    progress: 28,
    totalPages: 657,
    currentPage: 184,
    lastRead: NOW - DAY * 5,
    dateCreated: NOW - DAY * 60,
    cover: null,
    coverUrl: null,
    rating: 5,
    isPinned: true,
    pinned: true,
    highlightCount: 15,
    readingStats: {
      totalReadingTimeMs: 10800000,
      totalPagesRead: 184,
      pagesPerHour: 8,
      lastSessionDate: NOW - DAY * 5,
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
  totalHighlights: 60,
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
  streakAtRisk: {
    isAtRisk: false,
    minutesRemaining: 10,
    hoursUntilMidnight: 8,
    graceDaysRemaining: 1,
    isFreezeDay: false,
  },
};

// Use real API data from the running server - no mocks needed
async function setupMocks(_page: Page) {
  // No mocks - use real data from the running backend
}

async function waitForLibrary(page: Page) {
  // Wait for library grid or list to render with actual book cards
  await page.waitForSelector('[data-testid="book-card"], a[href^="/read/"], .library-card', {
    timeout: 15000,
  });
  await page.waitForTimeout(800);
}

// ─────────────────────────────────────────────────────────────
// AUDIT 1: Visual Exploration - Desktop & Mobile Screenshots
// ─────────────────────────────────────────────────────────────

test.describe('Visual Audit', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('desktop dark default state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);
    await page.screenshot({
      path: 'e2e/screenshots/audit-v2/01-desktop-dark.png',
      fullPage: true,
    });
  });

  test('desktop light theme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const themeBtn = page.locator('[data-testid="theme-toggle"]');
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit-v2/02-desktop-light.png',
      fullPage: true,
    });
  });

  test('card hover state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const card = page.locator('a[href^="/read/"]').first();
    await card.hover();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: 'e2e/screenshots/audit-v2/03-card-hover.png',
      fullPage: true,
    });
  });

  test('list view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const listBtn = page.locator('[aria-label="List view"]');
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit-v2/04-list-view.png',
      fullPage: true,
    });
  });

  test('search interaction', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const search = page.locator('input[type="search"]').first();
    if (await search.isVisible()) {
      await search.fill('design');
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit-v2/05-search.png',
      fullPage: true,
    });
  });

  test('mobile dark view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForLibrary(page);

    await page.screenshot({
      path: 'e2e/screenshots/audit-v2/06-mobile-dark.png',
      fullPage: true,
    });
  });

  test('mobile light view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForLibrary(page);

    const themeBtn = page.locator('[data-testid="theme-toggle"]');
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit-v2/07-mobile-light.png',
      fullPage: true,
    });
  });

  test('loading state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Delay library response to capture skeleton
    await page.route('**/api/library**', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.continue();
    });

    await page.goto('/');
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'e2e/screenshots/audit-v2/08-loading-skeleton.png',
      fullPage: true,
    });
  });

  test('empty search results', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const search = page.locator('input[type="search"]').first();
    if (await search.isVisible()) {
      await search.fill('xyznonexistent');
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/audit-v2/09-empty-search.png',
      fullPage: true,
    });
  });
});

// ─────────────────────────────────────────────────────────────
// AUDIT 2: Performance Metrics
// ─────────────────────────────────────────────────────────────

test.describe('Performance Audit', () => {
  test('page load performance', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    const startTime = Date.now();
    await page.goto('/');
    await waitForLibrary(page);
    const loadTime = Date.now() - startTime;

    const perf = await page.evaluate(() => {
      const entries = performance.getEntriesByType(
        'navigation'
      ) as PerformanceNavigationTiming[];
      const nav = entries[0];
      return {
        domContentLoaded: nav?.domContentLoadedEventEnd - nav?.startTime,
        loadComplete: nav?.loadEventEnd - nav?.startTime,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime,
        firstContentfulPaint: performance.getEntriesByName(
          'first-contentful-paint'
        )[0]?.startTime,
      };
    });

    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsVal = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsVal += (entry as any).value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(clsVal);
        }, 2000);
      });
    });

    console.log('\n=== PERFORMANCE METRICS ===');
    console.log(`  Wall-clock load time:    ${loadTime}ms`);
    console.log(`  DOM Content Loaded:      ${perf.domContentLoaded?.toFixed(0)}ms`);
    console.log(`  Load Complete:           ${perf.loadComplete?.toFixed(0)}ms`);
    console.log(`  First Paint:             ${perf.firstPaint?.toFixed(0)}ms`);
    console.log(`  First Contentful Paint:  ${perf.firstContentfulPaint?.toFixed(0)}ms`);
    console.log(`  Cumulative Layout Shift: ${cls.toFixed(4)}`);
    console.log('===========================\n');

    expect(perf.firstContentfulPaint).toBeLessThan(3000);
    expect(cls).toBeLessThan(0.25);
  });

  test('DOM element count', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const domStats = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const totalElements = allElements.length;
      const svgCount = document.querySelectorAll('svg').length;
      const buttonCount = document.querySelectorAll('button').length;
      const divCount = document.querySelectorAll('div').length;

      // Check for deeply nested elements
      let maxDepth = 0;
      function getDepth(el: Element, depth: number) {
        if (depth > maxDepth) maxDepth = depth;
        for (const child of el.children) {
          getDepth(child, depth + 1);
        }
      }
      getDepth(document.body, 0);

      return { totalElements, svgCount, buttonCount, divCount, maxDepth };
    });

    console.log('\n=== DOM COMPLEXITY ===');
    console.log(`  Total DOM elements:  ${domStats.totalElements}`);
    console.log(`  SVG elements:        ${domStats.svgCount}`);
    console.log(`  Button elements:     ${domStats.buttonCount}`);
    console.log(`  Div elements:        ${domStats.divCount}`);
    console.log(`  Max nesting depth:   ${domStats.maxDepth}`);
    console.log('======================\n');

    // Flag if DOM is unusually large
    expect(domStats.totalElements).toBeLessThan(2000);
  });

  test('animation and transition audit', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const animationStats = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      let animatedCount = 0;
      let willChangeCount = 0;
      const animations: string[] = [];

      for (const el of allElements) {
        const style = getComputedStyle(el);
        if (style.animationName && style.animationName !== 'none') {
          animatedCount++;
          animations.push(
            `${el.tagName}.${el.className.toString().slice(0, 40)} => ${style.animationName}`
          );
        }
        if (style.willChange && style.willChange !== 'auto') {
          willChangeCount++;
        }
      }

      return { animatedCount, willChangeCount, animations: animations.slice(0, 15) };
    });

    console.log('\n=== ANIMATION AUDIT ===');
    console.log(`  Elements with active animations: ${animationStats.animatedCount}`);
    console.log(`  Elements with will-change:       ${animationStats.willChangeCount}`);
    if (animationStats.animations.length > 0) {
      console.log('  Active animations:');
      for (const anim of animationStats.animations) {
        console.log(`    - ${anim}`);
      }
    }
    console.log('========================\n');
  });
});

// ─────────────────────────────────────────────────────────────
// AUDIT 3: Accessibility
// ─────────────────────────────────────────────────────────────

test.describe('Accessibility Audit', () => {
  test('heading hierarchy and landmarks', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const a11y = await page.evaluate(() => {
      // Headings
      const headings = Array.from(
        document.querySelectorAll('h1, h2, h3, h4, h5, h6')
      ).map((el) => ({
        level: parseInt(el.tagName[1]),
        text: el.textContent?.trim().slice(0, 60),
      }));

      // Landmarks
      const landmarks = {
        banner: document.querySelectorAll('[role="banner"], header').length,
        nav: document.querySelectorAll('[role="navigation"], nav').length,
        main: document.querySelectorAll('[role="main"], main').length,
        search: document.querySelectorAll('[role="search"]').length,
        region: document.querySelectorAll('[role="region"]').length,
      };

      // Skip link
      const skipLink = document.querySelector(
        'a[href="#main-content"], .skip-link'
      );

      // Buttons without accessible names
      const unlabeledButtons = Array.from(
        document.querySelectorAll('button')
      ).filter((btn) => {
        const label =
          btn.getAttribute('aria-label') ||
          btn.textContent?.trim() ||
          btn.getAttribute('title');
        return !label;
      });

      // Images without alt
      const imagesNoAlt = Array.from(
        document.querySelectorAll('img')
      ).filter((img) => !img.hasAttribute('alt'));

      // Focus management
      const focusableElements = document.querySelectorAll(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );

      return {
        headings,
        landmarks,
        hasSkipLink: !!skipLink,
        unlabeledButtonCount: unlabeledButtons.length,
        imagesNoAltCount: imagesNoAlt.length,
        focusableElementCount: focusableElements.length,
      };
    });

    console.log('\n=== ACCESSIBILITY AUDIT ===');
    console.log(`  Skip link: ${a11y.hasSkipLink ? 'YES' : 'MISSING'}`);
    console.log('  Headings:');
    for (const h of a11y.headings) {
      console.log(`    H${h.level}: ${h.text}`);
    }
    console.log('  Landmarks:', JSON.stringify(a11y.landmarks));
    console.log(`  Unlabeled buttons: ${a11y.unlabeledButtonCount}`);
    console.log(`  Images without alt: ${a11y.imagesNoAltCount}`);
    console.log(`  Focusable elements: ${a11y.focusableElementCount}`);
    console.log('============================\n');

    expect(a11y.hasSkipLink).toBe(true);
    expect(a11y.unlabeledButtonCount).toBe(0);
    expect(a11y.imagesNoAltCount).toBe(0);
  });

  test('keyboard navigation', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    // Tab through and check focus visibility
    const focusLog: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'body';
        const tag = el.tagName.toLowerCase();
        const label =
          el.getAttribute('aria-label') ||
          el.textContent?.trim().slice(0, 40) ||
          '';
        const cls = el.className?.toString().slice(0, 30) || '';
        return `${tag}[${label}] (${cls})`;
      });
      focusLog.push(focused);
    }

    console.log('\n=== KEYBOARD NAV (first 10 tabs) ===');
    focusLog.forEach((entry, i) => {
      console.log(`  Tab ${i + 1}: ${entry}`);
    });
    console.log('=====================================\n');

    // Check that focus is visible (has outline/ring)
    await page.keyboard.press('Tab');
    const hasFocusIndicator = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return true;
      const style = getComputedStyle(el);
      const hasOutline =
        style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
      const hasBoxShadow = style.boxShadow !== 'none';
      return hasOutline || hasBoxShadow;
    });

    console.log(`  Focus indicator visible: ${hasFocusIndicator}`);
  });

  test('touch target sizes', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForLibrary(page);

    const touchTargets = await page.evaluate(() => {
      const interactive = document.querySelectorAll(
        'a, button, input, select, [role="button"]'
      );
      const tooSmall: string[] = [];
      const MIN_SIZE = 44;

      for (const el of interactive) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue; // hidden
        if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
          const label =
            (el as HTMLElement).getAttribute('aria-label') ||
            el.textContent?.trim().slice(0, 30) ||
            el.tagName;
          tooSmall.push(
            `${el.tagName.toLowerCase()}[${label}]: ${Math.round(rect.width)}x${Math.round(rect.height)}`
          );
        }
      }

      return { total: interactive.length, tooSmall };
    });

    console.log('\n=== TOUCH TARGET AUDIT (mobile) ===');
    console.log(`  Total interactive elements: ${touchTargets.total}`);
    console.log(
      `  Too small (<44px): ${touchTargets.tooSmall.length}`
    );
    if (touchTargets.tooSmall.length > 0) {
      for (const item of touchTargets.tooSmall.slice(0, 10)) {
        console.log(`    - ${item}`);
      }
    }
    console.log('=====================================\n');
  });

  test('color contrast check', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const contrastIssues = await page.evaluate(() => {
      function getLuminance(r: number, g: number, b: number): number {
        const [rs, gs, bs] = [r, g, b].map((c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function getContrastRatio(l1: number, l2: number): number {
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function parseColor(color: string): [number, number, number] | null {
        const match = color.match(
          /rgba?\((\d+),\s*(\d+),\s*(\d+)/
        );
        if (!match) return null;
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      }

      const textElements = document.querySelectorAll(
        'p, span, h1, h2, h3, h4, h5, h6, a, button, label, td, th, li'
      );
      const issues: string[] = [];

      for (const el of textElements) {
        const style = getComputedStyle(el);
        const fgColor = parseColor(style.color);
        const bgColor = parseColor(style.backgroundColor);
        if (!fgColor || !bgColor) continue;
        // Skip transparent backgrounds
        if (bgColor[0] === 0 && bgColor[1] === 0 && bgColor[2] === 0) {
          const opacity = parseFloat(
            style.backgroundColor.match(/[\d.]+\)$/)?.[0] ?? '1'
          );
          if (opacity === 0) continue;
        }

        const fgLum = getLuminance(...fgColor);
        const bgLum = getLuminance(...bgColor);
        const ratio = getContrastRatio(fgLum, bgLum);

        const fontSize = parseFloat(style.fontSize);
        const isBold = parseInt(style.fontWeight) >= 700;
        const isLargeText = fontSize >= 18 || (fontSize >= 14 && isBold);
        const threshold = isLargeText ? 3 : 4.5;

        if (ratio < threshold) {
          const text = el.textContent?.trim().slice(0, 30) || '';
          if (text) {
            issues.push(
              `"${text}" ratio=${ratio.toFixed(2)} (need ${threshold}) fg=${style.color} bg=${style.backgroundColor}`
            );
          }
        }
      }

      return issues.slice(0, 10);
    });

    console.log('\n=== COLOR CONTRAST AUDIT ===');
    if (contrastIssues.length === 0) {
      console.log('  No contrast issues found (basic check)');
    } else {
      console.log(`  Found ${contrastIssues.length} potential issues:`);
      for (const issue of contrastIssues) {
        console.log(`    - ${issue}`);
      }
    }
    console.log('=============================\n');
  });
});

// ─────────────────────────────────────────────────────────────
// AUDIT 4: CSS/Layout Issues
// ─────────────────────────────────────────────────────────────

test.describe('Layout Audit', () => {
  test('check for horizontal overflow', async ({ page }) => {
    await setupMocks(page);

    const viewports = [
      { width: 1440, height: 900, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 390, height: 844, name: 'mobile' },
      { width: 320, height: 568, name: 'small-mobile' },
    ];

    const overflowIssues: string[] = [];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await waitForLibrary(page);

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      if (hasOverflow) {
        overflowIssues.push(
          `${vp.name} (${vp.width}px): body scrollWidth > clientWidth`
        );
      }
    }

    console.log('\n=== HORIZONTAL OVERFLOW AUDIT ===');
    if (overflowIssues.length === 0) {
      console.log('  No overflow at any viewport');
    } else {
      for (const issue of overflowIssues) {
        console.log(`  OVERFLOW: ${issue}`);
      }
    }
    console.log('==================================\n');

    expect(overflowIssues).toHaveLength(0);
  });

  test('check for content clipping', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForLibrary(page);

    const clippingIssues = await page.evaluate(() => {
      const issues: string[] = [];
      const elements = document.querySelectorAll('*');

      for (const el of elements) {
        const style = getComputedStyle(el);
        if (style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden') {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          // Check if text content is being clipped
          if (el.scrollHeight > el.clientHeight + 2 && !el.classList.contains('line-clamp-1') && !el.classList.contains('line-clamp-2') && !el.classList.contains('line-clamp-3')) {
            const text = el.textContent?.trim().slice(0, 40) || '';
            if (text && !el.closest('.skeleton') && !el.closest('[class*="progress"]')) {
              issues.push(
                `${el.tagName.toLowerCase()}: scrollHeight(${el.scrollHeight}) > clientHeight(${el.clientHeight}) "${text}"`
              );
            }
          }
        }
      }

      return issues.slice(0, 10);
    });

    console.log('\n=== CLIPPING AUDIT ===');
    if (clippingIssues.length === 0) {
      console.log('  No significant clipping issues found');
    } else {
      console.log(`  Found ${clippingIssues.length} potential clips:`);
      for (const issue of clippingIssues) {
        console.log(`    - ${issue}`);
      }
    }
    console.log('=======================\n');
  });
});
