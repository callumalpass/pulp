import { test, expect, type Page } from '@playwright/test';

/**
 * Comprehensive UI/UX and Performance Audit
 *
 * Captures screenshots and collects performance metrics to identify
 * areas for improvement in the Pulp reading application.
 */

test.describe('UI/UX Improvement Audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Wait for library to load
    await page.waitForSelector('[data-testid="book-card"], [role="status"]', { timeout: 15000 });
  });

  test('1. Layout and spacing audit', async ({ page }) => {
    // Capture the full page
    await page.screenshot({ path: 'e2e/screenshots/audit-improvement/01-full-page.png', fullPage: true });

    // Check header height and alignment
    const header = page.locator('header');
    if (await header.count() > 0) {
      const headerBox = await header.boundingBox();
      console.log('[AUDIT] Header:', JSON.stringify(headerBox));
    }

    // Check main content padding
    const mainContent = page.locator('.library-page-main, main').first();
    if (await mainContent.count() > 0) {
      const mainBox = await mainContent.boundingBox();
      const computedStyle = await mainContent.evaluate(el => {
        const style = getComputedStyle(el);
        return {
          padding: style.padding,
          maxWidth: style.maxWidth,
          margin: style.margin,
        };
      });
      console.log('[AUDIT] Main content:', JSON.stringify({ box: mainBox, style: computedStyle }));
    }

    // Check grid gap consistency
    const grid = page.locator('.grid').first();
    if (await grid.count() > 0) {
      const gridStyle = await grid.evaluate(el => {
        const style = getComputedStyle(el);
        return {
          gap: style.gap,
          gridTemplateColumns: style.gridTemplateColumns,
        };
      });
      console.log('[AUDIT] Grid layout:', JSON.stringify(gridStyle));
    }
  });

  test('2. Color contrast and readability audit', async ({ page }) => {
    // Dark theme audit
    await page.screenshot({ path: 'e2e/screenshots/audit-improvement/02-dark-theme.png', fullPage: true });

    // Collect text color contrasts
    const contrastResults = await page.evaluate(() => {
      const results: Array<{ element: string; color: string; bg: string; fontSize: string; fontWeight: string }> = [];

      const elements = document.querySelectorAll('h1, h2, h3, p, span, a, button, input, label');
      elements.forEach(el => {
        const style = getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          results.push({
            element: `${el.tagName}.${el.className?.toString().slice(0, 50)}`,
            color: style.color,
            bg: style.backgroundColor,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
          });
        }
      });

      return results.slice(0, 30);
    });
    console.log('[AUDIT] Contrast samples:', JSON.stringify(contrastResults, null, 2));

    // Switch to light theme and audit
    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    if (await themeToggle.count() > 0) {
      await themeToggle.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/screenshots/audit-improvement/02-light-theme.png', fullPage: true });
      // Switch back
      await themeToggle.click();
      await page.waitForTimeout(500);
    }
  });

  test('3. Interactive elements and touch targets audit', async ({ page }) => {
    // Check all interactive elements for minimum touch target size
    const touchTargetIssues = await page.evaluate(() => {
      const issues: Array<{ element: string; width: number; height: number; text: string }> = [];
      const interactiveElements = document.querySelectorAll('button, a, input, select, [role="button"], [tabindex]');

      interactiveElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          const text = (el as HTMLElement).innerText?.slice(0, 30) || el.getAttribute('aria-label') || el.tagName;
          issues.push({
            element: `${el.tagName}${el.className ? '.' + el.className.toString().split(' ')[0] : ''}`,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            text,
          });
        }
      });

      return issues;
    });
    console.log(`[AUDIT] Touch target issues (< 44px): ${touchTargetIssues.length}`);
    if (touchTargetIssues.length > 0) {
      console.log('[AUDIT] Touch target details:', JSON.stringify(touchTargetIssues.slice(0, 15), null, 2));
    }

    // Check focus visibility
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'e2e/screenshots/audit-improvement/03-focus-state.png' });

    // Check for elements missing focus styles
    const focusIssues = await page.evaluate(() => {
      const issues: string[] = [];
      const interactive = document.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]');

      interactive.forEach(el => {
        const style = getComputedStyle(el);
        const focusStyle = getComputedStyle(el, ':focus-visible');
        if (!el.matches(':focus-visible') && style.outline === 'none' && !el.className.includes('focus')) {
          // Not currently focused, but check if it has focus styles defined
          const hasFocusClass = el.className.includes('focus-visible') || el.className.includes('focus-ring');
          if (!hasFocusClass) {
            issues.push(`${el.tagName}.${el.className?.toString().slice(0, 40)}`);
          }
        }
      });

      return issues;
    });
    console.log(`[AUDIT] Elements potentially missing focus styles: ${focusIssues.length}`);
  });

  test('4. Typography and text hierarchy audit', async ({ page }) => {
    // Collect all text sizes and weights in use
    const typography = await page.evaluate(() => {
      const sizeMap = new Map<string, number>();
      const weightMap = new Map<string, number>();
      const fontMap = new Map<string, number>();

      const allText = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button, label, td, th, li');
      allText.forEach(el => {
        const style = getComputedStyle(el);
        if (style.display !== 'none' && el.textContent?.trim()) {
          sizeMap.set(style.fontSize, (sizeMap.get(style.fontSize) || 0) + 1);
          weightMap.set(style.fontWeight, (weightMap.get(style.fontWeight) || 0) + 1);
          fontMap.set(style.fontFamily.split(',')[0].trim(), (fontMap.get(style.fontFamily.split(',')[0].trim()) || 0) + 1);
        }
      });

      return {
        sizes: Object.fromEntries(sizeMap),
        weights: Object.fromEntries(weightMap),
        fonts: Object.fromEntries(fontMap),
      };
    });
    console.log('[AUDIT] Typography distribution:', JSON.stringify(typography, null, 2));
  });

  test('5. Card consistency and spacing audit', async ({ page }) => {
    const cards = page.locator('[data-testid="book-card"]');
    const cardCount = await cards.count();
    console.log(`[AUDIT] Total book cards: ${cardCount}`);

    if (cardCount > 0) {
      // Take a close-up of first two cards
      const firstCard = cards.first();
      await firstCard.scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'e2e/screenshots/audit-improvement/05-card-detail.png' });

      // Check card dimensions consistency
      const cardDimensions = await page.evaluate(() => {
        const cards = document.querySelectorAll('[data-testid="book-card"]');
        const dims: Array<{ width: number; height: number }> = [];

        cards.forEach(card => {
          const rect = card.getBoundingClientRect();
          if (rect.width > 0) {
            dims.push({ width: Math.round(rect.width), height: Math.round(rect.height) });
          }
        });

        return dims.slice(0, 10);
      });
      console.log('[AUDIT] Card dimensions:', JSON.stringify(cardDimensions));

      // Check card content areas
      const cardContent = await page.evaluate(() => {
        const results: Array<{
          title: string;
          titleHeight: number;
          metaHeight: number;
          coverHeight: number;
          totalHeight: number;
          textOverflow: boolean;
        }> = [];

        const cards = document.querySelectorAll('[data-testid="book-card"]');
        cards.forEach(card => {
          const titleEl = card.querySelector('h3');
          const metaArea = card.querySelector('.flex.items-center.gap-2.mt-auto');
          const coverArea = card.querySelector('.aspect-\\[2\\/3\\]');

          if (titleEl) {
            results.push({
              title: titleEl.textContent?.slice(0, 40) || '',
              titleHeight: Math.round(titleEl.getBoundingClientRect().height),
              metaHeight: metaArea ? Math.round(metaArea.getBoundingClientRect().height) : 0,
              coverHeight: coverArea ? Math.round(coverArea.getBoundingClientRect().height) : 0,
              totalHeight: Math.round(card.getBoundingClientRect().height),
              textOverflow: titleEl.scrollHeight > titleEl.clientHeight,
            });
          }
        });

        return results.slice(0, 8);
      });
      console.log('[AUDIT] Card content areas:', JSON.stringify(cardContent, null, 2));

      // Hover state audit
      await firstCard.hover();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'e2e/screenshots/audit-improvement/05-card-hover.png' });
    }
  });

  test('6. Navigation and scroll behavior audit', async ({ page }) => {
    // Check scroll behavior
    const scrollMetrics = await page.evaluate(() => {
      const main = document.getElementById('main-content') || document.querySelector('main');
      return {
        scrollHeight: main?.scrollHeight,
        clientHeight: main?.clientHeight,
        isScrollable: main ? main.scrollHeight > main.clientHeight : false,
        scrollBehavior: main ? getComputedStyle(main).scrollBehavior : 'unknown',
      };
    });
    console.log('[AUDIT] Scroll metrics:', JSON.stringify(scrollMetrics));

    // Check for skip link
    const skipLink = page.locator('.skip-link, [href="#main-content"]');
    const hasSkipLink = await skipLink.count() > 0;
    console.log(`[AUDIT] Skip link present: ${hasSkipLink}`);

    // Keyboard navigation audit
    const tabOrder: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return 'none';
        return `${el.tagName}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}`;
      });
      tabOrder.push(focused);
    }
    console.log('[AUDIT] Tab order (first 10):', JSON.stringify(tabOrder));
  });

  test('7. Performance metrics audit', async ({ page }) => {
    // Collect performance metrics
    const metrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const paintEntries = performance.getEntriesByType('paint');
      const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

      const nav = entries[0];
      const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');

      // Count resources by type
      const resourcesByType: Record<string, { count: number; totalSize: number }> = {};
      resourceEntries.forEach(r => {
        const ext = r.name.split('.').pop()?.split('?')[0] || 'unknown';
        const type = ['js', 'mjs'].includes(ext) ? 'js' :
                     ['css'].includes(ext) ? 'css' :
                     ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'].includes(ext) ? 'image' :
                     ['woff', 'woff2', 'ttf'].includes(ext) ? 'font' : 'other';
        if (!resourcesByType[type]) resourcesByType[type] = { count: 0, totalSize: 0 };
        resourcesByType[type].count++;
        resourcesByType[type].totalSize += r.transferSize || 0;
      });

      return {
        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
        loadComplete: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
        firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null,
        totalResources: resourceEntries.length,
        resourcesByType,
        domNodes: document.querySelectorAll('*').length,
      };
    });
    console.log('[AUDIT] Performance metrics:', JSON.stringify(metrics, null, 2));

    // Layout shift audit
    const layoutShifts = await page.evaluate(() => {
      return new Promise<number>(resolve => {
        let cls = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cls += (entry as any).value;
            }
          }
        });
        try {
          observer.observe({ type: 'layout-shift', buffered: true });
        } catch {
          // layout-shift not supported
        }
        setTimeout(() => {
          observer.disconnect();
          resolve(cls);
        }, 2000);
      });
    });
    console.log(`[AUDIT] Cumulative Layout Shift: ${layoutShifts.toFixed(4)}`);

    // Check for unnecessary re-renders via DOM mutation count
    const mutationCount = await page.evaluate(() => {
      return new Promise<number>(resolve => {
        let count = 0;
        const observer = new MutationObserver(mutations => {
          count += mutations.length;
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(count);
        }, 3000);
      });
    });
    console.log(`[AUDIT] DOM mutations in 3s (idle): ${mutationCount}`);
  });

  test('8. Filter and search UX audit', async ({ page }) => {
    // Screenshot of search bar
    const searchInput = page.locator('input[type="search"]');
    if (await searchInput.count() > 0) {
      await searchInput.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'e2e/screenshots/audit-improvement/08-search-focused.png' });

      // Type a search query and check response
      await searchInput.fill('test');
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/screenshots/audit-improvement/08-search-results.png' });

      // Clear search
      await searchInput.fill('');
    }

    // Filter buttons audit
    const filterButtons = page.locator('.filter-btn');
    const filterCount = await filterButtons.count();
    console.log(`[AUDIT] Filter buttons found: ${filterCount}`);

    // Check filter button sizing
    const filterSizes = await page.evaluate(() => {
      const buttons = document.querySelectorAll('.filter-btn');
      const sizes: Array<{ text: string; width: number; height: number; padding: string }> = [];

      buttons.forEach(btn => {
        const rect = btn.getBoundingClientRect();
        const style = getComputedStyle(btn);
        sizes.push({
          text: (btn as HTMLElement).innerText?.slice(0, 20) || '',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          padding: style.padding,
        });
      });

      return sizes;
    });
    console.log('[AUDIT] Filter button sizes:', JSON.stringify(filterSizes, null, 2));
  });

  test('9. Empty and loading states audit', async ({ page }) => {
    // Force an invalid search to see empty state
    const searchInput = page.locator('input[type="search"]');
    if (await searchInput.count() > 0) {
      await searchInput.fill('xyznonexistentbook123456');
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/screenshots/audit-improvement/09-empty-search.png', fullPage: true });
      await searchInput.fill('');
    }
  });

  test('10. Responsive design audit - mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone 13 mini
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit-improvement/10-mobile-375.png', fullPage: true });

    // Check for horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log(`[AUDIT] Mobile horizontal overflow: ${hasOverflow}`);

    // Check text readability at mobile size
    const mobileText = await page.evaluate(() => {
      const issues: string[] = [];
      const elements = document.querySelectorAll('p, span, h1, h2, h3, button');
      elements.forEach(el => {
        const style = getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize);
        if (fontSize < 12 && el.textContent?.trim() && style.display !== 'none') {
          issues.push(`${el.tagName}(${fontSize}px): "${el.textContent?.slice(0, 30)}"`);
        }
      });
      return issues;
    });
    console.log(`[AUDIT] Mobile text < 12px: ${mobileText.length}`);
    if (mobileText.length > 0) {
      console.log('[AUDIT] Small text details:', JSON.stringify(mobileText.slice(0, 10)));
    }

    // Tablet size
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit-improvement/10-tablet-768.png', fullPage: true });
  });

  test('11. Animation and transition performance audit', async ({ page }) => {
    // Check for jank during scroll
    const scrollJank = await page.evaluate(async () => {
      const main = document.getElementById('main-content') || document.querySelector('main');
      if (!main) return { frames: 0, jankyFrames: 0 };

      let frames = 0;
      let jankyFrames = 0;
      let lastTime = 0;

      return new Promise<{ frames: number; jankyFrames: number }>(resolve => {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            frames++;
            const duration = entry.duration;
            if (duration > 16.67) { // > 60fps threshold
              jankyFrames++;
            }
          }
        });

        try {
          observer.observe({ type: 'long-animation-frame', buffered: false });
        } catch {
          // Not supported
        }

        // Trigger scroll
        const scrollSteps = 10;
        let step = 0;
        const scrollInterval = setInterval(() => {
          main.scrollTop += 200;
          step++;
          if (step >= scrollSteps) {
            clearInterval(scrollInterval);
            setTimeout(() => {
              observer.disconnect();
              resolve({ frames, jankyFrames });
            }, 500);
          }
        }, 100);
      });
    });
    console.log('[AUDIT] Scroll performance:', JSON.stringify(scrollJank));

    // Check card hover animation performance
    const cards = page.locator('[data-testid="book-card"]');
    if (await cards.count() > 0) {
      const firstCard = cards.first();
      await firstCard.scrollIntoViewIfNeeded();

      // Hover and check for GPU layers
      await firstCard.hover();
      await page.waitForTimeout(300);

      const layerCount = await page.evaluate(() => {
        let composited = 0;
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
          const style = getComputedStyle(el);
          if (style.willChange !== 'auto' || style.transform !== 'none' || style.opacity !== '1') {
            composited++;
          }
        });
        return composited;
      });
      console.log(`[AUDIT] Composited layers estimate: ${layerCount}`);
    }
  });

  test('12. Accessibility ARIA audit', async ({ page }) => {
    const ariaAudit = await page.evaluate(() => {
      const results = {
        missingAltText: 0,
        missingLabels: 0,
        missingRoles: 0,
        missingHeadingHierarchy: false,
        headingLevels: [] as number[],
        landmarkRegions: [] as string[],
        issues: [] as string[],
      };

      // Check images for alt text
      document.querySelectorAll('img').forEach(img => {
        if (!img.alt && !img.getAttribute('aria-label') && !img.getAttribute('aria-hidden')) {
          results.missingAltText++;
          results.issues.push(`img missing alt: ${img.src?.slice(-40)}`);
        }
      });

      // Check buttons and inputs for labels
      document.querySelectorAll('button, input, select, textarea').forEach(el => {
        const hasLabel = el.getAttribute('aria-label') ||
                         el.getAttribute('aria-labelledby') ||
                         el.getAttribute('title') ||
                         (el as HTMLElement).innerText?.trim() ||
                         (el.tagName === 'INPUT' && (el as HTMLInputElement).placeholder);
        if (!hasLabel) {
          results.missingLabels++;
          results.issues.push(`${el.tagName} missing label: ${el.className?.toString().slice(0, 40)}`);
        }
      });

      // Check heading hierarchy
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      let prevLevel = 0;
      headings.forEach(h => {
        const level = parseInt(h.tagName[1]);
        results.headingLevels.push(level);
        if (level > prevLevel + 1 && prevLevel > 0) {
          results.missingHeadingHierarchy = true;
          results.issues.push(`Heading skip: h${prevLevel} -> h${level}`);
        }
        prevLevel = level;
      });

      // Check landmark regions
      document.querySelectorAll('[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], header, nav, main, footer').forEach(el => {
        results.landmarkRegions.push(el.tagName + (el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''));
      });

      return results;
    });
    console.log('[AUDIT] Accessibility results:', JSON.stringify(ariaAudit, null, 2));
  });

  test('13. Continue Reading section audit', async ({ page }) => {
    // Check if continue reading section exists
    const continueReading = page.locator('text=Continue Reading');
    if (await continueReading.count() > 0) {
      await continueReading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'e2e/screenshots/audit-improvement/13-continue-reading.png' });

      // Check the card's interactive area
      const crCard = page.locator('.continue-reading-glow').first();
      if (await crCard.count() > 0) {
        const crBox = await crCard.boundingBox();
        console.log('[AUDIT] Continue reading card size:', JSON.stringify(crBox));

        await crCard.hover();
        await page.waitForTimeout(300);
        await page.screenshot({ path: 'e2e/screenshots/audit-improvement/13-continue-reading-hover.png' });
      }
    } else {
      console.log('[AUDIT] No "Continue Reading" section visible');
    }
  });

  test('14. Stats bar audit', async ({ page }) => {
    // Check library stats display
    const statsSection = page.locator('text=Total Books').or(page.locator('text=Reading')).first();
    if (await statsSection.count() > 0) {
      const statsContainer = statsSection.locator('..');
      if (await statsContainer.count() > 0) {
        await statsContainer.scrollIntoViewIfNeeded();
        await page.screenshot({ path: 'e2e/screenshots/audit-improvement/14-stats-bar.png' });
      }
    }

    // Check stats overflow on narrow screens
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);

    const statsOverflow = await page.evaluate(() => {
      // Look for stats-like containers
      const containers = document.querySelectorAll('.flex.items-center.gap-2, .flex.items-center.gap-4, .flex.items-center.gap-6');
      let hasOverflow = false;
      containers.forEach(el => {
        if (el.scrollWidth > el.clientWidth) {
          hasOverflow = true;
        }
      });
      return hasOverflow;
    });
    console.log(`[AUDIT] Stats overflow on mobile: ${statsOverflow}`);
  });

  test('15. Image loading and cover art audit', async ({ page }) => {
    // Check all images
    const imageAudit = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const results: Array<{
        src: string;
        loading: string;
        decoded: boolean;
        naturalWidth: number;
        naturalHeight: number;
        displayWidth: number;
        displayHeight: number;
        hasLoaded: boolean;
      }> = [];

      images.forEach(img => {
        results.push({
          src: img.src?.slice(-50) || '',
          loading: img.loading || 'default',
          decoded: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          displayWidth: Math.round(img.getBoundingClientRect().width),
          displayHeight: Math.round(img.getBoundingClientRect().height),
          hasLoaded: img.complete && img.naturalWidth > 0,
        });
      });

      return results;
    });
    console.log(`[AUDIT] Images total: ${imageAudit.length}`);
    console.log('[AUDIT] Image details:', JSON.stringify(imageAudit.slice(0, 10), null, 2));

    // Check for oversized images (display size vs natural size)
    const oversized = imageAudit.filter(img =>
      img.hasLoaded && (img.naturalWidth > img.displayWidth * 2.5 || img.naturalHeight > img.displayHeight * 2.5)
    );
    if (oversized.length > 0) {
      console.log(`[AUDIT] Oversized images (>2.5x): ${oversized.length}`);
    }
  });
});
