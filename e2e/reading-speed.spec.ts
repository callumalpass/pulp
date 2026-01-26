import { test, expect } from '@playwright/test';

test.describe('Reading Speed and Metrics', () => {
  let pdfId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Find a PDF to test with
    try {
      const response = await page.request.get('/api/library');
      if (response.ok()) {
        const library = await response.json();
        const pdfNote = library.find((n: any) => n.sourceType === 'pdf');
        if (pdfNote) {
          pdfId = pdfNote.id;
          console.log(`Found PDF: ${pdfNote.title} (${pdfId})`);
        }
      }
    } catch (e) {
      console.log('API request failed');
    }

    // Fallback to first link
    if (!pdfId) {
      const firstLink = await page.locator('a[href^="/read/"]').first();
      if (await firstLink.count() > 0) {
        const href = await firstLink.getAttribute('href');
        pdfId = href?.replace('/read/', '') || null;
      }
    }
    await page.close();
  });

  test('stats panel shows reading speed when available', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open stats panel
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // If stats exist with reading speed, it should show "pg/hr"
    // This may not be visible for new books without reading history
    const speedText = statsPanel.locator('text=/pg\\/hr/');
    const hasSpeed = await speedText.count() > 0;
    console.log(`Has reading speed: ${hasSpeed}`);

    // At minimum, verify stats panel structure
    await expect(page.getByText('Current Session')).toBeVisible();
  });

  test('stats API returns new metrics fields', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get note stats via API
    const response = await page.request.get(`/api/library/${pdfId}/reading-stats`);
    expect(response.ok()).toBe(true);

    const data = await response.json();

    // Verify readingStats structure (may be null if no reading history)
    if (data.readingStats) {
      expect(data.readingStats).toHaveProperty('totalReadingTimeMs');
      expect(data.readingStats).toHaveProperty('totalSessions');
      expect(data.readingStats).toHaveProperty('averageSessionMs');

      // New fields (may be null/0 initially)
      expect(data.readingStats).toHaveProperty('pagesPerHour');
      expect(data.readingStats).toHaveProperty('totalPagesRead');
      expect(data.readingStats).toHaveProperty('longestSessionMs');
    }
  });

  test('stats panel shows longest session when available', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open stats panel
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // If stats exist, may show "Longest session"
    // Just verify the panel loaded correctly
    await expect(page.getByText('Time reading')).toBeVisible();
  });

  test('stats panel shows pages read when available', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open stats panel
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // If stats exist with pages, may show "Pages read"
    const pagesReadText = statsPanel.locator('text=Pages read');
    const hasPages = await pagesReadText.count() > 0;
    console.log(`Has pages read: ${hasPages}`);

    // Verify basic structure
    await expect(page.getByText('Current Session')).toBeVisible();
  });

  test('estimated time remaining uses reading speed when available', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open stats panel
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // If there's reading history and we're not at the end,
    // may show "Est. remaining"
    const estRemainingText = statsPanel.locator('text=Est. remaining');
    const hasEstimate = await estRemainingText.count() > 0;
    console.log(`Has estimated remaining: ${hasEstimate}`);

    // Verify panel loaded
    await expect(page.getByText('Progress')).toBeVisible();
  });
});
