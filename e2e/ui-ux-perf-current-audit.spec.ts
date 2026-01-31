import { test, expect, type Page } from '@playwright/test';

const screenshotDir = 'e2e/screenshots/current-audit';

test.describe('UI/UX & Performance Audit - Live', () => {

  test('Desktop - Full page with performance metrics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Wait for library to render
    await page.waitForSelector('h1, [class*="grid"], [class*="library"]', { timeout: 10000 });
    await page.waitForTimeout(800);

    await page.screenshot({ path: `${screenshotDir}/01-desktop-full.png`, fullPage: true });

    // Performance metrics
    const metrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const nav = entries[0];
      const paint = performance.getEntriesByType('paint');
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

      return {
        domContentLoaded: nav?.domContentLoadedEventEnd - nav?.startTime,
        loadComplete: nav?.loadEventEnd - nav?.startTime,
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime,
        totalResources: resources.length,
        totalTransferSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
        jsResources: resources.filter(r => r.initiatorType === 'script').length,
        cssResources: resources.filter(r => r.initiatorType === 'link' || r.name.includes('.css')).length,
        largestResources: resources
          .filter(r => r.transferSize > 0)
          .sort((a, b) => b.transferSize - a.transferSize)
          .slice(0, 5)
          .map(r => ({ name: r.name.split('/').pop(), size: r.transferSize, duration: r.duration })),
      };
    });

    console.log('\n=== PERFORMANCE METRICS ===');
    console.log(`Page load time: ${loadTime}ms`);
    console.log(`DOM Content Loaded: ${metrics.domContentLoaded?.toFixed(0)}ms`);
    console.log(`Load Complete: ${metrics.loadComplete?.toFixed(0)}ms`);
    console.log(`First Paint: ${metrics.firstPaint?.toFixed(0)}ms`);
    console.log(`First Contentful Paint: ${metrics.firstContentfulPaint?.toFixed(0)}ms`);
    console.log(`Total Resources: ${metrics.totalResources}`);
    console.log(`Total Transfer Size: ${(metrics.totalTransferSize / 1024).toFixed(1)}KB`);
    console.log(`JS Bundles: ${metrics.jsResources}`);
    console.log(`CSS Resources: ${metrics.cssResources}`);
    console.log(`Largest resources:`);
    metrics.largestResources.forEach(r => console.log(`  ${r.name}: ${(r.size / 1024).toFixed(1)}KB (${r.duration?.toFixed(0)}ms)`));

    // Layout shift
    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
            }
          }
        });
        try {
          observer.observe({ type: 'layout-shift', buffered: true });
        } catch (e) {}
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 1000);
      });
    });
    console.log(`Cumulative Layout Shift: ${cls.toFixed(4)}`);

    // Check for NaN or rendering bugs
    const bodyText = await page.locator('body').textContent();
    const hasNaN = bodyText?.includes('NaN');
    const hasUndefined = bodyText?.match(/\bundefined\b/);
    const hasNull = bodyText?.match(/\bnull\b/);
    console.log(`\n=== RENDERING BUGS ===`);
    console.log(`Contains NaN: ${hasNaN}`);
    console.log(`Contains "undefined": ${!!hasUndefined}`);
    console.log(`Contains "null": ${!!hasNull}`);
  });

  test('Desktop - Light theme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    // Toggle theme
    const themeButton = page.locator('button').filter({ has: page.locator('svg') }).last();
    await themeButton.click();
    await page.waitForTimeout(400);

    await page.screenshot({ path: `${screenshotDir}/02-desktop-light.png`, fullPage: true });
  });

  test('Desktop - Card hover and interactions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    // Scroll to book cards
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(300);

    // Find a book card and hover
    const cards = page.locator('a[href^="/read/"]');
    const cardCount = await cards.count();
    if (cardCount > 0) {
      // Try to find a card in the grid (not continue reading)
      const gridCards = page.locator('.library-card, [class*="library-card"]');
      const gc = await gridCards.count();
      if (gc > 0) {
        await gridCards.first().hover();
      } else {
        await cards.first().hover();
      }
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: `${screenshotDir}/03-card-hover.png`, fullPage: true });
  });

  test('Desktop - List view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Switch to list view
    const listBtn = page.locator('button[aria-label*="list" i], button[aria-label*="List" i]');
    if (await listBtn.count() > 0) {
      await listBtn.first().click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: `${screenshotDir}/04-list-view.png`, fullPage: true });
  });

  test('Desktop - Search', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder*="Search" i]');
    if (await searchInput.count() > 0) {
      await searchInput.click();
      await searchInput.fill('dark');
      await page.waitForTimeout(600);
    }

    await page.screenshot({ path: `${screenshotDir}/05-search.png`, fullPage: true });
  });

  test('Desktop - Filtered by status', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const readingBtn = page.getByRole('button', { name: /^Reading$/i });
    if (await readingBtn.count() > 0) {
      await readingBtn.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: `${screenshotDir}/06-filtered.png`, fullPage: true });
  });

  test('Mobile - Default view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    await page.screenshot({ path: `${screenshotDir}/07-mobile-default.png`, fullPage: true });
  });

  test('Mobile - Filters panel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const filtersBtn = page.getByRole('button', { name: /filter/i });
    if (await filtersBtn.count() > 0) {
      await filtersBtn.first().click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: `${screenshotDir}/08-mobile-filters.png` });
  });

  test('Mobile - Scrolled view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${screenshotDir}/09-mobile-scrolled.png` });
  });

  test('Accessibility & interaction audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    // Accessibility checks
    const a11yIssues = await page.evaluate(() => {
      const issues: string[] = [];

      // Images without alt
      document.querySelectorAll('img').forEach(img => {
        if (!img.alt && !img.getAttribute('aria-hidden')) {
          issues.push(`Image missing alt: ${img.src.split('/').pop()}`);
        }
      });

      // Buttons without names
      document.querySelectorAll('button').forEach(btn => {
        const name = btn.getAttribute('aria-label') || btn.textContent?.trim();
        if (!name) {
          issues.push(`Unnamed button: ${btn.className.slice(0, 60)}`);
        }
      });

      // Small touch targets
      document.querySelectorAll('button, a, [role="button"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.width < 44 && rect.height < 44) {
          const name = el.getAttribute('aria-label') || el.textContent?.trim()?.slice(0, 30);
          issues.push(`Small touch target (${Math.round(rect.width)}x${Math.round(rect.height)}): "${name}"`);
        }
      });

      // Heading hierarchy
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      const levels = headings.map(h => parseInt(h.tagName.charAt(1)));
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] - levels[i - 1] > 1) {
          issues.push(`Heading skip: h${levels[i - 1]} -> h${levels[i]}`);
        }
      }

      // Check text readability
      document.querySelectorAll('*').forEach(el => {
        const style = getComputedStyle(el);
        const text = (el as HTMLElement).innerText?.trim();
        if (text && text.length > 0 && text.length < 200) {
          const fontSize = parseFloat(style.fontSize);
          if (fontSize < 11) {
            issues.push(`Small text (${fontSize.toFixed(1)}px): "${text.slice(0, 40)}"`);
          }
        }
      });

      return issues.slice(0, 30);
    });

    console.log('\n=== ACCESSIBILITY AUDIT ===');
    a11yIssues.forEach(i => console.log(`  - ${i}`));

    // Keyboard navigation
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${screenshotDir}/10-focus-first.png` });

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }
    await page.screenshot({ path: `${screenshotDir}/11-focus-nav.png` });

    // Test keyboard shortcuts
    await page.keyboard.press('/');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotDir}/12-search-shortcut.png` });
  });

  test('DOM complexity & CSS analysis', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    const domStats = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const body = document.body;

      let maxDepth = 0;
      function getDepth(el: Element, depth: number) {
        maxDepth = Math.max(maxDepth, depth);
        for (const child of el.children) {
          getDepth(child, depth + 1);
        }
      }
      getDepth(body, 0);

      // Element counts
      const tagCounts: Record<string, number> = {};
      allElements.forEach(el => {
        const tag = el.tagName.toLowerCase();
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });

      // CSS analysis
      let willChangeCount = 0;
      let filterCount = 0;
      let boxShadowCount = 0;
      let containCount = 0;
      let contentVisibilityCount = 0;

      allElements.forEach(el => {
        const style = getComputedStyle(el);
        if (style.willChange !== 'auto') willChangeCount++;
        if (style.filter !== 'none') filterCount++;
        if (style.boxShadow !== 'none') boxShadowCount++;
        if (style.contain !== 'none') containCount++;
        if ((style as any).contentVisibility && (style as any).contentVisibility !== 'visible') contentVisibilityCount++;
      });

      return {
        totalElements: allElements.length,
        maxDepth,
        uniqueClasses: new Set(Array.from(allElements).flatMap(el => Array.from(el.classList))).size,
        topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
        willChangeCount,
        filterCount,
        boxShadowCount,
        containCount,
        contentVisibilityCount,
      };
    });

    console.log('\n=== DOM COMPLEXITY ===');
    console.log(`Total DOM elements: ${domStats.totalElements}`);
    console.log(`Max DOM depth: ${domStats.maxDepth}`);
    console.log(`Unique CSS classes: ${domStats.uniqueClasses}`);
    console.log(`Top tags:`);
    domStats.topTags.forEach(([tag, count]) => console.log(`  ${tag}: ${count}`));

    console.log('\n=== CSS PERFORMANCE ===');
    console.log(`will-change: ${domStats.willChangeCount}`);
    console.log(`filter: ${domStats.filterCount}`);
    console.log(`box-shadow: ${domStats.boxShadowCount}`);
    console.log(`contain: ${domStats.containCount}`);
    console.log(`content-visibility: ${domStats.contentVisibilityCount}`);

    // Animation performance
    const fps = await page.evaluate(async () => {
      return new Promise<{ averageFps: number; droppedFrames: number }>((resolve) => {
        let frameCount = 0;
        let lastTime = performance.now();
        const frameTimes: number[] = [];

        function measure(now: number) {
          frameCount++;
          const delta = now - lastTime;
          frameTimes.push(delta);
          lastTime = now;
          if (frameCount < 60) {
            requestAnimationFrame(measure);
          } else {
            const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            const droppedFrames = frameTimes.filter(d => d > 20).length;
            resolve({
              averageFps: Math.round(1000 / avgDelta),
              droppedFrames,
            });
          }
        }
        requestAnimationFrame(measure);
      });
    });

    console.log('\n=== FRAME RATE ===');
    console.log(`Average FPS: ${fps.averageFps}`);
    console.log(`Dropped frames: ${fps.droppedFrames}/60`);
  });

  test('Continue reading card analysis', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    // Check the continue reading section
    const continueReading = page.locator('text=CONTINUE READING').first();
    if (await continueReading.count() > 0) {
      await continueReading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      // Get the continue reading card
      const card = page.locator('a[href^="/read/"]').first();
      await card.hover();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${screenshotDir}/13-continue-reading-hover.png` });
    }
  });

  test('Scroll performance with many items', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    // Measure scroll performance
    const scrollPerf = await page.evaluate(async () => {
      return new Promise<{ averageFps: number; jank: number }>((resolve) => {
        let frameCount = 0;
        let lastTime = performance.now();
        const frameTimes: number[] = [];
        const scrollAmount = 200;
        let currentScroll = 0;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

        function scrollAndMeasure(now: number) {
          frameCount++;
          const delta = now - lastTime;
          frameTimes.push(delta);
          lastTime = now;

          currentScroll += scrollAmount;
          if (currentScroll <= maxScroll) {
            window.scrollTo(0, currentScroll);
          }

          if (frameCount < 120 && currentScroll <= maxScroll + scrollAmount) {
            requestAnimationFrame(scrollAndMeasure);
          } else {
            const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            const jank = frameTimes.filter(d => d > 33).length; // below 30fps
            resolve({
              averageFps: Math.round(1000 / avgDelta),
              jank,
            });
          }
        }
        requestAnimationFrame(scrollAndMeasure);
      });
    });

    console.log('\n=== SCROLL PERFORMANCE ===');
    console.log(`Average scroll FPS: ${scrollPerf.averageFps}`);
    console.log(`Jank frames (>33ms): ${scrollPerf.jank}`);

    // Screenshot at bottom
    await page.screenshot({ path: `${screenshotDir}/14-scrolled-bottom.png` });
  });
});
