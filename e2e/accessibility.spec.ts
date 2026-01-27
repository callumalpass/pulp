import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Load test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const testEpubPath = join(__dirname, 'fixtures', 'test.epub');
const testEpubData = readFileSync(testEpubPath);
const testPdfPath = join(__dirname, 'fixtures', 'test.pdf');
const testPdfData = readFileSync(testPdfPath);

test.describe('Accessibility - EPUB Reader', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the library API to return an EPUB note
    await page.route('**/api/library', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'epub1',
            title: 'Test EPUB Book',
            sourceType: 'epub',
            progress: 0,
            lastRead: null,
            cover: null,
          },
        ]),
      });
    });

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
          progress: 0,
          lastRead: null,
          tags: ['literature-note'],
          cover: null,
          highlights: [],
          frontmatter: {},
        }),
      });
    });

    await page.route('**/api/library/epub1/highlights', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/files/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/epub+zip',
        body: testEpubData,
      });
    });
  });

  test('should have accessible reader controls', async ({ page }) => {
    await page.goto('/read/epub1');

    // Wait for the EPUB to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Check that the toolbar has proper role
    const toolbar = page.locator('header[role="toolbar"]');
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toHaveAttribute('aria-label', 'Reader controls');

    // Back link should have accessible label
    const backLink = page.locator('a[aria-label="Back to library"]');
    await expect(backLink).toBeVisible();

    // Page navigation should have proper ARIA attributes
    const pageNav = page.locator('nav[aria-label="Page navigation"]');
    await expect(pageNav).toBeVisible();

    // Previous/next buttons should have aria-labels
    await expect(page.locator('button[aria-label="Previous page"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Next page"]')).toBeVisible();
  });

  test('should have accessible progress bar', async ({ page }) => {
    await page.goto('/read/epub1');

    // Wait for the EPUB to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Progress bar should have proper ARIA attributes
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible();
    await expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    await expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  test('should have accessible settings panel', async ({ page }) => {
    await page.goto('/read/epub1');

    // Wait for the EPUB to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Find and click settings button
    const settingsButton = page.locator('button[aria-label="Reading settings"]');
    await expect(settingsButton).toBeVisible();
    await expect(settingsButton).toHaveAttribute('aria-expanded', 'false');

    // Open settings
    await settingsButton.click();

    // Button should now show expanded
    await expect(settingsButton).toHaveAttribute('aria-expanded', 'true');

    // Settings panel should have proper role
    const settingsPanel = page.locator('aside[role="region"][aria-label="Reading settings"]');
    await expect(settingsPanel).toBeVisible();

    // Theme controls should be a radiogroup
    const themeGroup = page.locator('[role="radiogroup"][aria-label="Reader theme"]');
    await expect(themeGroup).toBeVisible();

    // Font size slider should have proper label
    const fontSizeInput = page.locator('#epub-font-size');
    await expect(fontSizeInput).toBeVisible();
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/read/epub1');

    // Wait for the EPUB to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Focus should be manageable via Tab key
    await page.keyboard.press('Tab');

    // The focused element should be visible
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();

    // Test keyboard navigation (arrow keys for page navigation)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);

    // Test Escape to close panels
    const settingsButton = page.locator('button[aria-label="Reading settings"]');
    await settingsButton.click();
    await expect(page.locator('aside[role="region"][aria-label="Reading settings"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('aside[role="region"][aria-label="Reading settings"]')).not.toBeVisible();
  });

  test('should announce page changes to screen readers', async ({ page }) => {
    await page.goto('/read/epub1');

    // Wait for the EPUB to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Page indicator should have aria-live for announcements
    const pageIndicator = page.locator('span[aria-live="polite"]').first();
    await expect(pageIndicator).toBeVisible();
  });
});

test.describe('Accessibility - PDF Reader', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/library/pdf1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'pdf1',
          title: 'Test PDF Book',
          source: '/path/to/test.pdf',
          sourceType: 'pdf',
          filePath: '/path/to/test.pdf',
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

    await page.route('**/api/library/pdf1/highlights', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Serve the actual PDF file for the toolbar to appear
    await page.route('**/api/files/pdf1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: testPdfData,
      });
    });
  });

  test('should have accessible toolbar with proper ARIA attributes', async ({ page }) => {
    await page.goto('/read/pdf1');

    // Wait for PDF to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Wait for toolbar to appear
    const toolbar = page.locator('header[role="toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    await expect(toolbar).toHaveAttribute('aria-label', 'PDF reader controls');

    // Back link should be accessible
    const backLink = page.locator('a[aria-label="Back to library"]');
    await expect(backLink).toBeVisible();
  });

  test('should have accessible page navigation', async ({ page }) => {
    await page.goto('/read/pdf1');

    // Wait for PDF to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Wait for toolbar to appear
    const toolbar = page.locator('header[role="toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    // Page navigation should have proper role
    const pageNav = page.locator('nav[aria-label="Page navigation"]');
    await expect(pageNav).toBeVisible();

    // Page input should have accessible label
    const pageInput = page.locator('#page-input');
    await expect(pageInput).toBeVisible();

    // Navigation buttons should have aria-labels
    await expect(page.locator('button[aria-label="Previous page"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Next page"]')).toBeVisible();
  });

  test('should have accessible zoom controls', async ({ page }) => {
    await page.goto('/read/pdf1');

    // Wait for PDF to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Wait for toolbar to appear
    const toolbar = page.locator('header[role="toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    // Zoom controls group should have proper label
    const zoomGroup = page.locator('[role="group"][aria-label="Zoom controls"]');
    await expect(zoomGroup).toBeVisible();

    // Zoom in/out buttons should have aria-labels
    await expect(page.locator('button[aria-label="Zoom out"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Zoom in"]')).toBeVisible();

    // Zoom dropdown should have proper ARIA attributes
    const zoomDropdown = page.locator('button[aria-haspopup="listbox"]');
    await expect(zoomDropdown).toBeVisible();
    await expect(zoomDropdown).toHaveAttribute('aria-expanded', 'false');
  });

  test('should have accessible search functionality', async ({ page }) => {
    await page.goto('/read/pdf1');

    // Wait for PDF to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Wait for toolbar to appear
    const toolbar = page.locator('header[role="toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    // Search area should have search role
    const searchArea = page.locator('[role="search"]');
    await expect(searchArea).toBeVisible();

    // Search toggle button should have proper attributes
    const searchButton = page.locator('button[aria-label="Search (Ctrl+F)"]');
    await expect(searchButton).toBeVisible();
    await expect(searchButton).toHaveAttribute('aria-expanded', 'false');

    // Open search
    await searchButton.click();
    await expect(searchButton).toHaveAttribute('aria-expanded', 'true');

    // Search input should be accessible
    const searchInput = page.locator('#pdf-search');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('type', 'search');
  });

  test('should have accessible view mode controls', async ({ page }) => {
    await page.goto('/read/pdf1');

    // Wait for PDF to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Wait for toolbar to appear
    const toolbar = page.locator('header[role="toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    // View mode group should have proper label
    const viewModeGroup = page.locator('[role="group"][aria-label="View mode"]');
    await expect(viewModeGroup).toBeVisible();

    // View mode buttons should have aria-pressed
    const singlePageButton = page.locator('button[aria-label="Single page view"]');
    await expect(singlePageButton).toBeVisible();
    await expect(singlePageButton).toHaveAttribute('aria-pressed', 'true');

    const spreadButton = page.locator('button[aria-label="Two-page spread view"]');
    await expect(spreadButton).toBeVisible();
    await expect(spreadButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('should have accessible progress indicator', async ({ page }) => {
    await page.goto('/read/pdf1');

    // Wait for PDF to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Wait for toolbar to appear
    const toolbar = page.locator('header[role="toolbar"]');
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    // Progress bar should have proper ARIA attributes
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible();
    await expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    await expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });
});

test.describe('Accessibility - Library Page', () => {
  test('should have accessible library structure', async ({ page }) => {
    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'note1',
            title: 'Test Book 1',
            sourceType: 'pdf',
            progress: 50,
            lastRead: new Date().toISOString(),
            cover: null,
          },
          {
            id: 'note2',
            title: 'Test Book 2',
            sourceType: 'epub',
            progress: 25,
            lastRead: new Date().toISOString(),
            cover: null,
          },
        ]),
      });
    });

    await page.goto('/');

    // Library heading should be present
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

    // Book titles should be visible and accessible (use first() since there are multiple text elements)
    await expect(page.getByText('Test Book 1').first()).toBeVisible();
    await expect(page.getByText('Test Book 2').first()).toBeVisible();
  });
});

test.describe('Accessibility - Error Handling', () => {
  test('should show accessible error state for missing document', async ({ page }) => {
    await page.route('**/api/library/invalid', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Document not found' }),
      });
    });

    await page.goto('/read/invalid');

    // Wait for the error text to appear (gives time for React to render)
    // 404 shows "Document not found" error message
    await expect(page.getByText('Document not found')).toBeVisible({ timeout: 10000 });

    // Error message should be in an alert region
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible();

    // Should have a link back to library
    await expect(page.getByText('Back to Library')).toBeVisible();
  });
});
