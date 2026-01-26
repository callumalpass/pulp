import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Load test EPUB file
const __dirname = dirname(fileURLToPath(import.meta.url));
const testEpubPath = join(__dirname, 'fixtures', 'test.epub');
const testEpubData = readFileSync(testEpubPath);

interface PerformanceMetrics {
  lcp: number | null;
  fcp: number | null;
  cls: number | null;
  tti: number | null;
}

/**
 * UI/UX Exploration Test Suite
 *
 * This suite explores the application's UI/UX across different scenarios
 * and captures screenshots for analysis.
 */
test.describe('UI/UX Exploration - Library Page', () => {
  test.beforeEach(async ({ page }) => {
    // Set up mock data that simulates a realistic library
    await page.route('**/api/library', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'book1',
              title: 'The Art of Programming',
              sourceType: 'pdf',
              progress: 67,
              lastRead: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
              cover: null,
              author: 'Donald Knuth',
              rating: 5,
              isPinned: true,
            },
            {
              id: 'book2',
              title: 'A Really Long Book Title That Should Be Truncated Properly',
              sourceType: 'epub',
              progress: 23,
              lastRead: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
              cover: null,
              author: 'Anonymous Author',
              rating: 4,
            },
            {
              id: 'book3',
              title: 'Unread Book',
              sourceType: 'pdf',
              progress: 0,
              lastRead: null,
              cover: null,
              author: 'New Author',
            },
            {
              id: 'book4',
              title: 'Completed Book',
              sourceType: 'epub',
              progress: 100,
              lastRead: new Date(Date.now() - 604800000).toISOString(), // 1 week ago
              cover: null,
              author: 'Finished Author',
              rating: 3,
            },
          ]),
        });
      }
    });

    // Mock collections
    await page.route('**/api/collections', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(['Fiction', 'Technical', 'Philosophy']),
      });
    });

    // Mock library stats
    await page.route('**/api/library/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalBooks: 4,
          booksRead: 1,
          currentlyReading: 2,
          totalReadingTime: 36000,
        }),
      });
    });
  });

  test('library page - initial load and layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Take full page screenshot
    await page.screenshot({
      path: 'test-results/exploration/library-initial.png',
      fullPage: true
    });

    // Check page structure - use first() since there are multiple Library headings
    await expect(page.getByRole('heading', { name: 'Library' }).first()).toBeVisible();

    // Verify search input is visible
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test('library page - filter interactions', async ({ page, isMobile }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    if (isMobile) {
      // On mobile, open the filter sheet first
      const filtersButton = page.locator('button:has-text("Filters")');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForTimeout(300);

        // Test PDF filter in mobile sheet
        const pdfButton = page.getByRole('button', { name: 'PDF' });
        if (await pdfButton.isVisible()) {
          await pdfButton.click();
          await page.waitForTimeout(300);
        }

        await page.screenshot({
          path: 'test-results/exploration/library-filtered-pdf.png',
          fullPage: true
        });

        // Close the sheet
        const doneButton = page.getByRole('button', { name: 'Done' });
        if (await doneButton.isVisible()) {
          await doneButton.click();
        }
      }
    } else {
      // Desktop: Test PDF filter
      const pdfButton = page.getByRole('button', { name: 'PDF' }).first();
      await pdfButton.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: 'test-results/exploration/library-filtered-pdf.png',
        fullPage: true
      });

      // Test status filter - Reading
      const readingButton = page.getByRole('button', { name: 'Reading' }).first();
      if (await readingButton.isVisible()) {
        await readingButton.click();
        await page.waitForTimeout(300);
        await page.screenshot({
          path: 'test-results/exploration/library-filtered-reading.png',
          fullPage: true
        });
      }
    }
  });

  test('library page - sort options', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click through each sort option
    const sortOptions = ['Title', 'Progress', 'Added'];
    for (const option of sortOptions) {
      const button = page.getByRole('button', { name: option }).last();
      if (await button.isVisible()) {
        await button.click();
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `test-results/exploration/library-sort-${option.toLowerCase()}.png`,
          fullPage: true
        });
      }
    }
  });

  test('library page - search functionality', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Focus search input
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.click();
    await page.screenshot({
      path: 'test-results/exploration/library-search-focused.png',
      fullPage: true
    });

    // Type a search query
    await searchInput.fill('Art');
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'test-results/exploration/library-search-results.png',
      fullPage: true
    });
  });

  test('library page - empty state', async ({ page }) => {
    // Override with empty library
    await page.route('**/api/library', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/exploration/library-empty.png',
      fullPage: true
    });
  });

  test('library page - hover states', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find a book card and hover
    const bookCard = page.locator('article, [data-testid="book-card"]').first();
    if (await bookCard.isVisible()) {
      await bookCard.hover();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: 'test-results/exploration/library-card-hover.png',
        fullPage: true
      });
    }
  });

  test('library page - theme toggle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Take dark theme screenshot
    await page.screenshot({
      path: 'test-results/exploration/library-dark-theme.png',
      fullPage: true
    });

    // Toggle theme
    const themeToggle = page.getByTitle('Toggle theme');
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: 'test-results/exploration/library-light-theme.png',
        fullPage: true
      });
    }
  });
});

test.describe('UI/UX Exploration - Reader Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock EPUB book
    await page.route('**/api/library/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'epub1',
          title: 'Test EPUB Book',
          source: '/path/to/test.epub',
          sourceType: 'epub',
          filePath: '/path/to/test.epub',
          notePath: '/path/to/note.md',
          progress: 25,
          lastRead: new Date().toISOString(),
          tags: ['literature-note'],
          cover: null,
          highlights: [
            {
              id: 'h1',
              text: 'This is a highlighted passage',
              color: 'highlight',
              note: 'My note about this passage',
              cfiRange: 'epubcfi(/6/4!/4/1:0,/6/4!/4/1:30)',
              createdAt: new Date().toISOString(),
            }
          ],
          frontmatter: {},
        }),
      });
    });

    await page.route('**/api/library/epub1/highlights', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'h1',
            text: 'This is a highlighted passage',
            color: 'highlight',
            note: 'My note about this passage',
            cfiRange: 'epubcfi(/6/4!/4/1:0,/6/4!/4/1:30)',
            createdAt: new Date().toISOString(),
          }
        ]),
      });
    });

    await page.route('**/api/files/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/epub+zip',
        body: testEpubData,
      });
    });

    // Mock reading goals
    await page.route('**/api/reading-goals**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          dailyGoal: 30,
          weeklyGoal: 150,
          todayMinutes: 15,
          weekMinutes: 60,
          currentStreak: 5,
        }),
      });
    });

    // Mock progress updates
    await page.route('**/api/library/epub1/progress', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });
  });

  test('reader page - EPUB loading and layout', async ({ page }) => {
    await page.goto('/read/epub1');

    // Wait for EPUB to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'test-results/exploration/reader-epub-loaded.png',
      fullPage: true
    });
  });

  test('reader page - toolbar interactions', async ({ page }) => {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Screenshot of toolbar
    const toolbar = page.locator('header[role="toolbar"]');
    await expect(toolbar).toBeVisible();
    await toolbar.screenshot({ path: 'test-results/exploration/reader-toolbar.png' });
  });

  test('reader page - settings panel', async ({ page }) => {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Open settings
    const settingsButton = page.locator('button[aria-label="Reading settings"]');
    await settingsButton.click();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'test-results/exploration/reader-settings-panel.png',
      fullPage: true
    });
  });

  test('reader page - bookmarks panel', async ({ page }) => {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Open bookmarks
    const bookmarksButton = page.locator('button[aria-label*="ookmark"], button[aria-label*="Bookmark"]');
    if (await bookmarksButton.first().isVisible()) {
      await bookmarksButton.first().click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: 'test-results/exploration/reader-bookmarks-panel.png',
        fullPage: true
      });
    }
  });

  test('reader page - table of contents', async ({ page }) => {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Open TOC
    const tocButton = page.locator('button[aria-label*="Table of contents"], button[aria-label*="Contents"]');
    if (await tocButton.first().isVisible()) {
      await tocButton.first().click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: 'test-results/exploration/reader-toc-panel.png',
        fullPage: true
      });
    }
  });

  test('reader page - keyboard shortcuts panel', async ({ page }) => {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Try keyboard shortcut button or press ?
    const helpButton = page.locator('button[aria-label*="Keyboard"], button[aria-label*="shortcut"], button[aria-label*="Help"]');
    if (await helpButton.first().isVisible()) {
      await helpButton.first().click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: 'test-results/exploration/reader-shortcuts-panel.png',
        fullPage: true
      });
    } else {
      // Try pressing ? for shortcuts
      await page.keyboard.press('?');
      await page.waitForTimeout(300);
      await page.screenshot({
        path: 'test-results/exploration/reader-shortcuts-panel.png',
        fullPage: true
      });
    }
  });
});

test.describe('UI/UX Exploration - Performance', () => {
  test('measure page load performance', async ({ page }) => {
    await page.route('**/api/library', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'book1', title: 'Book 1', sourceType: 'pdf', progress: 50, lastRead: new Date().toISOString(), cover: null },
          { id: 'book2', title: 'Book 2', sourceType: 'epub', progress: 25, lastRead: new Date().toISOString(), cover: null },
        ]),
      });
    });

    // Collect performance metrics
    const metrics: PerformanceMetrics = {
      lcp: null,
      fcp: null,
      cls: null,
      tti: null,
    };

    // Listen for performance entries
    page.on('console', msg => {
      if (msg.text().includes('PERF:')) {
        console.log(msg.text());
      }
    });

    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Get Core Web Vitals
    const performanceMetrics = await page.evaluate(() => {
      return new Promise<PerformanceMetrics>((resolve) => {
        const result: PerformanceMetrics = {
          lcp: null,
          fcp: null,
          cls: null,
          tti: null,
        };

        // Get FCP
        const paintEntries = performance.getEntriesByType('paint');
        const fcpEntry = paintEntries.find((entry) => entry.name === 'first-contentful-paint');
        if (fcpEntry) {
          result.fcp = fcpEntry.startTime;
        }

        // Get LCP using PerformanceObserver (if available)
        if ('PerformanceObserver' in window) {
          try {
            const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
            if (lcpEntries.length > 0) {
              result.lcp = lcpEntries[lcpEntries.length - 1].startTime;
            }
          } catch {
            // LCP not available
          }
        }

        resolve(result);
      });
    });

    console.log('Page Load Performance:');
    console.log(`  Total Load Time: ${loadTime}ms`);
    console.log(`  FCP: ${performanceMetrics.fcp?.toFixed(2) || 'N/A'}ms`);
    console.log(`  LCP: ${performanceMetrics.lcp?.toFixed(2) || 'N/A'}ms`);

    // Take screenshot with performance overlay
    await page.screenshot({
      path: 'test-results/exploration/performance-library.png',
      fullPage: true
    });

    // Assert reasonable performance (allow for slower CI environments)
    expect(loadTime).toBeLessThan(15000); // Page should load in under 15s
  });

  test('measure interaction responsiveness', async ({ page, isMobile }) => {
    await page.route('**/api/library', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'book1', title: 'Book 1', sourceType: 'pdf', progress: 50, lastRead: new Date().toISOString(), cover: null },
        ]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Measure filter click response
    if (isMobile) {
      // On mobile, open filter sheet first
      const filtersButton = page.locator('button:has-text("Filters")');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForTimeout(200);

        const filterStartTime = Date.now();
        const pdfButton = page.getByRole('button', { name: 'PDF' });
        if (await pdfButton.isVisible()) {
          await pdfButton.click();
        }
        await page.waitForTimeout(100);
        const filterResponseTime = Date.now() - filterStartTime;
        console.log(`Filter Click Response (Mobile): ${filterResponseTime}ms`);

        // Close sheet
        const doneButton = page.getByRole('button', { name: 'Done' });
        if (await doneButton.isVisible()) {
          await doneButton.click();
        }
      }
    } else {
      const filterStartTime = Date.now();
      await page.getByRole('button', { name: 'PDF' }).first().click();
      await page.waitForTimeout(100);
      const filterResponseTime = Date.now() - filterStartTime;
      console.log(`Filter Click Response: ${filterResponseTime}ms`);
    }

    // Measure search input response
    const searchInput = page.getByPlaceholder(/search/i);
    const searchStartTime = Date.now();
    await searchInput.fill('test');
    await page.waitForTimeout(100);
    const searchResponseTime = Date.now() - searchStartTime;

    console.log(`Search Input Response: ${searchResponseTime}ms`);
  });
});

test.describe('UI/UX Exploration - Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test('mobile - library layout', async ({ page }) => {
    await page.route('**/api/library', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'book1', title: 'Book 1', sourceType: 'pdf', progress: 50, lastRead: new Date().toISOString(), cover: null },
          { id: 'book2', title: 'Book 2', sourceType: 'epub', progress: 25, lastRead: new Date().toISOString(), cover: null },
        ]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/exploration/mobile-library.png',
      fullPage: true
    });

    // Check mobile navigation is visible
    const mobileNav = page.locator('[data-testid="mobile-bottom-nav"]');
    await expect(mobileNav).toBeVisible();
  });

  test('mobile - filter sheet', async ({ page }) => {
    await page.route('**/api/library', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'book1', title: 'Book 1', sourceType: 'pdf', progress: 50, lastRead: new Date().toISOString(), cover: null },
        ]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for filter button on mobile
    const filterButton = page.locator('button[aria-label*="filter" i], button:has-text("Filter")');
    if (await filterButton.first().isVisible()) {
      await filterButton.first().click();
      await page.waitForTimeout(300);

      await page.screenshot({
        path: 'test-results/exploration/mobile-filter-sheet.png',
        fullPage: true
      });
    }
  });
});

test.describe('UI/UX Exploration - Error States', () => {
  test('network error state', async ({ page }) => {
    await page.route('**/api/library', async (route) => {
      await route.abort('failed');
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'test-results/exploration/error-network.png',
      fullPage: true
    });
  });

  test('404 document not found', async ({ page }) => {
    await page.route('**/api/library/nonexistent', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Document not found' }),
      });
    });

    await page.goto('/read/nonexistent');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'test-results/exploration/error-404.png',
      fullPage: true
    });
  });
});

test.describe('UI/UX Exploration - Visual Consistency', () => {
  test('check focus states', async ({ page }) => {
    await page.route('**/api/library', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'book1', title: 'Book 1', sourceType: 'pdf', progress: 50, lastRead: new Date().toISOString(), cover: null },
        ]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tab through elements and capture focus states
    await page.keyboard.press('Tab');
    await page.screenshot({ path: 'test-results/exploration/focus-state-1.png', fullPage: true });

    await page.keyboard.press('Tab');
    await page.screenshot({ path: 'test-results/exploration/focus-state-2.png', fullPage: true });

    await page.keyboard.press('Tab');
    await page.screenshot({ path: 'test-results/exploration/focus-state-3.png', fullPage: true });
  });

  test('check loading states', async ({ page }) => {
    // Slow down API response to capture loading state
    await page.route('**/api/library', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');

    // Capture loading state quickly
    await page.waitForTimeout(100);
    await page.screenshot({
      path: 'test-results/exploration/loading-state.png',
      fullPage: true
    });
  });
});
