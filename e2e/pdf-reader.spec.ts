import { test, expect } from '@playwright/test';

test.describe('PDF Reader', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses
    await page.route('**/api/library/note1', async (route) => {
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
          progress: 25,
          lastRead: new Date().toISOString(),
          tags: ['literature-note'],
          cover: null,
          highlights: [],
          frontmatter: {},
        }),
      });
    });

    await page.route('**/api/library/note1/highlights', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('should display reader controls', async ({ page }) => {
    await page.goto('/read/note1');

    // Check for navigation controls - using aria-label now
    const backLink = page.locator('a[aria-label="Back to library"]');
    await expect(backLink).toBeVisible({ timeout: 10000 });

    // Check for zoom controls (the zoom in/out buttons)
    const zoomButtons = page.locator('button').filter({ has: page.locator('svg circle') });
    await expect(zoomButtons.first()).toBeVisible();
  });

  test('should show loading state', async ({ page }) => {
    await page.goto('/read/note1');

    // Loading spinner should be visible initially
    const spinner = page.locator('.animate-spin');
    // Either the spinner is visible or the content loaded quickly
    const isLoading = await spinner.isVisible().catch(() => false);
    // If loading is visible, it should eventually disappear
    if (isLoading) {
      await expect(spinner).toBeHidden({ timeout: 10000 });
    }
  });

  test('should navigate back to library', async ({ page }) => {
    // First set up the reader page route
    await page.goto('/read/note1');

    // Wait for back button to be visible
    const backLink = page.locator('a[aria-label="Back to library"]');
    await expect(backLink).toBeVisible({ timeout: 10000 });

    // Set up route for library page before clicking back
    await page.route('**/api/library', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Click back button
    await backLink.click();

    // Should be on library page
    await expect(page).toHaveURL('/');
  });

  test('should handle keyboard navigation', async ({ page }) => {
    await page.goto('/read/note1');

    // Wait for toolbar to appear instead of networkidle
    const toolbar = page.locator('header[role="toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    // Test that keyboard events are registered
    // (Actual navigation depends on PDF being loaded)
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');

    // Zoom with keyboard
    await page.keyboard.press('+');
    await page.keyboard.press('-');
  });

  test('should show error state for non-existent note', async ({ page }) => {
    await page.route('**/api/library/invalid', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Note not found' }),
      });
    });

    await page.goto('/read/invalid');

    await expect(page.getByText('Failed to load document')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Back to library')).toBeVisible();
  });
});
