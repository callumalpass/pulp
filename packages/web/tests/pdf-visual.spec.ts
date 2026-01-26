import { test, expect } from '@playwright/test';

test.describe('PDF Visual Issues', () => {
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

  test('check canvas vs container size mismatch', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(2000);

    const mismatches = await page.evaluate(() => {
      const containers = document.querySelectorAll('.pdf-page-container');
      const issues: string[] = [];

      containers.forEach((container, idx) => {
        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        const containerRect = container.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();

        // Check if canvas size matches container
        const widthDiff = Math.abs(containerRect.width - canvasRect.width);
        const heightDiff = Math.abs(containerRect.height - canvasRect.height);

        if (widthDiff > 2 || heightDiff > 2) {
          issues.push(
            `Page ${idx + 1}: Container ${containerRect.width.toFixed(0)}x${containerRect.height.toFixed(0)} vs Canvas ${canvasRect.width.toFixed(0)}x${canvasRect.height.toFixed(0)}`
          );
        }

        // Check canvas internal vs display size
        const scaleX = canvas.width / canvasRect.width;
        const scaleY = canvas.height / canvasRect.height;

        if (Math.abs(scaleX - scaleY) > 0.1) {
          issues.push(`Page ${idx + 1}: Aspect ratio mismatch - scaleX: ${scaleX.toFixed(2)}, scaleY: ${scaleY.toFixed(2)}`);
        }
      });

      return issues;
    });

    console.log('\n=== Canvas/Container Size Check ===');
    if (mismatches.length === 0) {
      console.log('No size mismatches found');
    } else {
      console.log(`Found ${mismatches.length} mismatches:`);
      mismatches.slice(0, 10).forEach((m) => console.log(`  ${m}`));
    }
  });

  test('check for rendering during scroll', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Track what's happening during scroll
    const scrollData = await page.evaluate(async () => {
      const container = document.querySelector('.overflow-auto');
      if (!container) return { error: 'No scroll container' };

      const data: {
        visiblePages: number[];
        renderedPages: number[];
        blankPages: number[];
      }[] = [];

      for (let i = 0; i < 10; i++) {
        container.scrollBy({ top: 500, behavior: 'auto' });
        await new Promise((r) => setTimeout(r, 200));

        // Check current state
        const pageContainers = document.querySelectorAll('.pdf-page-container');
        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;

        const visiblePages: number[] = [];
        const renderedPages: number[] = [];
        const blankPages: number[] = [];

        pageContainers.forEach((pc, idx) => {
          const rect = pc.getBoundingClientRect();
          const containerTop = container.getBoundingClientRect().top;
          const relativeTop = rect.top - containerTop;

          // Check if visible
          if (relativeTop < viewportHeight && relativeTop + rect.height > 0) {
            visiblePages.push(idx + 1);

            // Check if canvas has content
            const canvas = pc.querySelector('canvas') as HTMLCanvasElement;
            if (canvas && canvas.width > 0) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                const imageData = ctx.getImageData(10, 10, 1, 1);
                if (imageData.data[3] > 0) {
                  renderedPages.push(idx + 1);
                } else {
                  blankPages.push(idx + 1);
                }
              }
            } else {
              blankPages.push(idx + 1);
            }
          }
        });

        data.push({ visiblePages, renderedPages, blankPages });
      }

      return data;
    });

    console.log('\n=== Scroll Rendering Analysis ===');
    if ('error' in scrollData) {
      console.log(scrollData.error);
    } else {
      scrollData.forEach((frame, idx) => {
        if (frame.blankPages.length > 0) {
          console.log(`Scroll ${idx + 1}: Visible [${frame.visiblePages.join(',')}], Blank [${frame.blankPages.join(',')}]`);
        }
      });

      const totalBlank = scrollData.reduce((sum, f) => sum + f.blankPages.length, 0);
      console.log(`Total blank page instances during scroll: ${totalBlank}`);
    }
  });

  test('measure actual render time per page', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });

    // Scroll to a new area to trigger fresh renders
    const scrollContainer = page.locator('.overflow-auto').first();
    await scrollContainer.evaluate((el) => {
      el.scrollTo({ top: el.scrollHeight / 2 });
    });

    // Measure time for pages to appear
    const renderTimes = await page.evaluate(async () => {
      const times: number[] = [];
      const container = document.querySelector('.overflow-auto');
      if (!container) return times;

      // Scroll and measure
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        container.scrollBy({ top: 800, behavior: 'auto' });

        // Wait for canvas to have content
        await new Promise<void>((resolve) => {
          const check = () => {
            const visible = document.querySelectorAll('.pdf-page-container');
            let allRendered = true;
            visible.forEach((pc) => {
              const rect = pc.getBoundingClientRect();
              if (rect.top < window.innerHeight && rect.bottom > 0) {
                const canvas = pc.querySelector('canvas') as HTMLCanvasElement;
                if (!canvas || canvas.width === 0) allRendered = false;
              }
            });
            if (allRendered) {
              times.push(performance.now() - start);
              resolve();
            } else {
              requestAnimationFrame(check);
            }
          };
          requestAnimationFrame(check);
        });
      }

      return times;
    });

    console.log('\n=== Per-Scroll Render Times ===');
    if (renderTimes.length > 0) {
      console.log(`Render times: ${renderTimes.map((t) => t.toFixed(0) + 'ms').join(', ')}`);
      console.log(`Average: ${(renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length).toFixed(0)}ms`);
    }
  });
});
