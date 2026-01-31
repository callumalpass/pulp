import { test, expect, Page } from '@playwright/test';

/**
 * Comprehensive UI/UX & Performance audit.
 * Runs against the real dev server with real library data.
 * Captures screenshots and metrics for identifying improvement areas.
 */

async function waitForLibrary(page: Page) {
  await page.waitForLoadState('networkidle');
  // Wait for at least one book card to appear (real data)
  await expect(page.locator('[data-testid="book-card"]').first()).toBeVisible({ timeout: 15000 });
}

// ──────────────────────────────────────────────
// 1. PERFORMANCE METRICS
// ──────────────────────────────────────────────

test.describe('Performance Audit', () => {
  test('Measure Core Web Vitals on initial load', async ({ page }) => {
    const metrics: Record<string, number> = {};

    const startTime = Date.now();
    await page.goto('/');
    await waitForLibrary(page);
    metrics.totalLoadTime = Date.now() - startTime;

    const perfMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const nav = entries[0];
      if (!nav) return null;
      return {
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        loadComplete: nav.loadEventEnd - nav.startTime,
        domInteractive: nav.domInteractive - nav.startTime,
        ttfb: nav.responseStart - nav.requestStart,
        transferSize: nav.transferSize,
      };
    });

    console.log('=== PERFORMANCE METRICS ===');
    console.log(`Total load time (to library visible): ${metrics.totalLoadTime}ms`);
    if (perfMetrics) {
      console.log(`DOM Content Loaded: ${perfMetrics.domContentLoaded.toFixed(0)}ms`);
      console.log(`DOM Interactive: ${perfMetrics.domInteractive.toFixed(0)}ms`);
      console.log(`Load Complete: ${perfMetrics.loadComplete.toFixed(0)}ms`);
      console.log(`TTFB: ${perfMetrics.ttfb.toFixed(0)}ms`);
      console.log(`Transfer Size: ${(perfMetrics.transferSize / 1024).toFixed(1)}KB`);
    }

    const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
    console.log(`DOM node count: ${domNodeCount}`);

    expect(metrics.totalLoadTime).toBeLessThan(15000);
  });

  test('Measure JS bundle sizes', async ({ page }) => {
    const resources: { url: string; size: number; type: string }[] = [];

    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (url.includes('.js') || url.includes('.css') || contentType.includes('javascript') || contentType.includes('css')) {
        const contentLength = response.headers()['content-length'];
        resources.push({
          url: url.split('/').pop() || url,
          size: contentLength ? parseInt(contentLength) : 0,
          type: contentType.includes('css') ? 'css' : 'js',
        });
      }
    });

    await page.goto('/');
    await waitForLibrary(page);

    console.log('\n=== RESOURCE SIZES ===');
    const jsResources = resources.filter(r => r.type === 'js');
    const cssResources = resources.filter(r => r.type === 'css');
    const totalJS = jsResources.reduce((sum, r) => sum + r.size, 0);
    const totalCSS = cssResources.reduce((sum, r) => sum + r.size, 0);

    console.log(`JS files: ${jsResources.length}, Total: ${(totalJS / 1024).toFixed(1)}KB`);
    jsResources.sort((a, b) => b.size - a.size);
    for (const r of jsResources.slice(0, 5)) {
      console.log(`  ${r.url}: ${(r.size / 1024).toFixed(1)}KB`);
    }

    console.log(`CSS files: ${cssResources.length}, Total: ${(totalCSS / 1024).toFixed(1)}KB`);
    for (const r of cssResources) {
      console.log(`  ${r.url}: ${(r.size / 1024).toFixed(1)}KB`);
    }
  });

  test('Check for layout shifts during page load', async ({ page }) => {
    await page.goto('/');

    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as any[]) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 5000);
      });
    });

    console.log(`\n=== LAYOUT STABILITY ===`);
    console.log(`Cumulative Layout Shift (CLS): ${cls.toFixed(4)}`);
    console.log(`CLS rating: ${cls < 0.1 ? 'GOOD' : cls < 0.25 ? 'NEEDS IMPROVEMENT' : 'POOR'}`);

    expect(cls).toBeLessThan(0.25);
  });

  test('Scroll performance - check for jank', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const scrollMetrics = await page.evaluate(async () => {
      const frameTimes: number[] = [];
      let lastTime = performance.now();

      return new Promise<{ avgFrameTime: number; maxFrameTime: number; jankyFrames: number }>((resolve) => {
        let frameCount = 0;
        const measure = () => {
          const now = performance.now();
          frameTimes.push(now - lastTime);
          lastTime = now;
          frameCount++;
          if (frameCount < 60) {
            requestAnimationFrame(measure);
          }
        };

        window.scrollBy({ top: 1000, behavior: 'smooth' });
        requestAnimationFrame(measure);

        setTimeout(() => {
          const valid = frameTimes.filter(t => t > 0 && t < 200);
          const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
          const max = valid.length ? Math.max(...valid) : 0;
          const janky = valid.filter(t => t > 33).length;

          resolve({
            avgFrameTime: avg,
            maxFrameTime: max,
            jankyFrames: janky,
          });
        }, 2000);
      });
    });

    console.log(`\n=== SCROLL PERFORMANCE ===`);
    console.log(`Average frame time: ${scrollMetrics.avgFrameTime.toFixed(1)}ms`);
    console.log(`Max frame time: ${scrollMetrics.maxFrameTime.toFixed(1)}ms`);
    console.log(`Janky frames (>33ms): ${scrollMetrics.jankyFrames}`);
  });
});

// ──────────────────────────────────────────────
// 2. VISUAL CONSISTENCY AUDIT
// ──────────────────────────────────────────────

test.describe('Visual Consistency Audit', () => {
  test('Card height consistency - all cards should be uniform height', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await page.waitForTimeout(500);

    const cardHeights = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="book-card"]');
      return Array.from(cards).slice(0, 12).map(card => {
        const rect = card.getBoundingClientRect();
        return { id: card.getAttribute('aria-label')?.substring(0, 40), height: Math.round(rect.height), width: Math.round(rect.width) };
      });
    });

    console.log('\n=== CARD HEIGHT CONSISTENCY ===');
    for (const card of cardHeights) {
      console.log(`  ${card.id}: ${card.height}px x ${card.width}px`);
    }

    if (cardHeights.length > 1) {
      const heights = cardHeights.map(c => c.height);
      const maxDiff = Math.max(...heights) - Math.min(...heights);
      console.log(`  Max height difference: ${maxDiff}px`);
      if (maxDiff > 20) {
        console.log(`  WARNING: Cards have inconsistent heights (diff: ${maxDiff}px)`);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/audit-card-consistency.png', fullPage: false });
  });

  test('Spacing audit - verify consistent spacing between sections', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await page.waitForTimeout(300);

    const spacing = await page.evaluate(() => {
      const sections = document.querySelectorAll('section');
      const results: { section: string; marginTop: string; marginBottom: string; paddingTop: string; paddingBottom: string }[] = [];
      sections.forEach(section => {
        const style = getComputedStyle(section);
        results.push({
          section: section.getAttribute('aria-label') || section.getAttribute('aria-labelledby') || 'unnamed',
          marginTop: style.marginTop,
          marginBottom: style.marginBottom,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
        });
      });
      return results;
    });

    console.log('\n=== SPACING AUDIT ===');
    for (const s of spacing) {
      console.log(`  ${s.section}: mt=${s.marginTop} mb=${s.marginBottom} pt=${s.paddingTop} pb=${s.paddingBottom}`);
    }
  });

  test('Typography hierarchy audit', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const typography = await page.evaluate(() => {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      return Array.from(headings).map(h => ({
        tag: h.tagName,
        text: h.textContent?.substring(0, 50),
        fontSize: getComputedStyle(h).fontSize,
        fontWeight: getComputedStyle(h).fontWeight,
        color: getComputedStyle(h).color,
        lineHeight: getComputedStyle(h).lineHeight,
      }));
    });

    console.log('\n=== TYPOGRAPHY HIERARCHY ===');
    for (const t of typography) {
      console.log(`  ${t.tag}: "${t.text}" - ${t.fontSize} / ${t.fontWeight} / lh:${t.lineHeight}`);
    }
  });

  test('Color contrast audit - text readability', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const contrastIssues = await page.evaluate(() => {
      function getLuminance(r: number, g: number, b: number): number {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function getContrastRatio(l1: number, l2: number): number {
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function parseColor(color: string): [number, number, number] | null {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        return null;
      }

      const issues: { element: string; text: string; fg: string; bg: string; ratio: number }[] = [];
      const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button, label');

      textElements.forEach(el => {
        const text = el.textContent?.trim().substring(0, 40);
        if (!text) return;

        const style = getComputedStyle(el);
        const fgColor = parseColor(style.color);
        let bgColor: [number, number, number] | null = null;

        let current: Element | null = el;
        while (current) {
          const bg = parseColor(getComputedStyle(current).backgroundColor);
          if (bg && (bg[0] !== 0 || bg[1] !== 0 || bg[2] !== 0 || getComputedStyle(current).backgroundColor !== 'rgba(0, 0, 0, 0)')) {
            bgColor = bg;
            break;
          }
          current = current.parentElement;
        }

        if (fgColor && bgColor) {
          const fgLum = getLuminance(...fgColor);
          const bgLum = getLuminance(...bgColor);
          const ratio = getContrastRatio(fgLum, bgLum);

          const fontSize = parseFloat(style.fontSize);
          const isBold = parseInt(style.fontWeight) >= 700;
          const isLargeText = fontSize >= 18 || (fontSize >= 14 && isBold);
          const minRatio = isLargeText ? 3 : 4.5;

          if (ratio < minRatio) {
            issues.push({
              element: el.tagName.toLowerCase(),
              text,
              fg: style.color,
              bg: getComputedStyle(el.parentElement || el).backgroundColor,
              ratio: Math.round(ratio * 100) / 100,
            });
          }
        }
      });

      return issues;
    });

    console.log('\n=== COLOR CONTRAST AUDIT (Dark Theme) ===');
    if (contrastIssues.length === 0) {
      console.log('  All text passes WCAG AA contrast requirements');
    } else {
      console.log(`  Found ${contrastIssues.length} potential contrast issues:`);
      for (const issue of contrastIssues.slice(0, 15)) {
        console.log(`  ${issue.element} "${issue.text}" - ratio: ${issue.ratio}:1 (fg: ${issue.fg}, bg: ${issue.bg})`);
      }
    }
  });

  test('Light theme visual audit', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    // Switch to light theme
    await page.locator('[data-testid="theme-toggle"]').click();
    await page.waitForTimeout(500);

    const lightThemeIssues = await page.evaluate(() => {
      const issues: string[] = [];

      const textElements = document.querySelectorAll('p, span, h1, h2, h3, button');
      textElements.forEach(el => {
        const color = getComputedStyle(el).color;
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
          const [r, g, b] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          if (r > 200 && g > 200 && b > 200) {
            issues.push(`Light text on light bg: ${el.tagName} "${el.textContent?.substring(0, 30)}": ${color}`);
          }
        }
      });

      const borderedElements = document.querySelectorAll('.filter-btn-group, input[type="search"], .library-card');
      borderedElements.forEach(el => {
        const borderColor = getComputedStyle(el).borderColor;
        if (borderColor === 'rgba(0, 0, 0, 0)' || borderColor === 'transparent') {
          issues.push(`Invisible border: ${el.className.substring(0, 30)}`);
        }
      });

      return issues;
    });

    console.log('\n=== LIGHT THEME AUDIT ===');
    if (lightThemeIssues.length === 0) {
      console.log('  No issues found in light theme');
    } else {
      for (const issue of lightThemeIssues) {
        console.log(`  ${issue}`);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/audit-light-theme-full.png', fullPage: true });

    // Switch back
    await page.locator('[data-testid="theme-toggle"]').click();
  });

  test('Full page screenshots for visual review', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'e2e/screenshots/audit-desktop-dark-full.png', fullPage: true });
  });
});

// ──────────────────────────────────────────────
// 3. INTERACTION QUALITY AUDIT
// ──────────────────────────────────────────────

test.describe('Interaction Quality Audit', () => {
  test('Button feedback - verify all buttons have hover/active states', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const buttons = page.locator('button:visible');
    const buttonCount = await buttons.count();

    console.log('\n=== BUTTON INTERACTION AUDIT ===');
    console.log(`Total visible buttons: ${buttonCount}`);

    const interactionIssues: string[] = [];

    for (let i = 0; i < Math.min(buttonCount, 15); i++) {
      const btn = buttons.nth(i);
      const label = await btn.getAttribute('aria-label') || await btn.textContent() || `button-${i}`;

      const cursor = await btn.evaluate(el => getComputedStyle(el).cursor);
      if (cursor !== 'pointer') {
        interactionIssues.push(`${label.trim().substring(0, 30)}: cursor is "${cursor}" instead of "pointer"`);
      }

      const hasTransition = await btn.evaluate(el => {
        const style = getComputedStyle(el);
        return style.transition !== 'none' && style.transition !== '' && style.transition !== 'all 0s ease 0s';
      });
      if (!hasTransition) {
        console.log(`  "${label.trim().substring(0, 30)}": no transition defined`);
      }
    }

    if (interactionIssues.length > 0) {
      console.log('  Cursor issues:');
      for (const issue of interactionIssues) {
        console.log(`  - ${issue}`);
      }
    } else {
      console.log('  All buttons have pointer cursor');
    }
  });

  test('Focus order - verify logical tab order', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const focusOrder: string[] = [];

    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return 'none';
        const tag = el.tagName.toLowerCase();
        const label = el.getAttribute('aria-label') || el.textContent?.substring(0, 30) || '';
        return `${tag}: ${label.trim()}`;
      });
      focusOrder.push(focused);
    }

    console.log('\n=== FOCUS ORDER (first 20 elements) ===');
    focusOrder.forEach((el, i) => {
      console.log(`  ${i + 1}. ${el}`);
    });

    const hasFocusTrap = focusOrder.every(el => el === focusOrder[0]);
    if (hasFocusTrap && focusOrder.length > 3) {
      console.log('  WARNING: Focus appears to be trapped on a single element');
    }
  });

  test('Hover card actions - verify reveal/hide behavior', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const firstCard = page.locator('[data-testid="book-card"]').first();

    // Hover over card
    await firstCard.hover();
    await page.waitForTimeout(300);

    const pinBtn = firstCard.locator('button[aria-label="Unpin"], button[aria-label="Pin"]').first();
    const infoBtn = firstCard.locator('button[aria-label="Show metadata"]');

    const pinVisible = await pinBtn.isVisible();
    const infoVisible = await infoBtn.isVisible();

    console.log('\n=== HOVER CARD ACTIONS ===');
    console.log(`  Pin button on hover: ${pinVisible ? 'visible' : 'hidden'}`);
    console.log(`  Info button on hover: ${infoVisible ? 'visible' : 'hidden'}`);

    await page.screenshot({ path: 'e2e/screenshots/audit-hover-actions.png' });

    // Move away
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
  });

  test('Search UX flow - measure responsiveness', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const searchInput = page.locator('input[type="search"]');

    // Test keyboard shortcut
    await page.keyboard.press('/');
    const focusedAfterSlash = await page.evaluate(() =>
      document.activeElement?.getAttribute('type') === 'search'
    );
    console.log('\n=== SEARCH UX ===');
    console.log(`  "/" shortcut focuses search: ${focusedAfterSlash}`);

    // Type and measure filter responsiveness
    const startType = Date.now();
    await searchInput.fill('test');
    await page.waitForTimeout(500);
    const filterTime = Date.now() - startType;
    console.log(`  Filter response time: ${filterTime}ms`);

    const clearBtn = page.locator('button[aria-label="Clear search"]');
    const hasClearBtn = await clearBtn.isVisible();
    console.log(`  Clear button visible: ${hasClearBtn}`);

    // Escape should blur search
    await page.keyboard.press('Escape');
    const blurredAfterEscape = await page.evaluate(() =>
      document.activeElement?.getAttribute('type') !== 'search'
    );
    console.log(`  Escape blurs search: ${blurredAfterEscape}`);
  });
});

// ──────────────────────────────────────────────
// 4. MOBILE UX AUDIT
// ──────────────────────────────────────────────

test.describe('Mobile UX Audit', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('Touch target sizes - comprehensive check', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const touchTargets = await page.evaluate(() => {
      const interactive = document.querySelectorAll('button, a, input, select, [role="button"]');
      const issues: { element: string; width: number; height: number; text: string }[] = [];
      const ok: { element: string; width: number; height: number; text: string }[] = [];

      interactive.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const text = el.getAttribute('aria-label') || el.textContent?.substring(0, 30) || '';
        const data = {
          element: el.tagName.toLowerCase(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          text: text.trim(),
        };

        if (rect.width < 44 || rect.height < 44) {
          issues.push(data);
        } else {
          ok.push(data);
        }
      });

      return { issues, ok };
    });

    console.log('\n=== TOUCH TARGET AUDIT (375px viewport) ===');
    console.log(`  Passing: ${touchTargets.ok.length} elements meet 44px minimum`);
    if (touchTargets.issues.length > 0) {
      console.log(`  ISSUES: ${touchTargets.issues.length} elements below 44px minimum:`);
      for (const issue of touchTargets.issues) {
        console.log(`    ${issue.element} "${issue.text}": ${issue.width}x${issue.height}px`);
      }
    }
  });

  test('Mobile layout - no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await page.waitForTimeout(300);

    const overflowCheck = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const viewportWidth = window.innerWidth;
      const hasOverflow = docWidth > viewportWidth;

      const overflowing: string[] = [];
      if (hasOverflow) {
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > viewportWidth + 2) {
            overflowing.push(`${el.tagName}.${el.className.toString().split(' ')[0]}: right=${Math.round(rect.right)}px`);
          }
        });
      }

      return {
        docWidth,
        viewportWidth,
        hasOverflow,
        overflowing: overflowing.slice(0, 5),
      };
    });

    console.log('\n=== MOBILE OVERFLOW CHECK ===');
    console.log(`  Document width: ${overflowCheck.docWidth}px vs viewport: ${overflowCheck.viewportWidth}px`);
    console.log(`  Has horizontal overflow: ${overflowCheck.hasOverflow}`);
    if (overflowCheck.overflowing.length > 0) {
      console.log('  Overflowing elements:');
      for (const el of overflowCheck.overflowing) {
        console.log(`    ${el}`);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/audit-mobile-layout.png', fullPage: true });
  });

  test('Mobile grid - verify 2-column layout', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const gridInfo = await page.evaluate(() => {
      const grid = document.querySelector('.library-grid-optimized, [role="list"]');
      if (!grid) return null;
      const style = getComputedStyle(grid);
      const cols = style.gridTemplateColumns.split(' ').length;
      const gap = style.gap;
      const cards = grid.querySelectorAll('[role="listitem"]');
      const cardWidths = Array.from(cards).slice(0, 4).map(c =>
        Math.round(c.getBoundingClientRect().width)
      );
      return { cols, gap, cardWidths };
    });

    console.log('\n=== MOBILE GRID LAYOUT ===');
    if (gridInfo) {
      console.log(`  Columns: ${gridInfo.cols}`);
      console.log(`  Gap: ${gridInfo.gap}`);
      console.log(`  Card widths: ${gridInfo.cardWidths.join(', ')}px`);
    }

    expect(gridInfo?.cols).toBe(2);
  });

  test('Mobile filter sheet - usability check', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const filtersBtn = page.getByRole('button', { name: /Filters/i });
    await expect(filtersBtn).toBeVisible();

    const filterBtnBox = await filtersBtn.boundingBox();
    console.log('\n=== MOBILE FILTERS ===');
    console.log(`  Filter button size: ${filterBtnBox?.width}x${filterBtnBox?.height}px`);

    await filtersBtn.click();
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'e2e/screenshots/audit-mobile-filters.png', fullPage: false });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('Mobile screenshots for review', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'e2e/screenshots/audit-mobile-dark.png', fullPage: true });

    await page.locator('[data-testid="theme-toggle"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit-mobile-light.png', fullPage: true });

    await page.locator('[data-testid="theme-toggle"]').click();
  });
});

// ──────────────────────────────────────────────
// 5. ACCESSIBILITY DEEP AUDIT
// ──────────────────────────────────────────────

test.describe('Accessibility Deep Audit', () => {
  test('ARIA attributes completeness', async ({ page }) => {
    await page.goto('/');
    await waitForLibrary(page);

    const ariaAudit = await page.evaluate(() => {
      const issues: string[] = [];

      document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent?.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        const ariaLabelledBy = btn.getAttribute('aria-labelledby');
        if (!text && !ariaLabel && !ariaLabelledBy) {
          issues.push(`Button without label: ${btn.className.substring(0, 50)}`);
        }
      });

      document.querySelectorAll('img').forEach(img => {
        if (!img.getAttribute('alt') && !img.getAttribute('role')) {
          issues.push(`Image without alt: ${img.src.substring(0, 50)}`);
        }
      });

      document.querySelectorAll('input, select, textarea').forEach(input => {
        const id = input.getAttribute('id');
        const ariaLabel = input.getAttribute('aria-label');
        const ariaLabelledBy = input.getAttribute('aria-labelledby');
        const hasLabel = id && document.querySelector(`label[for="${id}"]`);
        if (!ariaLabel && !ariaLabelledBy && !hasLabel) {
          issues.push(`Input without label: ${input.tagName} type=${input.getAttribute('type')}`);
        }
      });

      const landmarks = {
        header: document.querySelector('header[role="banner"]') !== null,
        main: document.querySelector('main, [role="main"]') !== null,
        search: document.querySelector('[role="search"]') !== null,
        nav: document.querySelector('nav, [role="navigation"]') !== null,
      };

      return { issues, landmarks };
    });

    console.log('\n=== ARIA AUDIT ===');
    console.log('  Landmarks:');
    for (const [name, present] of Object.entries(ariaAudit.landmarks)) {
      console.log(`    ${name}: ${present ? 'present' : 'MISSING'}`);
    }

    if (ariaAudit.issues.length === 0) {
      console.log('  No ARIA issues found');
    } else {
      console.log(`  Issues (${ariaAudit.issues.length}):`);
      for (const issue of ariaAudit.issues) {
        console.log(`    - ${issue}`);
      }
    }
  });

  test('Reduced motion - verify animations are disabled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await waitForLibrary(page);

    const animationCheck = await page.evaluate(() => {
      const animatedElements = document.querySelectorAll('.card-enter, .animate-float, .animate-pulse-glow, .play-button-pulse');
      const issues: string[] = [];

      animatedElements.forEach(el => {
        const style = getComputedStyle(el);
        const duration = parseFloat(style.animationDuration);
        if (duration > 0.02) {
          issues.push(`${el.className.split(' ')[0]}: animation-duration=${style.animationDuration}`);
        }
      });

      return issues;
    });

    console.log('\n=== REDUCED MOTION AUDIT ===');
    if (animationCheck.length === 0) {
      console.log('  All animations properly disabled with prefers-reduced-motion');
    } else {
      console.log(`  ISSUES: ${animationCheck.length} elements still animating:`);
      for (const issue of animationCheck) {
        console.log(`    ${issue}`);
      }
    }
  });
});
