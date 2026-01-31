import { test, expect, type Page } from '@playwright/test';

/**
 * Comprehensive UI/UX & Performance Audit
 *
 * Navigates the app and collects detailed metrics on:
 * - Touch target sizes (44px minimum)
 * - Color contrast ratios
 * - Layout consistency
 * - Performance (FCP, DOM count, resource sizes)
 * - Accessibility (ARIA, focus, keyboard)
 * - Responsive behavior (mobile + desktop)
 * - Hover / interaction states
 */

const NOW = Date.now();
const HOUR = 3600000;
const DAY = 86400000;

const MOCK_LIBRARY = [
  {
    id: 'book-1',
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    citekey: null,
    sourceType: 'pdf',
    progress: 65,
    rating: 4,
    pinned: true,
    paused: false,
    pausedAt: null,
    cover: 'cover-1.jpg',
    totalPages: 368,
    highlightCount: 12,
    collections: ['Design'],
    lastRead: new Date(NOW - 2 * HOUR).toISOString(),
    dateCreated: new Date(NOW - 30 * DAY).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    currentChapter: 'Chapter 5: Human Error',
    readingStats: {
      totalReadingTimeMs: 7200000,
      totalSessions: 10,
      averageSessionMs: 720000,
      firstReadDate: new Date(NOW - 30 * DAY).toISOString(),
      pagesPerHour: 30,
      totalPagesRead: 239,
      longestSessionMs: 3600000,
      estimatedCompletionDate: null,
      averageDailyReadingMs: 600000,
    },
    csl: { publisher: 'Basic Books', issued: '2013', containerTitle: null },
  },
  {
    id: 'book-2',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    citekey: null,
    sourceType: 'epub',
    progress: 100,
    rating: 5,
    pinned: false,
    paused: false,
    pausedAt: null,
    cover: 'cover-2.jpg',
    totalPages: 512,
    highlightCount: 34,
    collections: ['Psychology'],
    lastRead: new Date(NOW - 1 * DAY).toISOString(),
    dateCreated: new Date(NOW - 90 * DAY).toISOString(),
    dateFinished: '2024-12-15',
    yearCompleted: 2024,
    currentChapter: null,
    readingStats: {
      totalReadingTimeMs: 18000000,
      totalSessions: 25,
      averageSessionMs: 720000,
      firstReadDate: new Date(NOW - 90 * DAY).toISOString(),
      pagesPerHour: 25,
      totalPagesRead: 512,
      longestSessionMs: 5400000,
      estimatedCompletionDate: null,
      averageDailyReadingMs: 900000,
    },
    csl: { publisher: 'Farrar, Straus and Giroux', issued: '2011', containerTitle: null },
  },
  {
    id: 'book-3',
    title: 'Sapiens: A Brief History of Humankind',
    author: 'Yuval Noah Harari',
    citekey: null,
    sourceType: 'pdf',
    progress: 30,
    rating: null,
    pinned: false,
    paused: false,
    pausedAt: null,
    cover: null,
    totalPages: 464,
    highlightCount: 5,
    collections: [],
    lastRead: new Date(NOW - 3 * DAY).toISOString(),
    dateCreated: new Date(NOW - 14 * DAY).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    currentChapter: 'Part Two: The Agricultural Revolution',
    readingStats: {
      totalReadingTimeMs: 5400000,
      totalSessions: 6,
      averageSessionMs: 900000,
      firstReadDate: new Date(NOW - 14 * DAY).toISOString(),
      pagesPerHour: 28,
      totalPagesRead: 139,
      longestSessionMs: 1800000,
      estimatedCompletionDate: '2025-03-01',
      averageDailyReadingMs: 450000,
    },
    csl: { publisher: 'Harper', issued: '2015', containerTitle: null },
  },
  {
    id: 'book-4',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    author: 'Robert C. Martin',
    citekey: null,
    sourceType: 'pdf',
    progress: 0,
    rating: null,
    pinned: false,
    paused: false,
    pausedAt: null,
    cover: null,
    totalPages: 464,
    highlightCount: 0,
    collections: ['Technical'],
    lastRead: null,
    dateCreated: new Date(NOW - 7 * DAY).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    currentChapter: null,
    readingStats: null,
    csl: { publisher: 'Prentice Hall', issued: '2008', containerTitle: null },
  },
  {
    id: 'book-5',
    title: 'Refactoring: Improving the Design of Existing Code',
    author: 'Martin Fowler',
    citekey: null,
    sourceType: 'epub',
    progress: 45,
    rating: 3,
    pinned: false,
    paused: false,
    pausedAt: null,
    cover: 'cover-5.jpg',
    totalPages: 448,
    highlightCount: 8,
    collections: ['Technical'],
    lastRead: new Date(NOW - 5 * DAY).toISOString(),
    dateCreated: new Date(NOW - 60 * DAY).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    currentChapter: 'Chapter 6: A First Set of Refactorings',
    readingStats: {
      totalReadingTimeMs: 9000000,
      totalSessions: 12,
      averageSessionMs: 750000,
      firstReadDate: new Date(NOW - 60 * DAY).toISOString(),
      pagesPerHour: 20,
      totalPagesRead: 201,
      longestSessionMs: 2700000,
      estimatedCompletionDate: '2025-04-10',
      averageDailyReadingMs: 500000,
    },
    csl: { publisher: 'Addison-Wesley', issued: '2018', containerTitle: null },
  },
  {
    id: 'book-6',
    title: 'An Extremely Long Book Title That Should Test Text Truncation and Layout Behavior on Cards',
    author: 'A. Very Long Author Name Jr.',
    citekey: null,
    sourceType: 'pdf',
    progress: 15,
    rating: 2,
    pinned: false,
    paused: false,
    pausedAt: null,
    cover: null,
    totalPages: 200,
    highlightCount: 1,
    collections: [],
    lastRead: new Date(NOW - 10 * DAY).toISOString(),
    dateCreated: new Date(NOW - 20 * DAY).toISOString(),
    dateFinished: null,
    yearCompleted: null,
    currentChapter: 'Introduction',
    readingStats: {
      totalReadingTimeMs: 1800000,
      totalSessions: 2,
      averageSessionMs: 900000,
      firstReadDate: new Date(NOW - 20 * DAY).toISOString(),
      pagesPerHour: 35,
      totalPagesRead: 30,
      longestSessionMs: 1200000,
      estimatedCompletionDate: '2025-05-01',
      averageDailyReadingMs: 300000,
    },
    csl: { publisher: 'Test Publisher', issued: '2020', containerTitle: null },
  },
];

async function setupMockRoutes(page: Page) {
  // Library list
  await page.route('**/api/library', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_LIBRARY),
    });
  });

  // Cover images - return 1x1 placeholder PNG
  await page.route('**/api/covers/**', async (route) => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
      'base64'
    );
    await route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });

  // Collections
  await page.route('**/api/collections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ collections: ['Design', 'Psychology', 'Technical'] }),
    });
  });

  // Reading goals
  await page.route('**/api/reading-goals**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        goals: { dailyGoalMinutes: 30, weeklyGoalMinutes: null, weeklyGoalDays: 5, freezeDays: [] },
        streak: { currentStreak: 7, longestStreak: 14, graceDaysUsed: 0, freezeDaysUsed: 0 },
        todayProgress: { totalDurationMs: 1200000, sessions: 1 },
        streakAtRisk: null,
      }),
    });
  });

  // Library stats
  await page.route('**/api/library-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalBooks: 6,
        booksCompleted: 1,
        booksInProgress: 4,
        booksUnread: 1,
        totalReadingTimeMs: 41400000,
        totalHighlights: 60,
        booksCompletedThisYear: 1,
        currentYear: 2025,
      }),
    });
  });

  // Search status
  await page.route('**/api/search/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isComplete: true, indexedDocuments: 6, totalDocuments: 6, percentComplete: 100 }),
    });
  });

  // Search
  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [] }),
    });
  });
}

interface AuditFinding {
  category: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  element?: string;
  value?: string;
  recommendation?: string;
}

function printReport(title: string, findings: AuditFinding[], perfMetrics?: Record<string, unknown>) {
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;

  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
  console.log(`\nFindings: ${findings.length} (${criticalCount} critical, ${warningCount} warnings, ${infoCount} info)\n`);

  const categories = [...new Set(findings.map((f) => f.category))];
  for (const category of categories) {
    const catFindings = findings.filter((f) => f.category === category);
    console.log(`\n--- ${category} (${catFindings.length}) ---`);
    for (const f of catFindings) {
      const icon = f.severity === 'critical' ? '[CRITICAL]' : f.severity === 'warning' ? '[WARNING] ' : '[INFO]    ';
      console.log(`  ${icon} ${f.description}`);
      if (f.element) console.log(`           Element: ${f.element}`);
      if (f.value) console.log(`           Value: ${f.value}`);
      if (f.recommendation) console.log(`           Fix: ${f.recommendation}`);
    }
  }

  if (perfMetrics) {
    console.log('\n\n--- Performance Summary ---');
    for (const [k, v] of Object.entries(perfMetrics)) {
      console.log(`  ${k}: ${v}`);
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

test.describe('UI/UX & Performance Audit', () => {
  test.setTimeout(60_000);

  test('Desktop dark theme - comprehensive audit', async ({ page }) => {
    await setupMockRoutes(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Wait for library content to render
    await page.waitForSelector('[data-testid="book-card"], [class*="grid"]', { timeout: 15000 });
    await page.waitForTimeout(1200);

    const findings: AuditFinding[] = [];

    // === 1. TOUCH TARGET AUDIT ===
    const interactiveElements = await page.$$eval(
      'button, a, input, select, [role="button"], [tabindex="0"]',
      (elements) =>
        elements
          .filter((el) => {
            const style = window.getComputedStyle(el);
            // Exclude elements that are hidden, invisible, transparent, or non-interactive
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (parseFloat(style.opacity) < 0.1) return false;
            if (style.pointerEvents === 'none') return false;
            return true;
          })
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id || undefined,
              classes: el.className?.toString().slice(0, 100) || undefined,
              text: el.textContent?.trim().slice(0, 50) || undefined,
              ariaLabel: el.getAttribute('aria-label') || undefined,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              isVisible: rect.width > 0 && rect.height > 0,
            };
          })
    );

    const smallTargets = interactiveElements.filter(
      (el) => el.isVisible && (el.width < 44 || el.height < 44) && el.width > 0 && el.height > 0
    );

    for (const target of smallTargets) {
      // Skip skip-link and hidden elements
      if (target.classes?.includes('skip-link')) continue;
      if (target.width < 5 || target.height < 5) continue;

      findings.push({
        category: 'Touch Target',
        severity: target.width < 32 || target.height < 32 ? 'critical' : 'warning',
        description: `Interactive element too small: ${target.width}x${target.height}px (min 44x44)`,
        element: `<${target.tag}> "${target.text || target.ariaLabel || target.id || '?'}"`,
        value: `${target.width}x${target.height}px`,
        recommendation: 'Add min-w-[44px] min-h-[44px] or padding to increase touch target',
      });
    }

    // === 2. COLOR CONTRAST AUDIT ===
    const contrastIssues = await page.evaluate(() => {
      function getLuminance(r: number, g: number, b: number): number {
        const [rs, gs, bs] = [r, g, b].map((c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function parseColor(color: string): [number, number, number, number] | null {
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), m[4] ? parseFloat(m[4]) : 1];
        return null;
      }

      function getContrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
        const l1 = getLuminance(...fg);
        const l2 = getLuminance(...bg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }

      const issues: Array<{ text: string; fontSize: string; ratio: number; required: number }> = [];

      const textEls = document.querySelectorAll('h1, h2, h3, p, span, a, button, label');
      for (const el of textEls) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const text = el.textContent?.trim();
        if (!text || text.length === 0) continue;

        const fg = parseColor(style.color);
        if (!fg || fg[3] < 0.5) continue;

        // Walk up parents to find a solid background
        let bg: [number, number, number, number] | null = null;
        let current: Element | null = el as Element;
        while (current) {
          const bgC = parseColor(window.getComputedStyle(current).backgroundColor);
          if (bgC && bgC[3] > 0.3) { bg = bgC; break; }
          current = current.parentElement;
        }
        if (!bg) continue;

        const ratio = getContrastRatio([fg[0], fg[1], fg[2]], [bg[0], bg[1], bg[2]]);
        const fontSize = parseFloat(style.fontSize);
        const fontWeight = parseInt(style.fontWeight) || 400;
        const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
        const required = isLarge ? 3 : 4.5;

        if (ratio < required) {
          issues.push({ text: text.slice(0, 40), fontSize: style.fontSize, ratio: Math.round(ratio * 100) / 100, required });
        }
      }
      return issues.slice(0, 15);
    });

    for (const issue of contrastIssues) {
      findings.push({
        category: 'Color Contrast',
        severity: issue.ratio < 3 ? 'critical' : 'warning',
        description: `Low contrast ${issue.ratio}:1 (needs ${issue.required}:1) on "${issue.text}" (${issue.fontSize})`,
      });
    }

    // === 3. LAYOUT CONSISTENCY ===
    const layoutIssues = await page.evaluate(() => {
      const issues: string[] = [];

      if (document.body.scrollWidth > window.innerWidth + 2) {
        issues.push(`Horizontal overflow: body=${document.body.scrollWidth}px, viewport=${window.innerWidth}px`);
      }

      // Card height consistency — check within each row (cards sharing the same top position)
      const cards = document.querySelectorAll('[data-testid="book-card"]');
      if (cards.length > 1) {
        const rects = Array.from(cards).map((c) => c.getBoundingClientRect());
        // Group cards by row (cards within 5px of the same top are in the same row)
        const rows = new Map<number, number[]>();
        for (const rect of rects) {
          const rowKey = Math.round(rect.top / 5) * 5;
          const existing = rows.get(rowKey);
          if (existing) {
            existing.push(rect.height);
          } else {
            rows.set(rowKey, [rect.height]);
          }
        }
        for (const [, heights] of rows) {
          if (heights.length < 2) continue;
          const min = Math.min(...heights);
          const max = Math.max(...heights);
          if (max - min > 10) {
            issues.push(`Card height inconsistency within row: ${Math.round(min)}–${Math.round(max)}px (${Math.round(max - min)}px diff)`);
          }
        }
      }

      return issues;
    });

    for (const issue of layoutIssues) {
      findings.push({ category: 'Layout', severity: 'warning', description: issue });
    }

    // === 4. ACCESSIBILITY ===
    const a11yIssues = await page.evaluate(() => {
      const issues: string[] = [];

      // Images without alt
      for (const img of document.querySelectorAll('img')) {
        if (!img.alt && img.getAttribute('aria-hidden') !== 'true' && !img.getAttribute('role')) {
          issues.push(`Image without alt text: ${img.src.split('/').pop()?.slice(0, 40)}`);
        }
      }

      // Buttons without accessible names
      for (const btn of document.querySelectorAll('button')) {
        const style = window.getComputedStyle(btn);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const hasName = btn.textContent?.trim() || btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.getAttribute('aria-labelledby');
        if (!hasName) {
          issues.push(`Button without accessible name: class="${btn.className?.toString().slice(0, 60)}"`);
        }
      }

      // Landmarks
      if (!document.querySelector('main')) issues.push('Missing <main> landmark');
      if (!document.querySelector('header')) issues.push('Missing <header> landmark');
      if (!document.querySelector('nav')) issues.push('Missing <nav> landmark');

      // Heading hierarchy
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      let lastLevel = 0;
      for (const h of headings) {
        const level = parseInt(h.tagName[1]);
        if (level > lastLevel + 1 && lastLevel > 0) {
          issues.push(`Heading skip: h${lastLevel} -> h${level} ("${h.textContent?.trim().slice(0, 30)}")`);
        }
        lastLevel = level;
      }

      return issues;
    });

    for (const issue of a11yIssues) {
      findings.push({
        category: 'Accessibility',
        severity: issue.includes('Button without') || issue.includes('Image without') ? 'warning' : 'info',
        description: issue,
      });
    }

    // === 5. PERFORMANCE METRICS ===
    const perfMetrics = await page.evaluate(() => {
      const paintEntries = performance.getEntries().filter((e) => e.entryType === 'paint');
      const resourceEntries = performance.getEntries().filter((e) => e.entryType === 'resource') as PerformanceResourceTiming[];
      const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint');

      const largeResources = resourceEntries
        .filter((r) => r.transferSize > 100000)
        .map((r) => ({
          name: r.name.split('/').pop()?.slice(0, 50) || r.name.slice(0, 50),
          sizeKB: Math.round(r.transferSize / 1024),
          durationMs: Math.round(r.duration),
        }));

      return {
        fcpMs: fcp ? Math.round(fcp.startTime) : null,
        domNodes: document.querySelectorAll('*').length,
        inlineStyles: document.querySelectorAll('[style]').length,
        largeResources,
        totalResources: resourceEntries.length,
      };
    });

    if (perfMetrics.fcpMs && perfMetrics.fcpMs > 2000) {
      findings.push({ category: 'Performance', severity: 'warning', description: `FCP: ${perfMetrics.fcpMs}ms (target <2000ms)` });
    }
    if (perfMetrics.domNodes > 1500) {
      findings.push({
        category: 'Performance',
        severity: perfMetrics.domNodes > 3000 ? 'warning' : 'info',
        description: `DOM nodes: ${perfMetrics.domNodes}`,
      });
    }
    for (const r of perfMetrics.largeResources) {
      findings.push({ category: 'Performance', severity: r.sizeKB > 500 ? 'warning' : 'info', description: `Large resource: ${r.name} (${r.sizeKB}KB, ${r.durationMs}ms)` });
    }

    // === 6. KEYBOARD NAV ===
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? { tag: el.tagName, text: el.textContent?.trim().slice(0, 40) } : null;
    });
    if (!firstFocused) {
      findings.push({ category: 'Keyboard', severity: 'warning', description: 'Tab key did not focus any element' });
    }

    // Test "/" shortcut
    await page.keyboard.press('Escape');
    await page.keyboard.press('/');
    const searchFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.tagName === 'INPUT' && el?.getAttribute('type') === 'search';
    });
    if (!searchFocused) {
      findings.push({ category: 'Keyboard', severity: 'warning', description: '"/" shortcut did not focus search input' });
    }

    // === SCREENSHOTS ===
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'e2e/screenshots/audit-desktop-dark-overview.png', fullPage: true });

    // === 7. LIGHT THEME ===
    const themeToggle = page.getByTestId('theme-toggle');
    await themeToggle.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit-desktop-light-overview.png', fullPage: true });

    const lightOk = await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'light');
    if (!lightOk) {
      findings.push({ category: 'Theme', severity: 'warning', description: 'Theme toggle did not switch to light mode' });
    }

    // Switch back to dark
    await themeToggle.click();
    await page.waitForTimeout(500);

    // === 8. HOVER STATE ===
    const firstCard = page.locator('a[href^="/read/"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.hover();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'e2e/screenshots/audit-card-hover.png' });
    }

    // === 9. LIST VIEW ===
    const listViewBtn = page.locator('button[aria-label="List view"]');
    if (await listViewBtn.isVisible()) {
      await listViewBtn.click();
      await page.waitForTimeout(500);

      const listIssues = await page.evaluate(() => {
        const issues: string[] = [];
        const rows = document.querySelectorAll('[data-testid="library-list-row"]');
        if (rows.length > 0) {
          const heights = Array.from(rows).map((r) => r.getBoundingClientRect().height);
          const min = Math.min(...heights);
          const max = Math.max(...heights);
          if (max - min > 10) {
            issues.push(`List row height inconsistency: ${Math.round(min)}–${Math.round(max)}px`);
          }
        } else {
          issues.push('No list rows found after switching to list view');
        }
        return issues;
      });

      for (const issue of listIssues) {
        findings.push({ category: 'List View', severity: 'warning', description: issue });
      }

      await page.screenshot({ path: 'e2e/screenshots/audit-list-view.png', fullPage: true });

      // Switch back to grid
      const gridViewBtn = page.locator('button[aria-label="Grid view"]');
      if (await gridViewBtn.isVisible()) {
        await gridViewBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // === REPORT ===
    printReport('DESKTOP UI/UX & PERFORMANCE AUDIT', findings, {
      FCP: `${perfMetrics.fcpMs ?? 'N/A'}ms`,
      'DOM Nodes': perfMetrics.domNodes,
      'Inline Styles': perfMetrics.inlineStyles,
      'Total Resources': perfMetrics.totalResources,
    });

    expect(true).toBe(true);
  });

  test('Mobile viewport audit', async ({ page }) => {
    await setupMockRoutes(page);
    await page.setViewportSize({ width: 393, height: 851 }); // iPhone 14 Pro
    await page.goto('/');

    await page.waitForSelector('[data-testid="book-card"], [class*="grid"]', { timeout: 15000 });
    await page.waitForTimeout(1200);

    const findings: AuditFinding[] = [];

    // === 1. MOBILE TOUCH TARGETS (stricter) ===
    const targets = await page.$$eval(
      'button, a, input, select',
      (elements) =>
        elements
          .filter((el) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            // Exclude hidden, invisible, transparent, or non-interactive elements
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (parseFloat(style.opacity) < 0.1) return false;
            if (style.pointerEvents === 'none') return false;
            if (rect.width <= 5 || rect.height <= 5) return false;
            return true;
          })
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              tag: el.tagName.toLowerCase(),
              text: el.textContent?.trim().slice(0, 40) || el.getAttribute('aria-label') || '',
              classes: el.className?.toString().slice(0, 80) || '',
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
    );

    for (const t of targets) {
      if (t.classes.includes('skip-link')) continue;
      if (t.width < 44 || t.height < 44) {
        findings.push({
          category: 'Mobile Touch Target',
          severity: t.width < 32 || t.height < 32 ? 'critical' : 'warning',
          description: `Too small: ${t.width}x${t.height}px`,
          element: `<${t.tag}> "${t.text}"`,
          recommendation: 'Ensure 44x44px minimum on mobile',
        });
      }
    }

    // === 2. HORIZONTAL OVERFLOW ===
    const overflow = await page.evaluate(() => ({
      has: document.body.scrollWidth > window.innerWidth + 2,
      scrollW: document.body.scrollWidth,
      viewW: window.innerWidth,
    }));

    if (overflow.has) {
      findings.push({
        category: 'Mobile Layout',
        severity: 'critical',
        description: `Horizontal overflow: ${overflow.scrollW}px content in ${overflow.viewW}px viewport`,
      });
    }

    // === 3. FONT SIZE READABILITY ===
    const tooSmallFonts = await page.evaluate(() => {
      let count = 0;
      for (const el of document.querySelectorAll('p, span, h1, h2, h3, a, button, label')) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (parseFloat(style.fontSize) < 12 && el.textContent?.trim()) count++;
      }
      return count;
    });
    if (tooSmallFonts > 0) {
      findings.push({
        category: 'Mobile Typography',
        severity: 'warning',
        description: `${tooSmallFonts} text element(s) with font-size < 12px`,
      });
    }

    // === 4. GRID COLUMN CHECK ===
    const gridInfo = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="book-card"]');
      if (cards.length < 2) return null;
      const r1 = cards[0].getBoundingClientRect();
      const r2 = cards[1].getBoundingClientRect();
      return {
        sameRow: Math.abs(r1.top - r2.top) < 5,
        cardWidth: Math.round(r1.width),
      };
    });
    if (gridInfo && gridInfo.cardWidth < 100) {
      findings.push({ category: 'Mobile Layout', severity: 'warning', description: `Cards too narrow: ${gridInfo.cardWidth}px` });
    }

    await page.screenshot({ path: 'e2e/screenshots/audit-mobile-dark.png', fullPage: true });

    // === 5. MOBILE FILTERS ===
    const filtersBtn = page.locator('button:has-text("Filters")');
    if (await filtersBtn.isVisible()) {
      await filtersBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'e2e/screenshots/audit-mobile-filters.png', fullPage: true });

      // Close the filter sheet by pressing Escape (backdrop is covered by the sheet)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // === 6. MOBILE LIGHT THEME ===
    const themeToggle = page.getByTestId('theme-toggle');
    await themeToggle.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit-mobile-light.png', fullPage: true });

    printReport('MOBILE UI/UX AUDIT', findings);

    expect(true).toBe(true);
  });
});
