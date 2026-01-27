import { test, expect } from '@playwright/test';

// UI Analysis tests - capture screenshots for analysis
test.describe('UI Analysis', () => {
  test('capture library page states', async ({ page }) => {
    // Mock library response with sample notes for different states
    await page.route('**/api/library**', async (route) => {
      if (route.request().url().includes('/note')) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'note1',
            title: 'The Art of Computer Programming',
            author: 'Donald Knuth',
            sourceType: 'pdf',
            progress: 67,
            lastRead: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
            cover: null,
            pinned: true,
            rating: 5,
            highlightCount: 12,
            totalPages: 672,
            collections: ['Computer Science'],
            readingStats: {
              totalReadingTimeMs: 1000 * 60 * 240, // 4 hours
              pagesPerHour: 25,
            },
          },
          {
            id: 'note2',
            title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
            author: 'Robert C. Martin',
            sourceType: 'epub',
            progress: 100,
            lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
            cover: null,
            pinned: false,
            rating: 4,
            highlightCount: 8,
            totalPages: 464,
            collections: ['Programming'],
            dateFinished: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
            readingStats: {
              totalReadingTimeMs: 1000 * 60 * 180, // 3 hours
              pagesPerHour: 30,
            },
          },
          {
            id: 'note3',
            title: 'Design Patterns: Elements of Reusable Object-Oriented Software',
            author: 'Gang of Four',
            sourceType: 'pdf',
            progress: 23,
            lastRead: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
            cover: null,
            pinned: false,
            rating: null,
            highlightCount: 3,
            totalPages: 395,
            collections: ['Programming', 'Architecture'],
            readingStats: {
              totalReadingTimeMs: 1000 * 60 * 90, // 1.5 hours
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
            lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
            cover: null,
            pinned: false,
            rating: 5,
            highlightCount: 20,
            totalPages: 657,
            collections: ['Computer Science'],
            readingStats: {
              totalReadingTimeMs: 1000 * 60 * 300, // 5 hours
              pagesPerHour: 18,
            },
          },
          {
            id: 'note6',
            title: 'Introduction to Algorithms',
            author: 'Thomas H. Cormen',
            sourceType: 'pdf',
            progress: 12,
            lastRead: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), // 3 days ago
            cover: null,
            pinned: false,
            rating: 4,
            highlightCount: 5,
            totalPages: 1312,
            collections: ['Computer Science', 'Algorithms'],
            readingStats: {
              totalReadingTimeMs: 1000 * 60 * 60, // 1 hour
              pagesPerHour: 15,
            },
          },
        ]),
      });
    });

    await page.route('**/api/collections', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          collections: ['Computer Science', 'Programming', 'Architecture', 'Algorithms'],
        }),
      });
    });

    // Navigate to library
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Screenshot: Default library view
    await page.screenshot({
      path: 'e2e/screenshots/library-default.png',
      fullPage: true
    });

    // Screenshot: Hover state on a book card
    await page.locator('text=The Art of Computer Programming').first().hover();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'e2e/screenshots/library-card-hover.png',
      fullPage: true
    });

    // Screenshot: Filter buttons active
    await page.getByRole('button', { name: 'PDF' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: 'e2e/screenshots/library-filtered-pdf.png',
      fullPage: true
    });

    // Reset filter
    await page.getByRole('button', { name: 'All' }).first().click();
    await page.waitForTimeout(200);

    // Screenshot: Progress filter active
    await page.getByRole('button', { name: 'Reading' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: 'e2e/screenshots/library-filtered-reading.png',
      fullPage: true
    });

    // Reset to show all
    await page.getByRole('button', { name: 'All' }).nth(1).click();
    await page.waitForTimeout(200);

    // Screenshot: Light theme
    await page.getByTitle('Toggle theme').click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'e2e/screenshots/library-light-theme.png',
      fullPage: true
    });

    // Screenshot: Light theme - list view
    await page.getByRole('button', { name: 'List view' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'e2e/screenshots/library-light-theme-list.png',
      fullPage: true
    });

    // Back to grid view
    await page.getByRole('button', { name: 'Grid view' }).click();
    await page.waitForTimeout(200);

    // Back to dark theme
    await page.getByTitle('Toggle theme').click();
    await page.waitForTimeout(300);

    // Screenshot: Search active
    await page.locator('input[type="search"]').fill('Design');
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'e2e/screenshots/library-search-active.png',
      fullPage: true
    });
  });

  test('capture empty states', async ({ page }) => {
    // Mock empty library
    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Your library awaits')).toBeVisible();

    await page.screenshot({
      path: 'e2e/screenshots/library-empty.png',
      fullPage: true
    });
  });

  test('capture loading states', async ({ page }) => {
    // Delay the API response to capture loading state
    await page.route('**/api/library**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');

    // Screenshot immediately to catch skeleton loading
    await page.screenshot({
      path: 'e2e/screenshots/library-loading.png',
      fullPage: true
    });
  });

  test('capture mobile view', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'note1',
            title: 'The Art of Computer Programming',
            author: 'Donald Knuth',
            sourceType: 'pdf',
            progress: 67,
            lastRead: new Date().toISOString(),
            cover: null,
            pinned: true,
            rating: 5,
            highlightCount: 12,
            totalPages: 672,
            collections: [],
            readingStats: {
              totalReadingTimeMs: 1000 * 60 * 240,
              pagesPerHour: 25,
            },
          },
          {
            id: 'note2',
            title: 'Clean Code',
            author: 'Robert C. Martin',
            sourceType: 'epub',
            progress: 100,
            lastRead: new Date().toISOString(),
            cover: null,
            pinned: false,
            rating: 4,
            highlightCount: 8,
            totalPages: 464,
            collections: [],
            dateFinished: new Date().toISOString(),
            readingStats: null,
          },
          {
            id: 'note3',
            title: 'Design Patterns',
            author: 'Gang of Four',
            sourceType: 'pdf',
            progress: 23,
            lastRead: new Date().toISOString(),
            cover: null,
            pinned: false,
            rating: null,
            highlightCount: 3,
            totalPages: 395,
            collections: [],
            readingStats: null,
          },
          {
            id: 'note4',
            title: 'The Pragmatic Programmer',
            author: 'David Thomas',
            sourceType: 'epub',
            progress: 0,
            lastRead: null,
            cover: null,
            pinned: false,
            rating: null,
            highlightCount: 0,
            totalPages: 352,
            collections: [],
            readingStats: null,
          },
        ]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    await page.screenshot({
      path: 'e2e/screenshots/library-mobile.png',
      fullPage: true
    });

    // Open mobile filters
    await page.getByRole('button', { name: /Filters/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'e2e/screenshots/library-mobile-filters.png',
      fullPage: true
    });

    // Close filters and switch to light theme
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.getByTitle('Toggle theme').click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'e2e/screenshots/library-mobile-light.png',
      fullPage: true
    });

    // Open filters in light mode
    await page.getByRole('button', { name: /Filters/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'e2e/screenshots/library-mobile-filters-light.png',
      fullPage: true
    });
  });
});
