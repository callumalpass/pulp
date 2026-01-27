import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Load test PDF file
const __dirname = dirname(fileURLToPath(import.meta.url));
const testPdfPath = join(__dirname, 'fixtures', 'test.pdf');
const testPdfData = readFileSync(testPdfPath);

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

    // Serve the actual PDF file
    await page.route('**/api/files/note1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: testPdfData,
      });
    });
  });

  test('should display reader controls', async ({ page }) => {
    await page.goto('/read/note1');

    // Wait for PDF to load - the spinner should disappear
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

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
      await expect(spinner).toBeHidden({ timeout: 15000 });
    }
  });

  test('should navigate back to library', async ({ page }) => {
    // First set up the reader page route
    await page.goto('/read/note1');

    // Wait for PDF to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

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

    // Wait for PDF to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Wait for toolbar to appear
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

    // 404 shows "Document not found" error message
    await expect(page.getByText('Document not found')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Back to Library')).toBeVisible();
  });
});
