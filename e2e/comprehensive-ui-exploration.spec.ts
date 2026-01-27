import { test, expect } from '@playwright/test';

// Comprehensive UI/UX exploration tests
test.describe('Comprehensive UI/UX Exploration', () => {
  const mockLibraryData = [
    {
      id: 'note1',
      title: 'The Art of Computer Programming',
      author: 'Donald Knuth',
      sourceType: 'pdf',
      progress: 67,
      lastRead: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      cover: null,
      pinned: true,
      rating: 5,
      highlightCount: 12,
      totalPages: 672,
      collections: ['Computer Science'],
      currentChapter: 'Chapter 4: Mathematical Functions',
      readingStats: {
        totalReadingTimeMs: 1000 * 60 * 240,
        pagesPerHour: 25,
      },
    },
    {
      id: 'note2',
      title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
      author: 'Robert C. Martin',
      sourceType: 'epub',
      progress: 100,
      lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      cover: null,
      pinned: false,
      rating: 4,
      highlightCount: 8,
      totalPages: 464,
      collections: ['Programming'],
      dateFinished: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      readingStats: {
        totalReadingTimeMs: 1000 * 60 * 180,
        pagesPerHour: 30,
      },
    },
    {
      id: 'note3',
      title: 'Design Patterns',
      author: 'Gang of Four',
      sourceType: 'pdf',
      progress: 23,
      lastRead: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      cover: null,
      pinned: false,
      rating: null,
      highlightCount: 3,
      totalPages: 395,
      collections: ['Programming', 'Architecture'],
      currentChapter: 'Creational Patterns',
      readingStats: {
        totalReadingTimeMs: 1000 * 60 * 90,
        pagesPerHour: 20,
      },
    },
    {
      id: 'note4',
      title: 'The Pragmatic Programmer',
      author: 'David Thomas, Andrew Hunt',
      sourceType: 'epub',
      progress: 0,
      lastRead: null,
      cover: null,
      pinned: false,
      rating: null,
      highlightCount: 0,
      totalPages: 352,
      collections: ['Programming'],
      readingStats: null,
    },
    {
      id: 'note5',
      title: 'Structure and Interpretation of Computer Programs',
      author: 'Harold Abelson',
      sourceType: 'pdf',
      progress: 45,
      lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      cover: null,
      pinned: false,
      rating: 5,
      highlightCount: 20,
      totalPages: 657,
      collections: ['Computer Science'],
      readingStats: {
        totalReadingTimeMs: 1000 * 60 * 300,
        pagesPerHour: 18,
      },
    },
  ];

  async function setupMocks(page: import('@playwright/test').Page) {
    await page.route('**/api/library**', async (route) => {
      if (route.request().url().includes('/note')) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLibraryData),
      });
    });

    await page.route('**/api/collections', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          collections: ['Computer Science', 'Programming', 'Architecture'],
        }),
      });
    });

    await page.route('**/api/search/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          isComplete: true,
          indexedDocuments: 5,
          totalDocuments: 5,
          percentComplete: 100,
        }),
      });
    });
  }

  test('analyze desktop library view - interactions and performance', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for content
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Capture default state
    await page.screenshot({ path: 'e2e/screenshots/exploration/desktop-default.png', fullPage: true });

    // Test hover interactions on cards
    const firstCard = page.locator('.library-card').first();
    await firstCard.hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/exploration/desktop-card-hover.png', fullPage: true });

    // Test rating dropdown interaction
    const rateButton = page.locator('button[title="Add rating"]').first();
    if (await rateButton.isVisible()) {
      await rateButton.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'e2e/screenshots/exploration/desktop-rating-open.png', fullPage: true });
      await page.keyboard.press('Escape');
    }

    // Test filter interactions
    await page.getByRole('button', { name: 'PDF' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'e2e/screenshots/exploration/desktop-filtered.png', fullPage: true });

    // Test list view
    await page.getByRole('button', { name: 'All' }).first().click();
    await page.getByRole('button', { name: 'List view' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'e2e/screenshots/exploration/desktop-list-view.png', fullPage: true });

    // Back to grid
    await page.getByRole('button', { name: 'Grid view' }).click();

    // Test search functionality
    await page.locator('input[type="search"]').fill('Design');
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'e2e/screenshots/exploration/desktop-search.png', fullPage: true });

    // Clear and test light theme
    await page.locator('input[type="search"]').clear();
    await page.getByTitle('Toggle theme').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/exploration/desktop-light-theme.png', fullPage: true });
  });

  test('analyze mobile library view - touch interactions', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMocks(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Capture default mobile state
    await page.screenshot({ path: 'e2e/screenshots/exploration/mobile-default.png', fullPage: true });

    // Open mobile filters
    await page.getByRole('button', { name: /Filters/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/exploration/mobile-filters-open.png', fullPage: true });

    // Close filters
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Test tap on continue reading card
    const continueReading = page.locator('text=Continue Reading').first();
    if (await continueReading.isVisible()) {
      await page.screenshot({ path: 'e2e/screenshots/exploration/mobile-continue-reading.png' });
    }

    // Test scroll behavior
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'e2e/screenshots/exploration/mobile-scrolled.png', fullPage: true });
  });

  test('analyze loading states and transitions', async ({ page }) => {
    // Slow down the API to capture loading state
    await page.route('**/api/library**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLibraryData),
      });
    });

    await page.goto('/');

    // Capture skeleton loading
    await page.screenshot({ path: 'e2e/screenshots/exploration/loading-skeleton.png', fullPage: true });

    // Wait for content to load
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'e2e/screenshots/exploration/loaded.png', fullPage: true });
  });

  test('analyze Continue Reading card prominence', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Continue Reading').first()).toBeVisible();

    // Focus on the continue reading section
    const continueSection = page.locator('text=Continue Reading').first().locator('..');
    await continueSection.screenshot({ path: 'e2e/screenshots/exploration/continue-reading-section.png' });

    // Test hover on continue reading card
    const continueCard = page.locator('[class*="ContinueReading"], .library-card').first();
    if (await continueCard.isVisible()) {
      await continueCard.hover();
      await page.waitForTimeout(300);
      await continueSection.screenshot({ path: 'e2e/screenshots/exploration/continue-reading-hover.png' });
    }
  });

  test('analyze accessibility and keyboard navigation', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    await page.screenshot({ path: 'e2e/screenshots/exploration/focus-first.png', fullPage: true });

    // Continue tabbing
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }
    await page.screenshot({ path: 'e2e/screenshots/exploration/focus-navigation.png', fullPage: true });

    // Test focus visibility on cards
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
    }
    await page.screenshot({ path: 'e2e/screenshots/exploration/focus-card.png', fullPage: true });
  });

  test('measure performance metrics', async ({ page }) => {
    await setupMocks(page);

    // Start performance measurement
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const domContentLoaded = Date.now() - startTime;

    await page.waitForLoadState('networkidle');
    const networkIdle = Date.now() - startTime;

    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();
    const contentVisible = Date.now() - startTime;

    // Log performance metrics
    console.log('=== Performance Metrics ===');
    console.log(`DOM Content Loaded: ${domContentLoaded}ms`);
    console.log(`Network Idle: ${networkIdle}ms`);
    console.log(`Content Visible: ${contentVisible}ms`);

    // Measure filter interaction speed
    const filterStart = Date.now();
    await page.getByRole('button', { name: 'PDF' }).click();
    await page.waitForTimeout(100);
    const filterTime = Date.now() - filterStart;
    console.log(`Filter Interaction: ${filterTime}ms`);

    // Measure render performance with many items
    const renderMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('paint');
      return {
        firstPaint: entries.find(e => e.name === 'first-paint')?.startTime,
        firstContentfulPaint: entries.find(e => e.name === 'first-contentful-paint')?.startTime,
      };
    });
    console.log(`First Paint: ${renderMetrics.firstPaint}ms`);
    console.log(`First Contentful Paint: ${renderMetrics.firstContentfulPaint}ms`);
  });
});
