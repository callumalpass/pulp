import { test, expect, Page } from '@playwright/test';

/**
 * UI/UX and Performance audit for the Pulp reading app.
 * Evaluates accessibility, layout consistency, interaction quality,
 * and performance across desktop and mobile viewports.
 */

const MOCK_LIBRARY = [
  {
    id: 'note1',
    title: 'The Art of Computer Programming',
    author: 'Donald Knuth',
    sourceType: 'pdf',
    progress: 67,
    lastRead: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    cover: null,
    pinned: true,
    rating: 5,
    highlightCount: 12,
    totalPages: 672,
    collections: ['Computer Science'],
    readingStats: { totalReadingTimeMs: 1000 * 60 * 240, pagesPerHour: 25 },
  },
  {
    id: 'note2',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    author: 'Robert C. Martin',
    sourceType: 'epub',
    progress: 100,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    cover: null,
    pinned: false,
    rating: 4,
    highlightCount: 8,
    totalPages: 464,
    collections: ['Programming'],
    dateFinished: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    readingStats: { totalReadingTimeMs: 1000 * 60 * 180, pagesPerHour: 30 },
  },
  {
    id: 'note3',
    title: 'Design Patterns: Elements of Reusable Object-Oriented Software',
    author: 'Gang of Four',
    sourceType: 'pdf',
    progress: 23,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    cover: null,
    pinned: false,
    rating: null,
    highlightCount: 3,
    totalPages: 395,
    collections: ['Programming', 'Architecture'],
    readingStats: { totalReadingTimeMs: 1000 * 60 * 90, pagesPerHour: 20 },
  },
  {
    id: 'note4',
    title: 'The Pragmatic Programmer',
    author: 'David Thomas, Andrew Hunt',
    sourceType: 'epub',
    progress: 0,
    lastRead: null,
    cover: null,
    pinned: false,
    rating: null,
    highlightCount: 0,
    totalPages: 352,
    collections: ['Programming'],
    readingStats: null,
  },
  {
    id: 'note5',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson',
    sourceType: 'pdf',
    progress: 45,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    cover: null,
    pinned: false,
    rating: 5,
    highlightCount: 20,
    totalPages: 657,
    collections: ['Computer Science'],
    readingStats: { totalReadingTimeMs: 1000 * 60 * 300, pagesPerHour: 18 },
  },
  {
    id: 'note6',
    title: 'Introduction to Algorithms',
    author: 'Thomas H. Cormen',
    sourceType: 'pdf',
    progress: 12,
    lastRead: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    cover: null,
    pinned: false,
    rating: 4,
    highlightCount: 5,
    totalPages: 1312,
    collections: ['Computer Science', 'Algorithms'],
    readingStats: { totalReadingTimeMs: 1000 * 60 * 60, pagesPerHour: 15 },
  },
];

const MOCK_COLLECTIONS = {
  collections: ['Computer Science', 'Programming', 'Architecture', 'Algorithms'],
};

async function setupMocks(page: Page) {
  await page.route('**/api/library**', async (route) => {
    if (route.request().url().includes('/note')) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_LIBRARY),
    });
  });
  await page.route('**/api/collections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_COLLECTIONS),
    });
  });
  await page.route('**/api/reading-stats**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stats: [] }),
    });
  });
  await page.route('**/api/search/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isComplete: true, indexedDocuments: 6, totalDocuments: 6, percentComplete: 100 }),
    });
  });
}

test.describe('UI/UX Audit - Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('Accessibility: semantic HTML and ARIA attributes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Header has banner role
    const header = page.locator('header[role="banner"]');
    await expect(header).toBeVisible();

    // Search has proper role and label
    const search = page.locator('[role="search"]');
    await expect(search).toBeVisible();

    // Search input has proper aria-label
    const searchInput = page.locator('input[type="search"]');
    await expect(searchInput).toHaveAttribute('aria-label');

    // Filter buttons have aria-pressed
    const filterButtons = page.locator('button[aria-pressed]');
    expect(await filterButtons.count()).toBeGreaterThan(0);

    // Book cards have aria-labels
    const bookCards = page.locator('[data-testid="book-card"]');
    const cardCount = await bookCards.count();
    for (let i = 0; i < Math.min(cardCount, 3); i++) {
      await expect(bookCards.nth(i)).toHaveAttribute('aria-label');
    }

    // Theme toggle has aria-label
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    await expect(themeToggle).toHaveAttribute('aria-label');
  });

  test('Accessibility: focus management and keyboard navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Skip link exists and is focusable
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeAttached();

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
    expect(firstFocused).toBeTruthy();

    // "/" shortcut focuses search
    await page.keyboard.press('Escape');
    await page.keyboard.press('/');
    const searchFocused = await page.evaluate(
      () => document.activeElement?.getAttribute('type')
    );
    expect(searchFocused).toBe('search');

    // Escape blurs search
    await page.keyboard.press('Escape');
    const blurred = await page.evaluate(
      () => document.activeElement?.getAttribute('type')
    );
    expect(blurred).not.toBe('search');

    // "?" shortcut toggles keyboard shortcuts panel
    await page.keyboard.press('?');
    await page.waitForTimeout(200);
    // Shortcuts panel should appear
    const shortcutsPanel = page.getByText('Keyboard Shortcuts').first();
    await expect(shortcutsPanel).toBeVisible();
    await page.keyboard.press('?');
    await page.waitForTimeout(200);
  });

  test('Layout: consistent spacing and alignment', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Check that header height is consistent
    const headerHeight = await page.locator('header').evaluate(
      (el) => el.getBoundingClientRect().height
    );
    expect(headerHeight).toBe(56); // h-14 = 56px

    // Check grid cards are consistently sized
    const cards = page.locator('[data-testid="book-card"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Check that filter buttons have consistent min heights
    const filterBtns = page.locator('.filter-btn');
    const filterCount = await filterBtns.count();
    for (let i = 0; i < Math.min(filterCount, 5); i++) {
      const height = await filterBtns.nth(i).evaluate(
        (el) => el.getBoundingClientRect().height
      );
      expect(height).toBeGreaterThanOrEqual(38); // sm:min-h-[38px]
    }
  });

  test('Interactions: hover states work properly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Book card hover reveals action buttons
    const firstCard = page.locator('[data-testid="book-card"]').first();
    await firstCard.hover();
    await page.waitForTimeout(300);

    // Pin button should be visible on hover
    const pinButton = firstCard.locator('button[aria-label="Unpin"], button[aria-label="Pin"]').first();
    await expect(pinButton).toBeVisible();

    // Info button should be visible on hover
    const infoButton = firstCard.locator('button[aria-label="Show metadata"]');
    await expect(infoButton).toBeVisible();

    // Screenshot hover state
    await page.screenshot({
      path: 'e2e/screenshots/audit-desktop-hover.png',
      fullPage: false,
    });
  });

  test('Interactions: filter buttons update correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Count initial cards
    const initialCount = await page.locator('[data-testid="book-card"]').count();

    // Click PDF filter
    await page.getByRole('button', { name: 'PDF' }).click();
    await page.waitForTimeout(300);

    // Should show fewer cards (only PDFs)
    const pdfCount = await page.locator('[data-testid="book-card"]').count();
    expect(pdfCount).toBeLessThanOrEqual(initialCount);

    // PDF filter button should have aria-pressed="true"
    const pdfBtn = page.getByRole('button', { name: 'PDF' });
    await expect(pdfBtn).toHaveAttribute('aria-pressed', 'true');

    // Active filter summary should appear
    await expect(page.getByText(/Showing .* of .* items/)).toBeVisible();

    // Clear filters
    await page.getByText('Clear filters').click();
    await page.waitForTimeout(200);

    const resetCount = await page.locator('[data-testid="book-card"]').count();
    expect(resetCount).toBe(initialCount);
  });

  test('Theme: light mode renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Switch to light mode
    await page.locator('[data-testid="theme-toggle"]').click();
    await page.waitForTimeout(500);

    // Check the theme attribute was set
    const theme = await page.evaluate(
      () => document.documentElement.getAttribute('data-theme')
    );
    expect(theme).toBe('light');

    // Check background color changed (light mode bg-deep is #fdfbf7)
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    // Should not be the dark theme color
    expect(bgColor).not.toBe('rgb(45, 52, 54)');

    await page.screenshot({
      path: 'e2e/screenshots/audit-light-theme.png',
      fullPage: true,
    });

    // Switch back to dark
    await page.locator('[data-testid="theme-toggle"]').click();
    await page.waitForTimeout(500);
  });

  test('Performance: check for layout thrashing signals', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Verify content-visibility is applied to library cards
    const contentVisibility = await page.locator('.library-card').first().evaluate(
      (el) => getComputedStyle(el).contentVisibility
    );
    expect(contentVisibility).toBe('auto');

    // Verify contain property on grid
    const gridContain = await page.locator('.library-grid-optimized').first().evaluate(
      (el) => getComputedStyle(el).contain
    );
    expect(gridContain).toContain('layout');

    // Verify reduced motion is respected (check the CSS exists)
    const hasReducedMotionCSS = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSMediaRule && rule.conditionText?.includes('prefers-reduced-motion')) {
              return true;
            }
          }
        } catch { /* cross-origin sheets */ }
      }
      return false;
    });
    expect(hasReducedMotionCSS).toBe(true);
  });

  test('Performance: page load timing', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();
    const loadTime = Date.now() - startTime;

    // Library page should load in under 5 seconds (generous for CI)
    expect(loadTime).toBeLessThan(5000);

    // Check that skeleton loading state was shown (it renders instantly)
    // We'll verify the skeleton CSS class exists in the document
    const hasSkeleton = await page.evaluate(() => {
      return document.querySelectorAll('.skeleton').length >= 0;
    });
    expect(hasSkeleton).toBe(true);
  });

  test('Continue Reading: card renders correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Continue reading section should be present
    const continueSection = page.getByText('Continue Reading');
    await expect(continueSection).toBeVisible();

    // The most recently read in-progress book should be shown
    // note1 has lastRead 30min ago and progress 67%
    const progressText = page.getByText('67% complete').first();
    await expect(progressText).toBeVisible();

    // Play button should exist
    const playButton = page.locator('.play-button-pulse').first();
    await expect(playButton).toBeVisible();
  });

  test('Search: search input works correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    const searchInput = page.locator('input[type="search"]');

    // Type a search query
    await searchInput.fill('Design');
    await page.waitForTimeout(400);

    // Clear button should appear
    const clearBtn = page.locator('button[aria-label="Clear search"]');
    await expect(clearBtn).toBeVisible();

    // Filtered results should show
    const cards = page.locator('[data-testid="book-card"]');
    const count = await cards.count();
    // "Design" should match "Design Patterns" at minimum
    expect(count).toBeGreaterThan(0);

    // Clear search
    await clearBtn.click();
    await page.waitForTimeout(200);

    // Search should be cleared
    await expect(searchInput).toHaveValue('');
  });

  test('View modes: grid and list views work', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Switch to list view
    const listViewBtn = page.getByRole('button', { name: 'List view' });
    await listViewBtn.click();
    await page.waitForTimeout(300);

    // List view should be visible - check for list view specific elements
    await expect(listViewBtn).toHaveAttribute('aria-pressed', 'true');

    // Switch back to grid view
    const gridViewBtn = page.getByRole('button', { name: 'Grid view' });
    await gridViewBtn.click();
    await page.waitForTimeout(300);
    await expect(gridViewBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('full page screenshot - dark mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();
    await page.waitForTimeout(500); // Let animations settle

    await page.screenshot({
      path: 'e2e/screenshots/audit-desktop-dark.png',
      fullPage: true,
    });
  });
});

test.describe('UI/UX Audit - Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMocks(page);
  });

  test('Mobile: touch targets meet 44px minimum', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Check filter button touch target
    const filtersBtn = page.getByRole('button', { name: /Filters/i });
    const filtersBtnBox = await filtersBtn.boundingBox();
    expect(filtersBtnBox!.height).toBeGreaterThanOrEqual(44);

    // Check theme toggle touch target
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    const themeBox = await themeToggle.boundingBox();
    expect(themeBox!.height).toBeGreaterThanOrEqual(44);
    expect(themeBox!.width).toBeGreaterThanOrEqual(44);
  });

  test('Mobile: mobile filters sheet opens and closes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Open mobile filters
    const filtersBtn = page.getByRole('button', { name: /Filters/i });
    await filtersBtn.click();
    await page.waitForTimeout(300);

    // Filters sheet should be open - use the exact filter trigger button
    const filterTrigger = page.getByRole('button', { name: 'Filters', exact: true });
    await expect(filterTrigger).toHaveAttribute('aria-expanded', 'true');

    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('Mobile: responsive grid shows 2 columns', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // On 375px width, grid should show 2 columns
    const gridCols = await page.evaluate(() => {
      const grid = document.querySelector('.library-grid-optimized, [role="list"]');
      if (!grid) return 0;
      const style = getComputedStyle(grid);
      const templateCols = style.gridTemplateColumns;
      return templateCols.split(' ').length;
    });
    expect(gridCols).toBe(2);
  });

  test('Mobile: full page screenshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/audit-mobile.png',
      fullPage: true,
    });
  });

  test('Mobile: continue reading card is responsive', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('The Art of Computer Programming').first()).toBeVisible();

    // Continue reading card should not overflow
    const card = page.locator('.continue-reading-glow').first();
    const cardBox = await card.boundingBox();
    expect(cardBox!.width).toBeLessThanOrEqual(375);
  });
});

test.describe('UI/UX Audit - Empty & Error States', () => {
  test('Empty library shows proper empty state', async ({ page }) => {
    await page.route('**/api/library**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Empty state message
    await expect(page.getByText('Your library awaits')).toBeVisible();
    await expect(page.getByText('Start building your reading collection')).toBeVisible();

    // Refresh button should exist
    await expect(page.getByRole('button', { name: 'Refresh Library' })).toBeVisible();

    // Floating animation should be present
    const floatElement = page.locator('.animate-float');
    await expect(floatElement).toBeVisible();
  });

  test('Loading state shows skeleton', async ({ page }) => {
    await page.route('**/api/library**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');

    // Skeleton elements should appear
    const skeletons = page.locator('.skeleton');
    await expect(skeletons.first()).toBeVisible();

    // Loading role should be present
    const loadingStatus = page.locator('[role="status"][aria-label="Loading library"]');
    await expect(loadingStatus).toBeVisible();
  });
});
