import { test, expect } from '@playwright/test';

// Sample mock data with CSL metadata
const mockNotesWithCSL = [
  {
    id: 'note1',
    title: 'Madness and Civilization',
    author: 'Michel Foucault',
    citekey: 'foucaultMadness88',
    sourceType: 'pdf',
    progress: 45,
    lastRead: '2024-01-15T10:30:00Z',
    cover: null,
    pinned: false,
    rating: 4,
    totalPages: 299,
    collections: [],
    csl: {
      type: 'book',
      publisher: 'Random House',
      publisherPlace: 'New York',
      issued: '1988',
      isbn: '978-0-679-72110-9',
      containerTitle: null,
      translator: 'Richard Howard',
      doi: null,
      url: null,
      edition: 'Vintage Books Ed.',
      volume: null,
      issue: null,
      page: null,
      collectionTitle: null,
    },
  },
  {
    id: 'note2',
    title: 'Learning to Look',
    author: 'Philip Wilson',
    citekey: 'wilsonLearning23',
    sourceType: 'pdf',
    progress: 0,
    lastRead: null,
    cover: null,
    pinned: true,
    rating: null,
    totalPages: 26,
    collections: [],
    csl: {
      type: 'chapter',
      publisher: 'Routledge',
      publisherPlace: 'New York',
      issued: '2023-09-13',
      isbn: '9781003300076',
      containerTitle: 'Between Wittgenstein and Weil',
      translator: null,
      doi: '10.4324/9781003300076-4',
      url: 'https://www.taylorfrancis.com/books/9781003300076/chapters/10.4324/9781003300076-4',
      edition: '1',
      volume: null,
      issue: null,
      page: '56-82',
      collectionTitle: null,
    },
  },
  {
    id: 'note3',
    title: 'Specters of Marx',
    author: 'Jacques Derrida',
    citekey: 'derridaSpecters94',
    sourceType: 'pdf',
    progress: 100,
    lastRead: '2024-01-10T14:00:00Z',
    dateFinished: '2024-01-10T14:00:00Z',
    cover: null,
    pinned: false,
    rating: 5,
    totalPages: 258,
    collections: [],
    csl: {
      type: 'book',
      publisher: 'Routledge',
      publisherPlace: 'London',
      issued: '2011',
      isbn: '9780415389570',
      containerTitle: null,
      translator: 'Peggy Kamuf',
      doi: null,
      url: null,
      edition: null,
      volume: null,
      issue: null,
      page: null,
      collectionTitle: 'Routledge classics',
    },
  },
];

test.describe('Library List View', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the library API response
    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockNotesWithCSL),
      });
    });
  });

  test('should toggle between grid and list view', async ({ page }) => {
    await page.goto('/');

    // Wait for library to load
    await expect(page.getByText('Madness and Civilization').first()).toBeVisible();

    // Default view should be grid (no list view container)
    await expect(page.getByTestId('library-list-view')).not.toBeVisible();

    // Click list view button
    await page.getByRole('button', { name: 'List view' }).click();

    // List view should now be visible
    await expect(page.getByTestId('library-list-view')).toBeVisible();

    // Click grid view button to go back
    await page.getByRole('button', { name: 'Grid view' }).click();

    // List view should be hidden again
    await expect(page.getByTestId('library-list-view')).not.toBeVisible();
  });

  test('should display books in list format with correct data', async ({ page }) => {
    await page.goto('/');

    // Switch to list view
    await page.getByRole('button', { name: 'List view' }).click();

    // Check that list view is displayed
    const listView = page.getByTestId('library-list-view');
    await expect(listView).toBeVisible();

    // Check column headers are visible (within the list view header row)
    const headerRow = listView.locator('.hidden.sm\\:flex').first();
    await expect(headerRow.getByText('Title')).toBeVisible();
    await expect(headerRow.getByText('Author')).toBeVisible();
    await expect(headerRow.getByText('Year')).toBeVisible();
    await expect(headerRow.getByText('Type')).toBeVisible();
    await expect(headerRow.getByText('Progress')).toBeVisible();
    await expect(headerRow.getByText('Rating')).toBeVisible();

    // Check book titles are displayed
    await expect(page.getByTestId('list-row-title').filter({ hasText: 'Madness and Civilization' })).toBeVisible();
    await expect(page.getByTestId('list-row-title').filter({ hasText: 'Learning to Look' })).toBeVisible();
    await expect(page.getByTestId('list-row-title').filter({ hasText: 'Specters of Marx' })).toBeVisible();
  });

  test('should display author column correctly', async ({ page }) => {
    // Skip on mobile viewports where author column is hidden
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width < 640) {
      test.skip();
      return;
    }

    await page.goto('/');
    await page.getByRole('button', { name: 'List view' }).click();

    // Check authors are displayed in the author column
    const authorCells = page.getByTestId('list-row-author');
    await expect(authorCells.filter({ hasText: 'Michel Foucault' })).toBeVisible();
    await expect(authorCells.filter({ hasText: 'Philip Wilson' })).toBeVisible();
    await expect(authorCells.filter({ hasText: 'Jacques Derrida' })).toBeVisible();
  });

  test('should display correct CSL type labels', async ({ page }) => {
    // Skip on mobile viewports where type column is hidden
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width < 640) {
      test.skip();
      return;
    }

    await page.goto('/');
    await page.getByRole('button', { name: 'List view' }).click();

    // Check type labels - "Book" for books, "Chapter" for chapters
    const typeCells = page.getByTestId('list-row-type');

    // Should have Book types
    await expect(typeCells.filter({ hasText: 'Book' }).first()).toBeVisible();

    // Should have Chapter type
    await expect(typeCells.filter({ hasText: 'Chapter' })).toBeVisible();
  });

  test('should display progress correctly', async ({ page }) => {
    // Skip on mobile viewports where progress column is hidden
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width < 640) {
      test.skip();
      return;
    }

    await page.goto('/');
    await page.getByRole('button', { name: 'List view' }).click();

    const progressCells = page.getByTestId('list-row-progress');

    // 45% progress
    await expect(progressCells.filter({ hasText: '45%' })).toBeVisible();

    // Unread (0%)
    await expect(progressCells.filter({ hasText: 'Unread' })).toBeVisible();

    // Completed (100%)
    await expect(progressCells.filter({ hasText: 'Done' })).toBeVisible();
  });

  test('should display ratings correctly', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'List view' }).click();

    const ratingCells = page.getByTestId('list-row-rating');

    // Check that rating cells exist (we can't easily check star rendering)
    await expect(ratingCells).toHaveCount(3);
  });

  test('should separate pinned and unpinned books', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'List view' }).click();

    const listView = page.getByTestId('library-list-view');

    // Check that pinned section exists within list view
    await expect(listView.getByRole('heading', { name: 'Pinned' })).toBeVisible();

    // Check that "All Books" section exists within list view when there are pinned items
    await expect(listView.getByRole('heading', { name: 'All Books' })).toBeVisible();

    // The pinned book should be in the pinned section
    const pinnedSection = listView.locator('section').filter({ has: page.getByRole('heading', { name: 'Pinned' }) });
    await expect(pinnedSection.getByText('Learning to Look')).toBeVisible();
  });

  test('should navigate to reader when clicking a list row', async ({ page }) => {
    // Additional mock for the note detail endpoint
    await page.route('**/api/library/note1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockNotesWithCSL[0],
          source: '/path/to/book.pdf',
          filePath: '/path/to/book.pdf',
          notePath: '/path/to/note.md',
          tags: ['literature-note'],
          highlights: [],
          frontmatter: {},
        }),
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'List view' }).click();

    // Click on a book row
    await page.getByTestId('library-list-row').filter({ hasText: 'Madness and Civilization' }).click();

    // Should navigate to reader
    await expect(page).toHaveURL(/\/read\/note1/);
  });

  test('should persist view mode preference', async ({ page }) => {
    await page.goto('/');

    // Switch to list view
    await page.getByRole('button', { name: 'List view' }).click();
    await expect(page.getByTestId('library-list-view')).toBeVisible();

    // Reload the page
    await page.reload();

    // Wait for content to load
    await expect(page.getByText('Madness and Civilization').first()).toBeVisible();

    // List view should still be active after reload
    await expect(page.getByTestId('library-list-view')).toBeVisible();
  });

  test('should work with filters in list view', async ({ page }) => {
    // Skip on mobile viewports where filter buttons may be in a sheet
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width < 640) {
      test.skip();
      return;
    }

    await page.goto('/');
    await page.getByRole('button', { name: 'List view' }).click();

    // Wait for list to render
    await expect(page.getByTestId('library-list-view')).toBeVisible();

    // Apply progress filter to show only completed
    await page.getByRole('button', { name: 'Completed' }).click();

    // Wait for filter to apply
    await page.waitForTimeout(300);

    // Only Specters of Marx should be visible (100% progress)
    await expect(page.getByTestId('list-row-title').filter({ hasText: 'Specters of Marx' })).toBeVisible();
    await expect(page.getByTestId('list-row-title').filter({ hasText: 'Madness and Civilization' })).not.toBeVisible();
    await expect(page.getByTestId('list-row-title').filter({ hasText: 'Learning to Look' })).not.toBeVisible();
  });

  test('should show empty state in list view when no books match filters', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'List view' }).click();

    // Apply a filter that matches nothing (search for nonexistent title)
    await page.getByPlaceholder('Search by title...').fill('nonexistent book xyz');

    // Should show no matches message
    await expect(page.getByText('No matches found')).toBeVisible();
  });
});

test.describe('Library List View - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockNotesWithCSL),
      });
    });
  });

  test('should toggle view mode on mobile', async ({ page }) => {
    await page.goto('/');

    // Wait for library to load
    await expect(page.getByText('Madness and Civilization').first()).toBeVisible();

    // Click the view toggle button (shows list icon when in grid mode)
    await page.getByRole('button', { name: 'Switch to list view' }).click();

    // List view should be visible
    await expect(page.getByTestId('library-list-view')).toBeVisible();

    // Click again to go back to grid
    await page.getByRole('button', { name: 'Switch to grid view' }).click();

    // List view should be hidden
    await expect(page.getByTestId('library-list-view')).not.toBeVisible();
  });

  test('should hide column headers on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Switch to list view' }).click();

    // Column headers should not be visible on mobile (they have hidden sm:flex)
    // The header row with "Author" text should not be visible
    const headerRow = page.locator('.hidden.sm\\:flex').filter({ hasText: 'Author' });
    await expect(headerRow).not.toBeVisible();
  });

  test('should show author inline with title on mobile', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Switch to list view' }).click();

    // Wait for list view to appear
    await expect(page.getByTestId('library-list-view')).toBeVisible();

    // On mobile, author should appear below the title in the main content area (within the sm:hidden section)
    const listRow = page.getByTestId('library-list-row').filter({ hasText: 'Madness and Civilization' });
    // The author text appears in the mobile subtitle area (sm:hidden div)
    await expect(listRow.locator('.sm\\:hidden').filter({ hasText: 'Michel Foucault' })).toBeVisible();
  });
});
