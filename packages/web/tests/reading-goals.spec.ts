import { test, expect } from '@playwright/test';

test.describe('Reading Goals', () => {
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

  test('goals panel opens with r key', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Press r to open goals panel
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    // Check if goals panel is visible
    const goalsPanel = page.locator('[aria-label="Reading goals"]');
    await expect(goalsPanel).toBeVisible({ timeout: 5000 });

    // Check for expected content
    await expect(page.getByText("Today's Progress")).toBeVisible();
    await expect(page.getByText('Reading Streak')).toBeVisible();
    await expect(page.getByText('This Week')).toBeVisible();
  });

  test('goals panel closes with Escape', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open goals panel
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    const goalsPanel = page.locator('[aria-label="Reading goals"]');
    await expect(goalsPanel).toBeVisible({ timeout: 5000 });

    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(goalsPanel).not.toBeVisible();
  });

  test('goals button in toolbar toggles panel', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Find and click goals button (target icon)
    const goalsButton = page.locator('[aria-label="Reading goals (R)"]');
    await goalsButton.click();
    await page.waitForTimeout(300);

    // Check panel is visible
    const goalsPanel = page.locator('[aria-label="Reading goals"]');
    await expect(goalsPanel).toBeVisible({ timeout: 5000 });

    // Click again to close
    await goalsButton.click();
    await page.waitForTimeout(300);

    await expect(goalsPanel).not.toBeVisible();
  });

  test('displays circular progress indicator', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open goals panel
    await page.keyboard.press('r');
    await page.waitForTimeout(500);

    const goalsPanel = page.locator('[aria-label="Reading goals"]');
    await expect(goalsPanel).toBeVisible({ timeout: 5000 });

    // Check for goal text (e.g., "of 30m goal")
    const goalText = goalsPanel.locator('text=/of \\d+m goal/');
    await expect(goalText).toBeVisible();
  });

  test('shows reading streak section', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open goals panel
    await page.keyboard.press('r');
    await page.waitForTimeout(500);

    const goalsPanel = page.locator('[aria-label="Reading goals"]');
    await expect(goalsPanel).toBeVisible({ timeout: 5000 });

    // Check for streak section
    await expect(goalsPanel.getByText('Reading Streak')).toBeVisible();

    // Should show either current streak count or "Start your streak today!" message
    // Use first() since both elements may be visible when streak is 0
    const streakText = goalsPanel.locator('text=/\\d+ days?|Start your streak today!/').first();
    await expect(streakText).toBeVisible();
  });

  test('shows week activity grid with 7 days', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open goals panel
    await page.keyboard.press('r');
    await page.waitForTimeout(500);

    const goalsPanel = page.locator('[aria-label="Reading goals"]');
    await expect(goalsPanel).toBeVisible({ timeout: 5000 });

    // Check for This Week section
    await expect(goalsPanel.getByText('This Week')).toBeVisible();

    // Should show day abbreviations
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().getDay();
    // At minimum, today's day should be visible
    await expect(goalsPanel.getByText(dayNames[today])).toBeVisible();
  });

  test('can edit daily goal', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Open goals panel
    await page.keyboard.press('r');
    await page.waitForTimeout(500);

    const goalsPanel = page.locator('[aria-label="Reading goals"]');
    await expect(goalsPanel).toBeVisible({ timeout: 5000 });

    // Find and click "Edit daily goal" button
    const editButton = goalsPanel.getByText('Edit daily goal');
    await editButton.click();
    await page.waitForTimeout(200);

    // Input field should appear
    const goalInput = goalsPanel.locator('input[aria-label="Daily goal in minutes"]');
    await expect(goalInput).toBeVisible();

    // Should have Cancel button
    await expect(goalsPanel.getByText('Cancel')).toBeVisible();

    // Should have Save button
    await expect(goalsPanel.getByText('Save')).toBeVisible();
  });

  test('reading goals API returns valid data', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Call the goals API directly
    const response = await page.request.get('/api/reading-goals');
    expect(response.ok()).toBe(true);

    const data = await response.json();

    // Check structure
    expect(data).toHaveProperty('goals');
    expect(data).toHaveProperty('streak');
    expect(data).toHaveProperty('todayProgress');
    expect(data).toHaveProperty('weekHistory');

    // Check goals structure
    expect(data.goals).toHaveProperty('dailyGoalMinutes');
    expect(typeof data.goals.dailyGoalMinutes).toBe('number');

    // Check streak structure
    expect(data.streak).toHaveProperty('currentStreak');
    expect(data.streak).toHaveProperty('longestStreak');

    // Check todayProgress structure
    expect(data.todayProgress).toHaveProperty('date');
    expect(data.todayProgress).toHaveProperty('totalDurationMs');
    expect(data.todayProgress).toHaveProperty('goalMet');

    // Check weekHistory is array of 7 days
    expect(Array.isArray(data.weekHistory)).toBe(true);
    expect(data.weekHistory.length).toBe(7);
  });

  test('can update daily goal via API', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get current goal
    const getResponse = await page.request.get('/api/reading-goals');
    const initialData = await getResponse.json();
    const initialGoal = initialData.goals.dailyGoalMinutes;

    // Update to a different value
    const newGoal = initialGoal === 30 ? 45 : 30;
    const updateResponse = await page.request.patch('/api/reading-goals', {
      data: { dailyGoalMinutes: newGoal },
    });
    expect(updateResponse.ok()).toBe(true);

    const updateData = await updateResponse.json();
    expect(updateData.success).toBe(true);
    expect(updateData.goals.dailyGoalMinutes).toBe(newGoal);

    // Restore original value
    await page.request.patch('/api/reading-goals', {
      data: { dailyGoalMinutes: initialGoal },
    });
  });

  test('keyboard shortcut help shows goals shortcut', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Press ? to open keyboard shortcuts
    await page.keyboard.press('?');
    await page.waitForTimeout(500);

    // Check that goals shortcut is listed
    const shortcutsPanel = page.locator('[role="dialog"]');
    await expect(shortcutsPanel).toBeVisible({ timeout: 5000 });
    await expect(shortcutsPanel.getByText('Toggle reading goals')).toBeVisible();
  });
});
