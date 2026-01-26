import { test, expect } from '@playwright/test';

// Mobile viewport sizes
const mobileViewports = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'Pixel 7', width: 412, height: 915 },
];

test.describe('Mobile Layout', () => {
  let pdfId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const firstPdfLink = await page.locator('a[href^="/read/"]').first();
    if (await firstPdfLink.count() > 0) {
      const href = await firstPdfLink.getAttribute('href');
      pdfId = href?.replace('/read/', '') || null;
    }
    await page.close();
  });

  for (const viewport of mobileViewports) {
    test(`PDF layout on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ browser }) => {
      test.skip(!pdfId, 'No PDFs in library');

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();

      await page.goto(`/read/${pdfId}`);
      await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
      // Wait for PDF rendering to complete
      await page.waitForTimeout(3000);

      // Take a screenshot
      await page.screenshot({
        path: `tests/screenshots/mobile-pdf-${viewport.name.replace(/\s/g, '-')}.png`,
        fullPage: false
      });

      // Check for layout issues
      const layoutInfo = await page.evaluate(() => {
        const issues: string[] = [];
        const pageDetails: { page: number; width: number; left: number; right: number; centered: boolean }[] = [];
        const scrollContainer = document.querySelector('.overflow-auto');
        const pageContainers = document.querySelectorAll('.pdf-page-container');

        if (!scrollContainer) {
          return { issues: ['No scroll container found'], pageDetails };
        }

        const scrollRect = scrollContainer.getBoundingClientRect();

        pageContainers.forEach((container, idx) => {
          const rect = container.getBoundingClientRect();
          const canvas = container.querySelector('canvas');

          // Check if visible in viewport
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            const leftSpace = rect.left - scrollRect.left;
            const rightSpace = scrollRect.right - rect.right;
            const centerOffset = Math.abs(leftSpace - rightSpace);
            const isCentered = centerOffset < 5;

            pageDetails.push({
              page: idx + 1,
              width: Math.round(rect.width),
              left: Math.round(leftSpace),
              right: Math.round(rightSpace),
              centered: isCentered,
            });

            // Only report as issue if page is not centered AND the offset is significant
            if (!isCentered && centerOffset > 10) {
              issues.push(`Page ${idx + 1}: Not centered (left: ${leftSpace.toFixed(0)}px, right: ${rightSpace.toFixed(0)}px, offset: ${centerOffset.toFixed(0)}px)`);
            }

            // Check canvas display sizing (ignore internal pixel resolution)
            if (canvas) {
              const canvasRect = canvas.getBoundingClientRect();
              // Only report if canvas display width significantly differs from container
              // and the canvas has been styled (width > 0)
              if (canvasRect.width > 0 && Math.abs(canvasRect.width - rect.width) > 20) {
                issues.push(`Page ${idx + 1}: Canvas display width (${canvasRect.width.toFixed(0)}px) doesn't match container (${rect.width.toFixed(0)}px)`);
              }
            }

            // Check if page width exceeds viewport (horizontal scroll)
            if (rect.width > scrollRect.width) {
              issues.push(`Page ${idx + 1}: Width (${rect.width.toFixed(0)}px) exceeds viewport (${scrollRect.width.toFixed(0)}px)`);
            }
          }
        });

        return { issues, pageDetails };
      });

      const { issues: layoutIssues, pageDetails } = layoutInfo;

      console.log(`\n=== ${viewport.name} Layout Check ===`);
      if (pageDetails.length > 0) {
        console.log('Visible pages:');
        pageDetails.forEach((p) => {
          console.log(`  Page ${p.page}: ${p.width}px wide, left=${p.left}px, right=${p.right}px ${p.centered ? '(centered)' : '(NOT centered)'}`);
        });
      }
      if (layoutIssues.length === 0) {
        console.log('No layout issues found');
      } else {
        console.log(`Found ${layoutIssues.length} issues:`);
        layoutIssues.forEach((issue) => console.log(`  - ${issue}`));
      }

      // Log page dimensions
      const dimensions = await page.evaluate(() => {
        const scrollContainer = document.querySelector('.overflow-auto');
        const firstPage = document.querySelector('.pdf-page-container');
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          scrollContainer: scrollContainer ? {
            width: scrollContainer.clientWidth,
            scrollWidth: scrollContainer.scrollWidth,
          } : null,
          firstPage: firstPage ? {
            width: firstPage.getBoundingClientRect().width,
            left: firstPage.getBoundingClientRect().left,
          } : null,
        };
      });
      console.log('Dimensions:', JSON.stringify(dimensions, null, 2));

      expect(layoutIssues.length).toBe(0);

      await context.close();
    });
  }

  test('Mobile toolbar renders correctly', async ({ browser }) => {
    test.skip(!pdfId, 'No PDFs in library');

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });

    // Check mobile toolbar elements
    const hasBackButton = await page.locator('a[href="/"]').first().isVisible();
    const hasMoreButton = await page.locator('button svg[viewBox="0 0 24 24"]').last().isVisible();

    console.log('\n=== Mobile Toolbar Check ===');
    console.log(`Back button visible: ${hasBackButton}`);
    console.log(`More button visible: ${hasMoreButton}`);

    // Take toolbar screenshot
    await page.screenshot({
      path: 'tests/screenshots/mobile-toolbar.png',
      fullPage: false
    });

    expect(hasBackButton).toBe(true);

    await context.close();
  });

  test('Mobile menu opens and closes', async ({ browser }) => {
    test.skip(!pdfId, 'No PDFs in library');

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Take a before screenshot to see the toolbar
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-before.png',
      fullPage: false
    });

    // Debug: list all clickable elements in the toolbar area
    const allButtons = await page.locator('button').all();
    console.log(`Found ${allButtons.length} total buttons on page`);

    // Find the more button by its unique SVG (three circles)
    // The more button has circles at cy="12", cy="5", cy="19"
    const moreButton = page.locator('button:has(svg circle[cy="5"])').first();
    const exists = await moreButton.count() > 0;
    console.log(`More button with circles found: ${exists}`);

    if (exists) {
      await moreButton.click();
    } else {
      // Fallback: click by position in the toolbar (top right area)
      console.log('Clicking by position at x=360, y=40');
      await page.mouse.click(360, 40);
    }

    // Wait for animation
    await page.waitForTimeout(500);

    // Take after screenshot
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-after-click.png',
      fullPage: false
    });

    // Check if bottom sheet is visible
    const bottomSheet = page.locator('.mobile-bottom-sheet');
    const isVisible = await bottomSheet.isVisible();

    console.log('\n=== Mobile Menu Check ===');
    console.log(`Bottom sheet visible: ${isVisible}`);

    if (isVisible) {
      await page.screenshot({
        path: 'tests/screenshots/mobile-menu-open.png',
        fullPage: false
      });

      // Close by clicking backdrop
      await page.locator('.mobile-bottom-sheet-backdrop').click();
      await page.waitForTimeout(300);

      const isHidden = !(await bottomSheet.isVisible());
      console.log(`Bottom sheet closed: ${isHidden}`);
      expect(isHidden).toBe(true);
    }

    expect(isVisible).toBe(true);

    await context.close();
  });
});
