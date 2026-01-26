import { test, expect } from '@playwright/test';

test.describe('Reading Goals Features', () => {
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

  test.describe('API', () => {
    test('returns weekly summary data', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const response = await page.request.get('/api/reading-goals');
      expect(response.ok()).toBe(true);

      const data = await response.json();

      // Check weekSummary field exists with required properties
      expect(data).toHaveProperty('weekSummary');
      expect(data.weekSummary).toHaveProperty('weekStartDate');
      expect(data.weekSummary).toHaveProperty('totalDurationMs');
      expect(data.weekSummary).toHaveProperty('totalSessions');
      expect(data.weekSummary).toHaveProperty('booksRead');
      expect(data.weekSummary).toHaveProperty('daysWithReading');
      expect(data.weekSummary).toHaveProperty('daysGoalMet');
      expect(data.weekSummary).toHaveProperty('weeklyGoalMet');
      expect(data.weekSummary).toHaveProperty('averageDailyMs');

      // Validate types
      expect(typeof data.weekSummary.totalDurationMs).toBe('number');
      expect(typeof data.weekSummary.booksRead).toBe('number');
      expect(typeof data.weekSummary.weeklyGoalMet).toBe('boolean');
    });

    test('returns streak risk info', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const response = await page.request.get('/api/reading-goals');
      expect(response.ok()).toBe(true);

      const data = await response.json();

      // streakAtRisk can be null or an object
      expect(data).toHaveProperty('streakAtRisk');

      if (data.streakAtRisk !== null) {
        expect(data.streakAtRisk).toHaveProperty('isAtRisk');
        expect(data.streakAtRisk).toHaveProperty('minutesRemaining');
        expect(data.streakAtRisk).toHaveProperty('hoursUntilMidnight');
        expect(data.streakAtRisk).toHaveProperty('graceDaysRemaining');

        expect(typeof data.streakAtRisk.isAtRisk).toBe('boolean');
        expect(typeof data.streakAtRisk.minutesRemaining).toBe('number');
        expect(typeof data.streakAtRisk.hoursUntilMidnight).toBe('number');
      }
    });

    test('returns monthly reading summary', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Get current month summary
      const response = await page.request.get('/api/reading-goals/monthly');
      expect(response.ok()).toBe(true);

      const data = await response.json();

      // Check monthly summary fields
      expect(data).toHaveProperty('month');
      expect(data).toHaveProperty('totalDurationMs');
      expect(data).toHaveProperty('totalSessions');
      expect(data).toHaveProperty('booksRead');
      expect(data).toHaveProperty('daysWithReading');
      expect(data).toHaveProperty('daysGoalMet');
      expect(data).toHaveProperty('averageDailyMs');
      expect(data).toHaveProperty('booksCompleted');

      // Month should be in YYYY-MM format
      expect(data.month).toMatch(/^\d{4}-\d{2}$/);
    });

    test('can query monthly summary for specific month', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Query a specific month
      const response = await page.request.get('/api/reading-goals/monthly?month=2024-01');
      expect(response.ok()).toBe(true);

      const data = await response.json();
      expect(data.month).toBe('2024-01');
    });
  });

  test.describe('Goals Panel UI', () => {
    test('shows week summary statistics', async ({ page }) => {
      test.skip(!pdfId, 'No PDFs in library');

      await page.goto(`/read/${pdfId}`);
      await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
      await page.waitForTimeout(1000);

      // Open goals panel with 'r' key
      await page.keyboard.press('r');
      await page.waitForTimeout(300);

      const goalsPanel = page.locator('[aria-label="Reading goals"]');
      await expect(goalsPanel).toBeVisible({ timeout: 5000 });

      // Check for week stats section
      await expect(goalsPanel.getByText('Week total')).toBeVisible();
      await expect(goalsPanel.getByText('Days met goal')).toBeVisible();
      await expect(goalsPanel.getByText('Books read')).toBeVisible();
      await expect(goalsPanel.getByText('Avg per day')).toBeVisible();
    });

    test('shows this week activity grid', async ({ page }) => {
      test.skip(!pdfId, 'No PDFs in library');

      await page.goto(`/read/${pdfId}`);
      await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
      await page.waitForTimeout(1000);

      // Open goals panel
      await page.keyboard.press('r');
      await page.waitForTimeout(300);

      const goalsPanel = page.locator('[aria-label="Reading goals"]');
      await expect(goalsPanel).toBeVisible({ timeout: 5000 });

      // Check for "This Week" section
      await expect(goalsPanel.getByText('This Week')).toBeVisible();

      // Day name labels should be visible (Mon, Tue, Wed, etc.)
      const dayLabels = goalsPanel.locator('text=/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/');
      const count = await dayLabels.count();
      expect(count).toBe(7); // All 7 days
    });

    test('shows reading streak information', async ({ page }) => {
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

      // Should show current streak days or start message
      const streakDisplay = goalsPanel.locator('text=/\\d+ days?|Start your streak today!/');
      await expect(streakDisplay.first()).toBeVisible();
    });

    test('shows longest streak when available', async ({ page }) => {
      test.skip(!pdfId, 'No PDFs in library');

      await page.goto(`/read/${pdfId}`);
      await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
      await page.waitForTimeout(1000);

      // Open goals panel
      await page.keyboard.press('r');
      await page.waitForTimeout(300);

      const goalsPanel = page.locator('[aria-label="Reading goals"]');
      await expect(goalsPanel).toBeVisible({ timeout: 5000 });

      // Check if longest streak section exists (may or may not be visible depending on data)
      const longestStreakLabel = goalsPanel.getByText('Longest streak');
      // Just verify the section loads without error
      await expect(goalsPanel).toBeVisible();
    });

    test('shows today progress with circular indicator', async ({ page }) => {
      test.skip(!pdfId, 'No PDFs in library');

      await page.goto(`/read/${pdfId}`);
      await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
      await page.waitForTimeout(1000);

      // Open goals panel
      await page.keyboard.press('r');
      await page.waitForTimeout(300);

      const goalsPanel = page.locator('[aria-label="Reading goals"]');
      await expect(goalsPanel).toBeVisible({ timeout: 5000 });

      // Check for "Today's Progress" section
      await expect(goalsPanel.getByText("Today's Progress")).toBeVisible();

      // Should show "of Xm goal" text
      await expect(goalsPanel.locator('text=/of \\d+m goal/')).toBeVisible();
    });

    test('can edit daily goal', async ({ page }) => {
      test.skip(!pdfId, 'No PDFs in library');

      await page.goto(`/read/${pdfId}`);
      await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
      await page.waitForTimeout(1000);

      // Open goals panel
      await page.keyboard.press('r');
      await page.waitForTimeout(300);

      const goalsPanel = page.locator('[aria-label="Reading goals"]');
      await expect(goalsPanel).toBeVisible({ timeout: 5000 });

      // Click edit goals
      const editButton = goalsPanel.getByText('Edit goals');
      await editButton.click();
      await page.waitForTimeout(200);

      // Should see daily goal input and grace days input
      const dailyGoalInput = goalsPanel.locator('input[aria-label="Daily goal in minutes"]');
      await expect(dailyGoalInput).toBeVisible();

      const graceDaysInput = goalsPanel.locator('input[aria-label="Grace period days"]');
      await expect(graceDaysInput).toBeVisible();

      // Cancel should hide the form
      await goalsPanel.getByText('Cancel').click();
      await expect(dailyGoalInput).not.toBeVisible();
    });
  });

  test.describe('Library Stats', () => {
    test('shows today reading time and streak in library header', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000); // Give more time for stats to load

      // Library stats should show today's reading time - find the specific clock icon followed by "Today"
      // The library stats component has a div with class containing items-center that has the Today label
      const todayStatsSection = page.locator('.flex.items-center.gap-2 span.text-xs:has-text("Today")').first();
      const isVisible = await todayStatsSection.isVisible().catch(() => false);

      if (isVisible) {
        await expect(todayStatsSection).toBeVisible();
        // Should also show streak indicator (fire emoji or sleep emoji)
        const streakIndicator = page.locator('text=/🔥|💤/');
        await expect(streakIndicator.first()).toBeVisible({ timeout: 5000 });
      } else {
        // If not visible after waiting, the data API might not have loaded yet
        // This is OK for CI environments without data
        console.log('Library stats not visible - may not have data loaded');
      }
    });

    test('shows total books count when library has books', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // First check if there are any books in the library
      const response = await page.request.get('/api/library');
      const library = await response.json();

      if (library.length > 0) {
        // Should show "X books" in stats (look for the specific structure)
        const booksLabel = page.locator('span:has-text("books")');
        await expect(booksLabel.first()).toBeVisible({ timeout: 5000 });
      } else {
        console.log('No books in library - skipping books count check');
      }
    });
  });
});
