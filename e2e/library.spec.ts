import { test, expect } from '@playwright/test';

test.describe('Library Page', () => {
  test('should display the library page', async ({ page }) => {
    await page.goto('/');

    // Check header is visible
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

    // Check sidebar is visible
    await expect(page.locator('aside')).toBeVisible();
  });

  test('should show empty state when no notes', async ({ page }) => {
    // Mock empty library response
    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');

    await expect(page.getByText('Your library awaits')).toBeVisible();
  });

  test('should display book cards when notes exist', async ({ page }) => {
    // Mock library response with sample notes
    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'note1',
            title: 'Test PDF Book',
            sourceType: 'pdf',
            progress: 45,
            lastRead: new Date().toISOString(),
            cover: null,
          },
          {
            id: 'note2',
            title: 'Test EPUB Book',
            sourceType: 'epub',
            progress: 0,
            lastRead: null,
            cover: null,
          },
        ]),
      });
    });

    await page.goto('/');

    // Use first() since there are multiple text elements with the same title
    await expect(page.getByText('Test PDF Book').first()).toBeVisible();
    await expect(page.getByText('Test EPUB Book').first()).toBeVisible();
  });

  test('should navigate to reader when clicking a book', async ({ page }) => {
    // Mock library response
    await page.route('**/api/library**', async (route) => {
      if (route.request().url().includes('/note1')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'note1',
            title: 'Test PDF Book',
            source: '/path/to/book.pdf',
            sourceType: 'pdf',
            filePath: '/path/to/book.pdf',
            notePath: '/path/to/note.md',
            progress: 45,
            lastRead: new Date().toISOString(),
            tags: ['literature-note'],
            cover: null,
            highlights: [],
            frontmatter: {},
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'note1',
              title: 'Test PDF Book',
              sourceType: 'pdf',
              progress: 45,
              lastRead: new Date().toISOString(),
              cover: null,
            },
          ]),
        });
      }
    });

    await page.goto('/');

    // Click on the book card (use first() since there are multiple text elements)
    await page.getByText('Test PDF Book').first().click();

    // Should navigate to reader
    await expect(page).toHaveURL(/\/read\/note1/);
  });

  test('should sort notes by different criteria', async ({ page }) => {
    let lastSort = '';

    await page.route('**/api/library**', async (route) => {
      const url = new URL(route.request().url());
      lastSort = url.searchParams.get('sort') || 'lastRead';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'note1',
            title: 'Alpha Book',
            sourceType: 'pdf',
            progress: 80,
            lastRead: '2024-01-01T00:00:00Z',
            cover: null,
          },
          {
            id: 'note2',
            title: 'Beta Book',
            sourceType: 'epub',
            progress: 20,
            lastRead: '2024-01-02T00:00:00Z',
            cover: null,
          },
        ]),
      });
    });

    await page.goto('/');

    // Default should be lastRead
    await page.waitForResponse('**/api/library**');
    expect(lastSort).toBe('lastRead');

    // Click Title sort - wait for response in parallel with click
    // Use nth(1) because nth(0) is the search mode "Title" button
    const titleResponsePromise = page.waitForResponse('**/api/library**');
    await page.getByRole('button', { name: 'Title' }).nth(1).click();
    await titleResponsePromise;
    expect(lastSort).toBe('title');

    // Click Progress sort - wait for response in parallel with click
    const progressResponsePromise = page.waitForResponse('**/api/library**');
    await page.getByRole('button', { name: 'Progress' }).click();
    await progressResponsePromise;
    expect(lastSort).toBe('progress');
  });

  test('should toggle theme', async ({ page }) => {
    await page.goto('/');

    // Get initial theme
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );

    // Click theme toggle
    await page.getByTitle('Toggle theme').click();

    // Theme should change
    const newTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );

    expect(newTheme).not.toBe(initialTheme);
  });

  test('should have accessible pinned and unpinned book sections', async ({ page }) => {
    // Mock library response with pinned and unpinned books
    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'note1',
            title: 'Pinned Book',
            sourceType: 'pdf',
            progress: 45,
            lastRead: new Date().toISOString(),
            cover: null,
            pinned: true,
          },
          {
            id: 'note2',
            title: 'Regular Book',
            sourceType: 'epub',
            progress: 0,
            lastRead: null,
            cover: null,
            pinned: false,
          },
        ]),
      });
    });

    await page.goto('/');

    // Verify pinned section has accessible heading (use exact match)
    await expect(page.locator('#pinned-books-heading')).toBeVisible();
    await expect(page.locator('#pinned-books-heading')).toHaveText('Pinned');

    // Verify list elements have proper role
    const pinnedList = page.locator('[role="list"][aria-label="Pinned books"]');
    await expect(pinnedList).toBeVisible();

    // Verify All Books section exists
    await expect(page.locator('#all-books-heading')).toBeVisible();
    await expect(page.locator('#all-books-heading')).toHaveText('All Books');
  });
});
