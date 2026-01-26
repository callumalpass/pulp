import { test, expect } from '@playwright/test';

test.describe('Grace Period for Streaks', () => {
  let pdfId: string | null = null;
  let originalGoals: { dailyGoalMinutes: number; gracePeriodDays: number } | null = null;

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

      // Save original goals
      const goalsResponse = await page.request.get('/api/reading-goals');
      if (goalsResponse.ok()) {
        const goalsData = await goalsResponse.json();
        originalGoals = {
          dailyGoalMinutes: goalsData.goals.dailyGoalMinutes,
          gracePeriodDays: goalsData.goals.gracePeriodDays ?? 1,
        };
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

  test.afterAll(async ({ browser }) => {
    // Restore original goals
    if (originalGoals) {
      const page = await browser.newPage();
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.request.patch('/api/reading-goals', {
        data: originalGoals,
      });
      await page.close();
    }
  });

  test('reading goals API returns grace period field', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const response = await page.request.get('/api/reading-goals');
    expect(response.ok()).toBe(true);

    const data = await response.json();

    // Check grace period field exists
    expect(data.goals).toHaveProperty('gracePeriodDays');
    expect(typeof data.goals.gracePeriodDays).toBe('number');

    // Check streak has grace days used field
    expect(data.streak).toHaveProperty('graceDaysUsed');
    expect(typeof data.streak.graceDaysUsed).toBe('number');
  });

  test('can update grace period via API', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get current grace period
    const getResponse = await page.request.get('/api/reading-goals');
    const initialData = await getResponse.json();
    const initialGracePeriod = initialData.goals.gracePeriodDays ?? 1;

    // Update to a different value
    const newGracePeriod = initialGracePeriod === 1 ? 2 : 1;
    const updateResponse = await page.request.patch('/api/reading-goals', {
      data: { gracePeriodDays: newGracePeriod },
    });
    expect(updateResponse.ok()).toBe(true);

    const updateData = await updateResponse.json();
    expect(updateData.success).toBe(true);
    expect(updateData.goals.gracePeriodDays).toBe(newGracePeriod);

    // Restore original value
    await page.request.patch('/api/reading-goals', {
      data: { gracePeriodDays: initialGracePeriod },
    });
  });

  test('goals panel shows grace period input when editing', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open goals panel
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    const goalsPanel = page.locator('[aria-label="Reading goals"]');
    await expect(goalsPanel).toBeVisible({ timeout: 5000 });

    // Find and click "Edit goals" button
    const editButton = goalsPanel.getByText('Edit goals');
    await editButton.click();
    await page.waitForTimeout(200);

    // Grace days input should appear
    const graceDaysInput = goalsPanel.locator('input[aria-label="Grace period days"]');
    await expect(graceDaysInput).toBeVisible();

    // Should have both daily goal and grace period fields
    const dailyGoalInput = goalsPanel.locator('input[aria-label="Daily goal in minutes"]');
    await expect(dailyGoalInput).toBeVisible();
  });

  test('goals panel shows grace days used in streak display', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open goals panel
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    const goalsPanel = page.locator('[aria-label="Reading goals"]');
    await expect(goalsPanel).toBeVisible({ timeout: 5000 });

    // Verify streak section exists
    await expect(goalsPanel.getByText('Reading Streak')).toBeVisible();

    // If grace days have been used, it should show "(X grace day(s) used)"
    // This may not always be visible depending on current streak state
    const streakSection = goalsPanel.locator('text=/\\d+ days?|Start your streak today!/').first();
    await expect(streakSection).toBeVisible();
  });

  test('can save goals with grace period', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open goals panel
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    const goalsPanel = page.locator('[aria-label="Reading goals"]');
    await expect(goalsPanel).toBeVisible({ timeout: 5000 });

    // Click edit
    const editButton = goalsPanel.getByText('Edit goals');
    await editButton.click();
    await page.waitForTimeout(200);

    // Change grace period
    const graceDaysInput = goalsPanel.locator('input[aria-label="Grace period days"]');
    await graceDaysInput.fill('2');

    // Wait for API response when saving
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/reading-goals') && resp.request().method() === 'PATCH', { timeout: 5000 }),
      goalsPanel.getByText('Save').click(),
    ]);

    expect(response.status()).toBe(200);

    // Restore to default
    await editButton.click();
    await page.waitForTimeout(200);
    await graceDaysInput.fill('1');
    await goalsPanel.getByText('Save').click();
  });
});
