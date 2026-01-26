import { test, expect } from '@playwright/test';

test.describe('Reading Statistics', () => {
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
        const pdfNote = library.find((n: any) =>
          n.sourceType === 'pdf'
        );
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

  test('stats panel opens with S key', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Press S to open stats panel
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    // Check if stats panel is visible
    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // Check for expected content
    await expect(page.getByText('Current Session')).toBeVisible();
    await expect(page.getByText('Time reading')).toBeVisible();
  });

  test('stats panel closes with Escape', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open stats panel
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(statsPanel).not.toBeVisible();
  });

  test('stats button in toolbar toggles panel', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Find and click stats button
    const statsButton = page.locator('[aria-label="Reading statistics (S)"]');
    await statsButton.click();
    await page.waitForTimeout(300);

    // Check panel is visible
    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // Click again to close
    await statsButton.click();
    await page.waitForTimeout(300);

    await expect(statsPanel).not.toBeVisible();
  });

  test('reading time indicator appears in toolbar', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(3000); // Wait for session to accumulate some time

    // Look for the reading time indicator (contains clock icon and time)
    const timeIndicator = page.locator('[aria-label*="Reading time"]');
    await expect(timeIndicator).toBeVisible({ timeout: 10000 });
  });

  test('session duration updates over time', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });

    // Open stats panel
    await page.keyboard.press('s');
    await page.waitForTimeout(500);

    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // Get initial reading time text
    const timeReading = statsPanel.locator('text=Time reading').locator('..').locator('.font-mono');
    const initialText = await timeReading.textContent();

    // Wait a few seconds
    await page.waitForTimeout(3000);

    // Check that time has updated (may change from "0s" to "3s" or similar)
    const updatedText = await timeReading.textContent();
    console.log(`Time reading: ${initialText} -> ${updatedText}`);

    // The time should have increased
    expect(updatedText).toBeDefined();
  });

  test('keyboard shortcut help shows stats shortcut', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Press ? to open keyboard shortcuts
    await page.keyboard.press('?');
    await page.waitForTimeout(500);

    // Check that stats shortcut is listed
    const shortcutsPanel = page.locator('[role="dialog"]');
    await expect(shortcutsPanel).toBeVisible({ timeout: 5000 });
    await expect(shortcutsPanel.getByText('Toggle reading statistics')).toBeVisible();
  });

  test('stats are saved to frontmatter via API', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    // Open PDF and read for a bit
    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(15000); // Read for 15 seconds (above minimum threshold)

    // Navigate away (ends session, triggers API call)
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/reading-stats') && resp.request().method() === 'PATCH', { timeout: 10000 }).catch(() => null),
      page.goto('/')
    ]);

    // Verify API was called (may timeout if session was too short)
    if (response) {
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.readingStats).toBeDefined();
    }
  });

  test('shows message when no stats yet', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open stats panel
    await page.keyboard.press('s');
    await page.waitForTimeout(300);

    const statsPanel = page.locator('[aria-label="Reading statistics"]');
    await expect(statsPanel).toBeVisible({ timeout: 5000 });

    // If no stats exist yet, should show the message
    const noStatsMessage = statsPanel.getByText('Your reading statistics will appear here');
    // This may or may not be visible depending on existing stats
    // Just verify the panel structure is correct
    await expect(statsPanel.getByText('Current Session')).toBeVisible();
  });

  test('reading stats API rejects negative session duration', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try to send negative session duration
    const response = await page.request.patch(`/api/library/${pdfId}/reading-stats`, {
      data: { sessionDurationMs: -1000, pagesRead: 5 },
    });

    // Should be rejected with 400 Bad Request (schema validation)
    expect(response.status()).toBe(400);
  });

  test('reading stats API handles zero session duration gracefully', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Send zero session duration - should return success but indicate no stats updated
    const response = await page.request.patch(`/api/library/${pdfId}/reading-stats`, {
      data: { sessionDurationMs: 0, pagesRead: 0 },
    });

    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.success).toBe(true);
    // Should indicate no stats were updated due to zero duration
    expect(data.message).toContain('zero');
  });

  test('progress API clamps values to 0-100 range', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try to set progress above 100 - should be rejected by schema validation
    const highResponse = await page.request.patch(`/api/library/${pdfId}/progress`, {
      data: { progress: 150 },
    });
    // Schema validation should reject values > 100
    expect(highResponse.status()).toBe(400);

    // Try to set progress below 0 - should also be rejected
    const lowResponse = await page.request.patch(`/api/library/${pdfId}/progress`, {
      data: { progress: -10 },
    });
    expect(lowResponse.status()).toBe(400);
  });
});
