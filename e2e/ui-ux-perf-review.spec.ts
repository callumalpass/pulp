import { test, expect } from '@playwright/test';

test.describe('UI/UX and Performance Review', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the library to load (skeleton disappears)
    await page.waitForFunction(() => {
      return !document.querySelector('.skeleton') || document.querySelector('[data-testid="book-card"]');
    }, { timeout: 15000 });
    // Small settle delay
    await page.waitForTimeout(500);
  });

  test('desktop dark theme - full page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Screenshots only needed in Chromium');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/review/desktop-dark.png', fullPage: true });
  });

  test('desktop light theme - full page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Screenshots only needed in Chromium');
    await page.setViewportSize({ width: 1440, height: 900 });

    // Switch to light theme
    const themeToggle = page.getByTestId('theme-toggle');
    await themeToggle.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'e2e/screenshots/review/desktop-light.png', fullPage: true });
  });

  test('mobile dark theme', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Screenshots only needed in Chromium');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e/screenshots/review/mobile-dark.png', fullPage: true });
  });

  test('mobile light theme', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Screenshots only needed in Chromium');
    await page.setViewportSize({ width: 390, height: 844 });

    const themeToggle = page.getByTestId('theme-toggle');
    await themeToggle.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'e2e/screenshots/review/mobile-light.png', fullPage: true });
  });

  test('card hover state', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Screenshots only needed in Chromium');
    await page.setViewportSize({ width: 1440, height: 900 });

    const firstCard = page.getByTestId('book-card').first();
    if (await firstCard.isVisible()) {
      await firstCard.hover();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'e2e/screenshots/review/card-hover.png' });
    }
  });

  test('list view', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Screenshots only needed in Chromium');
    await page.setViewportSize({ width: 1440, height: 900 });

    // Click the list view toggle
    const listViewBtn = page.getByLabel('List view');
    if (await listViewBtn.isVisible()) {
      await listViewBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'e2e/screenshots/review/list-view.png', fullPage: true });
    }
  });

  test('search active', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Screenshots only needed in Chromium');
    await page.setViewportSize({ width: 1440, height: 900 });

    const searchInput = page.getByRole('searchbox', { name: /search by title/i });
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'e2e/screenshots/review/search-active.png' });
    }
  });

  test('filter active state', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Screenshots only needed in Chromium');
    await page.setViewportSize({ width: 1440, height: 900 });

    // Click PDF filter if available
    const pdfFilter = page.getByRole('button', { name: 'PDF' }).first();
    if (await pdfFilter.isVisible()) {
      await pdfFilter.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'e2e/screenshots/review/filter-active.png' });
    }
  });

  test('performance metrics', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Performance API only reliable in Chromium');
    await page.setViewportSize({ width: 1440, height: 900 });

    // Collect performance metrics
    const metrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const nav = entries[0];
      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');

      // Count DOM elements
      const totalElements = document.querySelectorAll('*').length;

      // Check for layout thrashing indicators
      const allCards = document.querySelectorAll('.library-card');
      const allImages = document.querySelectorAll('img');
      const imagesWithoutDimensions = Array.from(allImages).filter(img => {
        const style = window.getComputedStyle(img);
        return !img.width && !img.height && style.width === 'auto' && style.height === 'auto';
      });

      // Check for excessive box-shadows
      const elementsWithBoxShadow = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.boxShadow && style.boxShadow !== 'none';
      });

      // Check for forced reflows - elements with will-change
      const elementsWithWillChange = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.willChange && style.willChange !== 'auto';
      });

      // Check active animations
      const animations = document.getAnimations();

      // Check font loading
      const fonts = (document as any).fonts;
      const fontStatus = fonts ? fonts.status : 'unknown';

      return {
        domContentLoaded: nav?.domContentLoadedEventEnd - nav?.startTime,
        load: nav?.loadEventEnd - nav?.startTime,
        fcp: fcp?.startTime,
        totalDomElements: totalElements,
        totalCards: allCards.length,
        imagesWithoutDimensions: imagesWithoutDimensions.length,
        elementsWithBoxShadow: elementsWithBoxShadow.length,
        elementsWithWillChange: elementsWithWillChange.length,
        activeAnimations: animations.length,
        fontStatus,
      };
    });

    console.log('\n=== PERFORMANCE METRICS ===');
    console.log(JSON.stringify(metrics, null, 2));
    console.log('===========================\n');

    // Assert reasonable performance
    if (metrics.fcp) {
      expect(metrics.fcp).toBeLessThan(3000); // FCP under 3s
    }
    expect(metrics.totalDomElements).toBeLessThan(5000); // Reasonable DOM size
  });

  test('accessibility audit', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Audit only needed in Chromium');
    await page.setViewportSize({ width: 1440, height: 900 });

    const issues = await page.evaluate(() => {
      const problems: string[] = [];

      // Check for buttons without accessible labels
      const buttons = document.querySelectorAll('button');
      buttons.forEach((btn, i) => {
        const label = btn.getAttribute('aria-label') || btn.textContent?.trim();
        if (!label) {
          problems.push(`Button #${i} has no accessible label`);
        }
      });

      // Check for images without alt text
      const images = document.querySelectorAll('img');
      images.forEach((img, i) => {
        if (!img.alt && !img.getAttribute('aria-hidden')) {
          problems.push(`Image #${i} (${img.src.substring(0, 50)}) has no alt text`);
        }
      });

      // Check for links without accessible text
      const links = document.querySelectorAll('a');
      links.forEach((link, i) => {
        const label = link.getAttribute('aria-label') || link.textContent?.trim();
        if (!label) {
          problems.push(`Link #${i} has no accessible text`);
        }
      });

      // Check for input elements without labels
      const inputs = document.querySelectorAll('input, select, textarea');
      inputs.forEach((input, i) => {
        const label = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || input.id;
        if (!label) {
          problems.push(`Input #${i} has no label`);
        }
      });

      // Check for color contrast issues (basic check)
      const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button, label');
      let lowContrastCount = 0;
      textElements.forEach(el => {
        const style = window.getComputedStyle(el);
        const color = style.color;
        const bg = style.backgroundColor;
        if (color === bg && color !== 'rgba(0, 0, 0, 0)') {
          lowContrastCount++;
        }
      });
      if (lowContrastCount > 0) {
        problems.push(`${lowContrastCount} elements may have low contrast (same fg/bg color)`);
      }

      // Check touch target sizes
      const interactiveElements = document.querySelectorAll('button, a, input, select, [role="button"]');
      let smallTouchTargets = 0;
      interactiveElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          // Only flag if it's visible
          if (rect.width > 1 && rect.height > 1) {
            smallTouchTargets++;
          }
        }
      });
      if (smallTouchTargets > 0) {
        problems.push(`${smallTouchTargets} interactive elements have touch targets smaller than 44x44px`);
      }

      return problems;
    });

    console.log('\n=== ACCESSIBILITY AUDIT ===');
    if (issues.length === 0) {
      console.log('No issues found!');
    } else {
      issues.forEach(issue => console.log(`- ${issue}`));
    }
    console.log('===========================\n');
  });

  test('CSS performance audit', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Audit only needed in Chromium');
    await page.setViewportSize({ width: 1440, height: 900 });

    const cssIssues = await page.evaluate(() => {
      const issues: string[] = [];

      // Check for excessive transition properties
      const allElements = document.querySelectorAll('*');
      let transitionAllCount = 0;
      let expensiveTransitionCount = 0;

      allElements.forEach(el => {
        const style = window.getComputedStyle(el);
        const transition = style.transition;
        if (transition && transition.includes('all')) {
          transitionAllCount++;
        }
        // Check for expensive properties being transitioned
        if (transition && (transition.includes('width') || transition.includes('height') || transition.includes('top') || transition.includes('left'))) {
          expensiveTransitionCount++;
        }
      });

      if (transitionAllCount > 5) {
        issues.push(`${transitionAllCount} elements use "transition: all" which forces recalc on every prop change`);
      }
      if (expensiveTransitionCount > 10) {
        issues.push(`${expensiveTransitionCount} elements transition layout properties (width/height/top/left) which cause reflow`);
      }

      // Check for deeply nested elements
      let maxDepth = 0;
      function getDepth(el: Element, depth: number) {
        if (depth > maxDepth) maxDepth = depth;
        for (const child of el.children) {
          getDepth(child, depth + 1);
        }
      }
      getDepth(document.body, 0);
      if (maxDepth > 20) {
        issues.push(`DOM nesting depth of ${maxDepth} is excessive (>20 levels)`);
      }

      // Check for large number of event listeners (basic proxy via inline handlers)
      const inlineHandlers = document.querySelectorAll('[onclick], [onmouseover], [onmouseout], [onchange]');
      if (inlineHandlers.length > 0) {
        issues.push(`${inlineHandlers.length} elements use inline event handlers instead of addEventListener`);
      }

      // Check total stylesheet rules
      let totalRules = 0;
      for (const sheet of document.styleSheets) {
        try {
          totalRules += sheet.cssRules?.length ?? 0;
        } catch {
          // Cross-origin stylesheet
        }
      }
      issues.push(`Total CSS rules: ${totalRules}`);

      return issues;
    });

    console.log('\n=== CSS PERFORMANCE AUDIT ===');
    cssIssues.forEach(issue => console.log(`- ${issue}`));
    console.log('==============================\n');
  });

  test('visual consistency check', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Audit only needed in Chromium');
    await page.setViewportSize({ width: 1440, height: 900 });

    const consistencyIssues = await page.evaluate(() => {
      const issues: string[] = [];

      // Check card heights for consistency
      const cards = document.querySelectorAll('.library-card');
      if (cards.length > 1) {
        const heights = Array.from(cards).map(c => c.getBoundingClientRect().height);
        const uniqueHeights = new Set(heights.map(h => Math.round(h)));
        if (uniqueHeights.size > 3) {
          issues.push(`Cards have ${uniqueHeights.size} different heights: ${Array.from(uniqueHeights).join(', ')}px - inconsistent card sizing`);
        }
      }

      // Check for overflow issues
      const bodyWidth = document.body.clientWidth;
      const scrollWidth = document.body.scrollWidth;
      if (scrollWidth > bodyWidth + 5) {
        issues.push(`Horizontal overflow detected: body is ${bodyWidth}px but content is ${scrollWidth}px`);
      }

      // Check spacing consistency in the filter row
      const filterBtns = document.querySelectorAll('.filter-btn-group');
      if (filterBtns.length > 0) {
        const gaps = Array.from(filterBtns).map(g => {
          const style = window.getComputedStyle(g);
          return style.gap;
        });
        const uniqueGaps = new Set(gaps);
        if (uniqueGaps.size > 1) {
          issues.push(`Filter groups have inconsistent gap values: ${Array.from(uniqueGaps).join(', ')}`);
        }
      }

      // Check font consistency
      const fontFamilies = new Set<string>();
      const textElements = document.querySelectorAll('h1, h2, h3, p, span, a, button, label');
      textElements.forEach(el => {
        const style = window.getComputedStyle(el);
        fontFamilies.add(style.fontFamily.split(',')[0].trim().replace(/['"]/g, ''));
      });
      issues.push(`Font families in use: ${Array.from(fontFamilies).join(', ')}`);

      // Check z-index usage
      const zIndices = new Map<string, number>();
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        const z = parseInt(style.zIndex);
        if (!isNaN(z) && z !== 0) {
          const tag = el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : '');
          zIndices.set(tag, z);
        }
      });
      if (zIndices.size > 0) {
        const sorted = Array.from(zIndices.entries()).sort((a, b) => a[1] - b[1]);
        issues.push(`z-index values in use: ${sorted.map(([tag, z]) => `${tag}:${z}`).join(', ')}`);
      }

      return issues;
    });

    console.log('\n=== VISUAL CONSISTENCY CHECK ===');
    consistencyIssues.forEach(issue => console.log(`- ${issue}`));
    console.log('================================\n');
  });
});
