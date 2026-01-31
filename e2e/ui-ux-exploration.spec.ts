import { test, expect, Page } from '@playwright/test';

// Comprehensive mock data for testing
const NOW = Date.now();
const HOUR = 3600000;
const DAY = 86400000;

const mockLibrary = [
  {
    id: 'book-1',
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    type: 'pdf',
    path: '/books/design-things.pdf',
    progress: 0.73,
    totalPages: 368,
    currentPage: 269,
    lastRead: NOW - HOUR * 2,
    dateCreated: NOW - DAY * 30,
    coverUrl: null,
    rating: 5,
    isPinned: true,
    readingStats: {
      totalReadingTime: 18000000,
      totalPagesRead: 269,
      averageReadingSpeed: 1.2,
      lastSessionDate: NOW - HOUR * 2,
      sessionsCount: 15,
    },
  },
  {
    id: 'book-2',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    type: 'pdf',
    path: '/books/thinking.pdf',
    progress: 0.45,
    totalPages: 499,
    currentPage: 225,
    lastRead: NOW - HOUR * 6,
    dateCreated: NOW - DAY * 45,
    coverUrl: null,
    rating: 4,
    isPinned: false,
    readingStats: {
      totalReadingTime: 14400000,
      totalPagesRead: 225,
      averageReadingSpeed: 0.9,
      lastSessionDate: NOW - HOUR * 6,
      sessionsCount: 12,
    },
  },
  {
    id: 'book-3',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    author: 'Robert C. Martin',
    type: 'pdf',
    path: '/books/clean-code.pdf',
    progress: 1.0,
    totalPages: 464,
    currentPage: 464,
    lastRead: NOW - DAY * 7,
    dateCreated: NOW - DAY * 90,
    coverUrl: null,
    rating: 5,
    isPinned: false,
    readingStats: {
      totalReadingTime: 28800000,
      totalPagesRead: 464,
      averageReadingSpeed: 1.1,
      lastSessionDate: NOW - DAY * 7,
      sessionsCount: 20,
    },
  },
  {
    id: 'book-4',
    title: 'The Pragmatic Programmer',
    author: 'David Thomas, Andrew Hunt',
    type: 'epub',
    path: '/books/pragmatic.epub',
    progress: 0.15,
    totalPages: 352,
    currentPage: 53,
    lastRead: NOW - DAY * 2,
    dateCreated: NOW - DAY * 14,
    coverUrl: null,
    rating: 0,
    isPinned: false,
    readingStats: {
      totalReadingTime: 3600000,
      totalPagesRead: 53,
      averageReadingSpeed: 0.8,
      lastSessionDate: NOW - DAY * 2,
      sessionsCount: 3,
    },
  },
  {
    id: 'book-5',
    title: 'Refactoring: Improving the Design of Existing Code',
    author: 'Martin Fowler',
    type: 'pdf',
    path: '/books/refactoring.pdf',
    progress: 0,
    totalPages: 448,
    currentPage: 0,
    lastRead: null,
    dateCreated: NOW - DAY * 3,
    coverUrl: null,
    rating: 0,
    isPinned: false,
    readingStats: null,
  },
  {
    id: 'book-6',
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson, Gerald Jay Sussman',
    type: 'pdf',
    path: '/books/sicp.pdf',
    progress: 0.28,
    totalPages: 657,
    currentPage: 184,
    lastRead: NOW - DAY * 5,
    dateCreated: NOW - DAY * 60,
    coverUrl: null,
    rating: 5,
    isPinned: true,
    readingStats: {
      totalReadingTime: 10800000,
      totalPagesRead: 184,
      averageReadingSpeed: 0.7,
      lastSessionDate: NOW - DAY * 5,
      sessionsCount: 8,
    },
  },
];

const mockLibraryStats = {
  totalBooks: mockLibrary.length,
  totalPagesRead: 1195,
  booksCompleted: 1,
  booksInProgress: 4,
  totalReadingTime: 75600000,
  averageReadingSpeed: 0.95,
  currentStreak: 5,
  longestStreak: 12,
};

async function setupMocks(page: Page) {
  await page.route('**/api/library', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockLibrary),
    });
  });

  await page.route('**/api/library-stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockLibraryStats),
    });
  });

  await page.route('**/api/collections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(['Programming', 'Design', 'Philosophy']),
    });
  });

  // Mock cover images to prevent 404s
  await page.route('**/api/covers/**', async (route) => {
    await route.fulfill({
      status: 404,
    });
  });
}

test.describe('UI/UX Exploration', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('capture desktop default state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });
    await page.waitForTimeout(500); // Wait for animations

    await page.screenshot({
      path: 'e2e/screenshots/exploration/01-desktop-default.png',
      fullPage: true,
    });
  });

  test('capture light theme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    // Toggle to light theme
    const themeToggle = page.locator('[aria-label*="theme"], [data-testid="theme-toggle"], button:has-text("theme")').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/exploration/02-desktop-light.png',
      fullPage: true,
    });
  });

  test('capture card hover states', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });
    await page.waitForTimeout(500); // Wait for data to load

    // Hover over first card - use a more flexible selector
    const firstCard = page.locator('a[href^="/read/"]').first();
    if (await firstCard.isVisible({ timeout: 5000 })) {
      await firstCard.hover();
      await page.waitForTimeout(300);
    }

    await page.screenshot({
      path: 'e2e/screenshots/exploration/03-card-hover.png',
      fullPage: true,
    });
  });

  test('capture list view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    // Find and click list view toggle
    const listToggle = page.locator('[aria-label*="list"], [data-testid="list-view-toggle"], button:has([class*="list"])').first();
    if (await listToggle.isVisible()) {
      await listToggle.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/exploration/04-list-view.png',
      fullPage: true,
    });
  });

  test('capture search interaction', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    // Find and interact with search
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], [data-testid="search-input"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.click();
      await searchInput.fill('design');
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/exploration/05-search.png',
      fullPage: true,
    });
  });

  test('capture filter interactions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    // Try to filter by type
    const typeFilter = page.locator('select, [data-testid="type-filter"], button:has-text("PDF")').first();
    if (await typeFilter.isVisible()) {
      await typeFilter.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({
      path: 'e2e/screenshots/exploration/06-filtered.png',
      fullPage: true,
    });
  });

  test('capture mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 size
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'e2e/screenshots/exploration/07-mobile.png',
      fullPage: true,
    });
  });

  test('capture mobile filters', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    // Look for mobile filter button
    const filterButton = page.locator('[aria-label*="filter" i], [data-testid="mobile-filter"], button:has([class*="filter"])').first();
    if (await filterButton.isVisible()) {
      await filterButton.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/exploration/08-mobile-filters.png',
      fullPage: true,
    });
  });

  test('capture continue reading section', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    // Look for continue reading section
    const continueReading = page.locator('[data-testid="continue-reading"], section:has-text("Continue Reading")').first();
    if (await continueReading.isVisible()) {
      await continueReading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    }

    await page.screenshot({
      path: 'e2e/screenshots/exploration/09-continue-reading.png',
      fullPage: true,
    });
  });

  test('capture stats section', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    // Look for stats section
    const stats = page.locator('[data-testid="library-stats"], [class*="stats"], section:has-text("streak")').first();
    if (await stats.isVisible()) {
      await stats.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    }

    await page.screenshot({
      path: 'e2e/screenshots/exploration/10-stats.png',
      fullPage: true,
    });
  });

  test('capture empty state with filter', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    // Search for something that won't match
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('xyznonexistent');
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'e2e/screenshots/exploration/11-empty-filter.png',
      fullPage: true,
    });
  });

  test('capture loading skeleton', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Delay the API response to capture loading state
    await page.route('**/api/library', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLibrary),
      });
    });

    await page.goto('/');

    // Capture immediately to get loading state
    await page.screenshot({
      path: 'e2e/screenshots/exploration/12-loading.png',
      fullPage: true,
    });
  });
});

test.describe('Performance Metrics', () => {
  test('measure library page performance', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Start performance measurement
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    const loadTime = Date.now() - startTime;

    // Get performance metrics
    const performanceMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const nav = entries[0];
      return {
        domContentLoaded: nav?.domContentLoadedEventEnd - nav?.startTime,
        loadComplete: nav?.loadEventEnd - nav?.startTime,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      };
    });

    // Get layout shift
    const layoutShift = await page.evaluate(() => {
      return new Promise((resolve) => {
        let cls = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cls += (entry as any).value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(cls);
        }, 1000);
      });
    });

    console.log('Performance Metrics:');
    console.log(`  Load Time: ${loadTime}ms`);
    console.log(`  DOM Content Loaded: ${performanceMetrics.domContentLoaded?.toFixed(0)}ms`);
    console.log(`  Load Complete: ${performanceMetrics.loadComplete?.toFixed(0)}ms`);
    console.log(`  First Paint: ${performanceMetrics.firstPaint?.toFixed(0)}ms`);
    console.log(`  First Contentful Paint: ${performanceMetrics.firstContentfulPaint?.toFixed(0)}ms`);
    console.log(`  Cumulative Layout Shift: ${(layoutShift as number).toFixed(4)}`);

    // Assertions
    expect(performanceMetrics.firstContentfulPaint).toBeLessThan(2000);
    expect(layoutShift).toBeLessThan(0.25);
  });

  test('measure scroll performance', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    // Measure frame rate during scroll
    const frameMetrics = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const frames: number[] = [];
        let lastTime = performance.now();

        const measureFrame = () => {
          const now = performance.now();
          frames.push(1000 / (now - lastTime));
          lastTime = now;
        };

        // Scroll smoothly
        let scrollPos = 0;
        const scrollInterval = setInterval(() => {
          scrollPos += 50;
          window.scrollTo(0, scrollPos);
          measureFrame();

          if (scrollPos > 1000) {
            clearInterval(scrollInterval);
            const avgFps = frames.reduce((a, b) => a + b, 0) / frames.length;
            const minFps = Math.min(...frames);
            resolve({ avgFps, minFps, frameCount: frames.length });
          }
        }, 16);
      });
    });

    console.log('Scroll Performance:');
    console.log(`  Average FPS: ${(frameMetrics as any).avgFps.toFixed(1)}`);
    console.log(`  Min FPS: ${(frameMetrics as any).minFps.toFixed(1)}`);
  });

  test('check accessibility basics', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForSelector('[data-testid="library-grid"], [class*="grid"]', { timeout: 10000 });

    // Check for skip link
    const skipLink = page.locator('a[href="#main-content"], .skip-link');
    const hasSkipLink = (await skipLink.count()) > 0;

    // Check for heading hierarchy
    const h1Count = await page.locator('h1').count();
    const headings = await page.evaluate(() => {
      const h = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      return Array.from(h).map((el) => ({
        level: parseInt(el.tagName[1]),
        text: el.textContent?.trim().slice(0, 50),
      }));
    });

    // Check for images with alt text
    const images = await page.evaluate(() => {
      const imgs = document.querySelectorAll('img');
      return Array.from(imgs).map((img) => ({
        hasAlt: img.hasAttribute('alt'),
        src: img.src.slice(-50),
      }));
    });

    // Check for button labels
    const buttons = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      return Array.from(btns).map((btn) => ({
        hasLabel: btn.hasAttribute('aria-label') || btn.textContent?.trim().length > 0,
        label: btn.getAttribute('aria-label') || btn.textContent?.trim().slice(0, 30),
      }));
    });

    // Check color contrast (basic check)
    const colorContrast = await page.evaluate(() => {
      const body = document.body;
      const style = getComputedStyle(body);
      return {
        bgColor: style.backgroundColor,
        textColor: style.color,
      };
    });

    console.log('Accessibility Check:');
    console.log(`  Skip Link Present: ${hasSkipLink}`);
    console.log(`  H1 Count: ${h1Count}`);
    console.log(`  Heading Structure: ${headings.map((h) => `H${h.level}`).join(' -> ')}`);
    console.log(`  Images with Alt: ${images.filter((i) => i.hasAlt).length}/${images.length}`);
    console.log(`  Buttons with Labels: ${buttons.filter((b) => b.hasLabel).length}/${buttons.length}`);
    console.log(`  Colors: bg=${colorContrast.bgColor}, text=${colorContrast.textColor}`);

    // Basic assertions
    expect(h1Count).toBeGreaterThanOrEqual(1);
  });
});
