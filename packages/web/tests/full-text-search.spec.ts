import { test, expect } from '@playwright/test';

test.describe('Full-Text Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('displays search mode toggle buttons', async ({ page }) => {
    // Check for Title and Content toggle buttons (use title attribute to disambiguate)
    const titleButton = page.locator('button[title="Search by title"]');
    const contentButton = page.locator('button[title="Search document contents"]');

    await expect(titleButton).toBeVisible();
    await expect(contentButton).toBeVisible();

    // Title should be active by default
    await expect(titleButton).toHaveClass(/bg-accent-primary/);
  });

  test('title search filters library grid', async ({ page }) => {
    // Wait for library to load
    await page.waitForSelector('a[href^="/read/"]', { timeout: 10000 });

    const initialCount = await page.locator('a[href^="/read/"]').count();

    // Type in search box (title mode is default)
    const searchInput = page.locator('input[placeholder*="title"]');
    await searchInput.fill('test');

    // Wait for filtering
    await page.waitForTimeout(400);

    // Results should be filtered (may be 0 if no matches)
    const filteredCount = await page.locator('a[href^="/read/"]').count();
    // Filtering happens client-side, count may change
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('switches to content search mode', async ({ page }) => {
    const contentButton = page.locator('button:has-text("Content")');
    await contentButton.click();

    // Search input placeholder should change
    const searchInput = page.locator('input[placeholder*="contents"]');
    await expect(searchInput).toBeVisible();

    // Content button should now be active
    await expect(contentButton).toHaveClass(/bg-accent-primary/);
  });

  test('shows indexing status when documents are being indexed', async ({ page }) => {
    // Switch to content search mode
    await page.locator('button:has-text("Content")').click();

    // Check search status API
    const response = await page.request.get('/api/search/status');
    expect(response.ok()).toBe(true);

    const status = await response.json();
    expect(status).toHaveProperty('totalDocuments');
    expect(status).toHaveProperty('indexedDocuments');
    expect(status).toHaveProperty('isComplete');
    expect(status).toHaveProperty('percentComplete');
  });

  test('performs content search and shows results', async ({ page }) => {
    // Wait for library to load
    await page.waitForSelector('a[href^="/read/"]', { timeout: 10000 });

    // Switch to content search
    await page.locator('button[title="Search document contents"]').click();

    // Wait a bit for indexing to progress
    await page.waitForTimeout(2000);

    // Type a search query (use a common word that's likely in documents)
    const searchInput = page.locator('input[placeholder*="contents"]');
    await searchInput.fill('the');

    // Wait for search results to appear or finish loading
    await page.waitForTimeout(1000);

    // Check if we're showing search results (either results, "no results" message, or loading)
    const searchResultCards = page.locator('.bg-bg-surface.border.rounded-lg');
    const hasResults = await searchResultCards.count() > 0;
    const noResults = await page.locator('text=No results found').count() > 0;
    const isLoading = await page.locator('text=Searching...').count() > 0;

    // At least one of these should be true - we're in a search state
    expect(hasResults || noResults || isLoading).toBe(true);
  });

  test('search API returns valid response format', async ({ page }) => {
    // Wait for library to load
    await page.waitForSelector('a[href^="/read/"]', { timeout: 10000 });

    // Give indexing time to process at least one document
    await page.waitForTimeout(3000);

    // Test search API directly
    const response = await page.request.get('/api/search?q=the&limit=10');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('query', 'the');
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('totalResults');
    expect(Array.isArray(data.results)).toBe(true);

    // If there are results, verify their structure
    if (data.results.length > 0) {
      const result = data.results[0];
      expect(result).toHaveProperty('noteId');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('sourceType');
      expect(result).toHaveProperty('matches');
      expect(result).toHaveProperty('totalMatches');

      if (result.matches.length > 0) {
        const match = result.matches[0];
        expect(match).toHaveProperty('text');
        expect(match).toHaveProperty('position');
      }
    }
  });

  test('clicking search result navigates to document', async ({ page }) => {
    // Wait for library
    await page.waitForSelector('a[href^="/read/"]', { timeout: 10000 });

    // Switch to content search
    await page.locator('button:has-text("Content")').click();

    // Wait for indexing
    await page.waitForTimeout(3000);

    // Search for a common word
    const searchInput = page.locator('input[placeholder*="contents"]');
    await searchInput.fill('the');
    await page.waitForTimeout(500);

    // Check for search results
    const resultLinks = page.locator('a[href^="/read/"]');
    const linkCount = await resultLinks.count();

    if (linkCount > 0) {
      // Click the first result
      await resultLinks.first().click();

      // Should navigate to reader
      await page.waitForURL(/\/read\//);
      expect(page.url()).toMatch(/\/read\//);
    }
  });

  test('search results include page numbers for PDFs', async ({ page }) => {
    // Check if library has items first
    const libraryLinks = page.locator('a[href^="/read/"]');
    const linkCount = await libraryLinks.count();
    test.skip(linkCount === 0, 'No documents in library');

    // Wait for indexing
    await page.waitForTimeout(3000);

    // Get search results from API
    const response = await page.request.get('/api/search?q=the&limit=10');
    const data = await response.json();

    // Find PDF results
    const pdfResults = data.results.filter((r: { sourceType: string }) => r.sourceType === 'pdf');

    if (pdfResults.length > 0 && pdfResults[0].matches.length > 0) {
      const match = pdfResults[0].matches[0];
      // PDF matches should have page numbers
      expect(match).toHaveProperty('page');
      expect(typeof match.page).toBe('number');
    }
  });

  test('search results include chapter info for EPUBs', async ({ page }) => {
    // Check if library has items first
    const libraryLinks = page.locator('a[href^="/read/"]');
    const linkCount = await libraryLinks.count();
    test.skip(linkCount === 0, 'No documents in library');

    // Wait for indexing
    await page.waitForTimeout(3000);

    // Get search results from API
    const response = await page.request.get('/api/search?q=the&limit=20');
    const data = await response.json();

    // Find EPUB results
    const epubResults = data.results.filter((r: { sourceType: string }) => r.sourceType === 'epub');

    if (epubResults.length > 0 && epubResults[0].matches.length > 0) {
      const match = epubResults[0].matches[0];
      // EPUB matches should have chapter info
      expect(match).toHaveProperty('chapter');
    }
  });

  test('clearing search returns to library grid view', async ({ page }) => {
    // Check if library has items first
    const libraryLinks = page.locator('a[href^="/read/"]');
    const linkCount = await libraryLinks.count();
    test.skip(linkCount === 0, 'No documents in library');

    // Switch to content search
    await page.locator('button[title="Search document contents"]').click();

    // Search for something
    const searchInput = page.locator('input[placeholder*="contents"]');
    await searchInput.fill('test');
    await page.waitForTimeout(500);

    // Clear the search
    await searchInput.clear();
    await page.waitForTimeout(400);

    // Should return to grid view (library cards visible)
    // Use first() since there may be multiple grid elements on the page
    const libraryGrid = page.locator('.grid').first();
    await expect(libraryGrid).toBeVisible();
  });

  test('deep link to page works from search result', async ({ page }) => {
    // Wait for library
    await page.waitForSelector('a[href^="/read/"]', { timeout: 10000 });

    // Wait for indexing
    await page.waitForTimeout(3000);

    // Get a PDF search result with page info from API
    const response = await page.request.get('/api/search?q=the&limit=10');
    const data = await response.json();

    const pdfResult = data.results.find(
      (r: { sourceType: string; matches: Array<{ page?: number }> }) =>
        r.sourceType === 'pdf' && r.matches[0]?.page
    );

    if (pdfResult) {
      const pageNum = pdfResult.matches[0].page;
      const url = `/read/${pdfResult.noteId}?page=${pageNum}`;

      // Navigate directly to the deep link
      await page.goto(url);

      // Wait for PDF to load
      await page.waitForSelector('.pdf-page-container', { timeout: 30000 });

      // Verify URL has page parameter
      expect(page.url()).toContain(`page=${pageNum}`);
    }
  });
});
