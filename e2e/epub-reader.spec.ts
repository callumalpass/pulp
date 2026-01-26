import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Load test EPUB file
const __dirname = dirname(fileURLToPath(import.meta.url));
const testEpubPath = join(__dirname, 'fixtures', 'test.epub');
const testEpubData = readFileSync(testEpubPath);

test.describe('EPUB Reader', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the library API to return an EPUB note
    await page.route('**/api/library', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'epub1',
            title: 'Frankenstein',
            sourceType: 'epub',
            progress: 0,
            lastRead: null,
            cover: null,
          },
        ]),
      });
    });

    // Mock the single note API
    await page.route('**/api/library/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'epub1',
          title: 'Frankenstein',
          source: '/path/to/frankenstein.epub',
          sourceType: 'epub',
          filePath: '/path/to/frankenstein.epub',
          notePath: '/path/to/note.md',
          progress: 0,
          lastRead: null,
          tags: ['literature-note'],
          cover: null,
          highlights: [],
          frontmatter: {},
        }),
      });
    });

    // Mock highlights API
    await page.route('**/api/library/epub1/highlights', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Serve the actual EPUB file
    await page.route('**/api/files/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/epub+zip',
        body: testEpubData,
      });
    });
  });

  test('should render EPUB content', async ({ page }) => {
    await page.goto('/read/epub1');

    // Wait for the EPUB to load - look for content in the iframe
    // epub.js renders content in an iframe
    const epubFrame = page.frameLocator('iframe').first();

    // Wait for some text content to appear (Frankenstein starts with a letter)
    await expect(epubFrame.locator('body')).toBeVisible({ timeout: 15000 });

    // The EPUB should have loaded - check that the loading spinner is gone
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
  });

  test('should display reader controls', async ({ page }) => {
    await page.goto('/read/epub1');

    // Reader controls should be visible - using aria-label now
    const backLink = page.locator('a[aria-label="Back to library"]');
    await expect(backLink).toBeVisible({ timeout: 10000 });

    // Wait for EPUB to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Page navigation should show - look for the "/ X" text that appears after the page input
    await expect(page.locator('text=/\\/ \\d+/')).toBeVisible();
  });

  test('should navigate with keyboard', async ({ page }) => {
    await page.goto('/read/epub1');

    // Wait for EPUB to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Wait for total pages to be populated (indicates EPUB is fully loaded)
    await expect(page.locator('text=/\\/ \\d+/')).toBeVisible();

    // Press right arrow to go to next page
    await page.keyboard.press('ArrowRight');

    // Wait a moment for navigation
    await page.waitForTimeout(500);

    // The reader should still be functional (no crash)
    const backLink = page.locator('a[aria-label="Back to library"]');
    await expect(backLink).toBeVisible();
  });

  test('should navigate back to library', async ({ page }) => {
    await page.goto('/read/epub1');

    // Wait for reader to be ready - using aria-label now
    const backLink = page.locator('a[aria-label="Back to library"]');
    await expect(backLink).toBeVisible({ timeout: 10000 });

    // Click back button
    await backLink.click();

    // Should be on library page
    await expect(page).toHaveURL('/');
  });

});
