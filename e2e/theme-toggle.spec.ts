import { test, expect } from '@playwright/test';

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Mock library API
    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('theme toggle button is visible', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.getByTestId('theme-toggle');
    await expect(themeToggle).toBeVisible();
    await expect(themeToggle).toHaveAttribute('title', 'Toggle theme');
  });

  test('toggles from dark to light mode', async ({ page }) => {
    // Clear localStorage to ensure default dark theme
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Verify default is dark
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(initialTheme).toBe('dark');

    // Click theme toggle
    await page.getByTestId('theme-toggle').click();

    // Verify theme changed to light
    const newTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(newTheme).toBe('light');
  });

  test('toggles from light to dark mode', async ({ page }) => {
    // Set light theme in localStorage before navigation
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('pulp-preferences', JSON.stringify({
        state: { theme: 'light' },
        version: 0
      }));
    });
    await page.reload();

    // Verify theme is light
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(initialTheme).toBe('light');

    // Click theme toggle
    await page.getByTestId('theme-toggle').click();

    // Verify theme changed to dark
    const newTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(newTheme).toBe('dark');
  });

  test('persists theme to localStorage', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Toggle to light
    await page.getByTestId('theme-toggle').click();

    // Wait for state to be persisted
    await page.waitForTimeout(100);

    // Check localStorage was updated
    const stored = await page.evaluate(() => {
      const data = localStorage.getItem('pulp-preferences');
      return data ? JSON.parse(data) : null;
    });

    expect(stored?.state?.theme).toBe('light');
  });

  test('theme persists after page reload', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Toggle to light
    await page.getByTestId('theme-toggle').click();

    // Wait for state to be persisted
    await page.waitForTimeout(100);

    // Reload the page
    await page.reload();

    // Theme should still be light
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(theme).toBe('light');
  });

  test('shows correct icon for dark mode (sun icon)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // In dark mode, should show sun icon (to indicate switching to light)
    const toggle = page.getByTestId('theme-toggle');

    // Sun icon has a circle with radius 5
    const hasSunIcon = await toggle.locator('svg circle[r="5"]').count();
    expect(hasSunIcon).toBe(1);
  });

  test('shows correct icon for light mode (moon icon)', async ({ page }) => {
    // Set light theme
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('pulp-preferences', JSON.stringify({
        state: { theme: 'light' },
        version: 0
      }));
    });
    await page.reload();

    // In light mode, should show moon icon (to indicate switching to dark)
    const toggle = page.getByTestId('theme-toggle');

    // Moon icon has a path with the moon shape
    const hasMoonIcon = await toggle.locator('svg path').count();
    expect(hasMoonIcon).toBe(1);
  });

  test('toggle has correct aria-label for dark mode', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
  });

  test('toggle has correct aria-label for light mode', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('pulp-preferences', JSON.stringify({
        state: { theme: 'light' },
        version: 0
      }));
    });
    await page.reload();

    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode');
  });

  test('multiple toggles work correctly', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const toggle = page.getByTestId('theme-toggle');

    // Start in dark
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');

    // Toggle to light
    await toggle.click();
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light');

    // Toggle back to dark
    await toggle.click();
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');

    // Toggle to light again
    await toggle.click();
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light');
  });

  test('CSS variables change with theme', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Get dark theme background color
    const darkBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg-deep').trim()
    );

    // Toggle to light
    await page.getByTestId('theme-toggle').click();

    // Get light theme background color
    const lightBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg-deep').trim()
    );

    // Colors should be different
    expect(darkBg).not.toBe(lightBg);
    expect(darkBg).toBe('#2d3436'); // Dark theme bg-deep
    expect(lightBg).toBe('#fdfbf7'); // Light theme bg-deep
  });
});
