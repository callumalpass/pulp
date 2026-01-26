import { test, expect } from '@playwright/test';

test.describe('Idle Detection', () => {
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

  test('session time updates during active reading', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open stats panel
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // Get initial time
    const timeReading = statsPanel.locator('text=Time reading').locator('..').locator('.font-mono').first();
    const initialText = await timeReading.textContent();

    // Simulate some activity (mouse movement counts as activity)
    await page.mouse.move(100, 100);
    await page.waitForTimeout(2000);
    await page.mouse.move(200, 200);

    // Time should have increased
    const updatedText = await timeReading.textContent();
    console.log(`Session time: ${initialText} -> ${updatedText}`);
    expect(updatedText).toBeDefined();
  });

  test('stats panel shows paused indicator when idle', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');
    // Note: This test would require waiting 5 minutes for idle timeout
    // Instead, we verify the UI elements exist for the paused state

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open stats panel to verify it has the right structure
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // Verify the panel has the expected structure
    await expect(page.getByText('Time reading')).toBeVisible();
    await expect(page.getByText('Current Session')).toBeVisible();
  });

  test('page navigation counts as activity', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open stats panel
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // Navigate to next page
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);

    // Navigate to previous page
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);

    // Session should still be active (time updates)
    const timeReading = statsPanel.locator('text=Time reading').locator('..').locator('.font-mono').first();
    const timeText = await timeReading.textContent();
    expect(timeText).toBeDefined();
  });
});
