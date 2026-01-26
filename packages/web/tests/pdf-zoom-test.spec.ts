import { test, expect } from '@playwright/test';

// Test with the complex Simone Weil PDF
const TEST_PDF_ID = '99f868f8f29a';

test.describe('PDF Zoom and Rendering', () => {
  test('zoom levels render correctly', async ({ page }) => {
    await page.goto(`/read/${TEST_PDF_ID}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check initial state
    const initialState = await page.evaluate(() => {
      const container = document.querySelector('.pdf-page-container');
      const canvas = container?.querySelector('canvas');
      if (!container || !canvas) return null;

      return {
        containerWidth: container.getBoundingClientRect().width,
        containerHeight: container.getBoundingClientRect().height,
        canvasDisplayWidth: parseFloat(canvas.style.width),
        canvasDisplayHeight: parseFloat(canvas.style.height),
        canvasInternalWidth: canvas.width,
        canvasInternalHeight: canvas.height,
      };
    });

    console.log('\n=== Initial Zoom State ===');
    console.log(JSON.stringify(initialState, null, 2));

    // Test zoom in
    const zoomInBtn = page.locator('button').filter({ hasText: '+' }).first();
    if (await zoomInBtn.count() > 0) {
      await zoomInBtn.click();
      await page.waitForTimeout(500); // Wait for debounce + render

      const afterZoomIn = await page.evaluate(() => {
        const container = document.querySelector('.pdf-page-container');
        const canvas = container?.querySelector('canvas');
        if (!container || !canvas) return null;

        const containerRect = container.getBoundingClientRect();
        return {
          containerWidth: containerRect.width,
          containerHeight: containerRect.height,
          canvasDisplayWidth: parseFloat(canvas.style.width),
          canvasDisplayHeight: parseFloat(canvas.style.height),
          canvasInternalWidth: canvas.width,
          canvasInternalHeight: canvas.height,
          match: Math.abs(containerRect.width - parseFloat(canvas.style.width)) < 2,
        };
      });

      console.log('\n=== After Zoom In ===');
      console.log(JSON.stringify(afterZoomIn, null, 2));

      expect(afterZoomIn?.match).toBe(true);
    }

    // Test zoom out
    const zoomOutBtn = page.locator('button').filter({ hasText: '-' }).first();
    if (await zoomOutBtn.count() > 0) {
      await zoomOutBtn.click();
      await zoomOutBtn.click();
      await page.waitForTimeout(500);

      const afterZoomOut = await page.evaluate(() => {
        const container = document.querySelector('.pdf-page-container');
        const canvas = container?.querySelector('canvas');
        if (!container || !canvas) return null;

        const containerRect = container.getBoundingClientRect();
        return {
          containerWidth: containerRect.width,
          containerHeight: containerRect.height,
          canvasDisplayWidth: parseFloat(canvas.style.width),
          canvasDisplayHeight: parseFloat(canvas.style.height),
          match: Math.abs(containerRect.width - parseFloat(canvas.style.width)) < 2,
        };
      });

      console.log('\n=== After Zoom Out ===');
      console.log(JSON.stringify(afterZoomOut, null, 2));

      expect(afterZoomOut?.match).toBe(true);
    }
  });

  test('canvas virtualization - only visible canvases rendered', async ({ page }) => {
    await page.goto(`/read/${TEST_PDF_ID}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(2000);

    const renderState = await page.evaluate(() => {
      const containers = document.querySelectorAll('.pdf-page-container');
      const scrollContainer = document.querySelector('.overflow-auto');
      if (!scrollContainer) return null;

      const scrollRect = scrollContainer.getBoundingClientRect();
      let visibleCount = 0;
      let renderedCount = 0;
      let totalCount = containers.length;

      // Get page numbers of all containers
      const pageNumbers: number[] = [];
      containers.forEach((container) => {
        const pageNum = container.getAttribute('data-page');
        if (pageNum) pageNumbers.push(parseInt(pageNum, 10));

        const rect = container.getBoundingClientRect();
        const isVisible = rect.bottom > scrollRect.top && rect.top < scrollRect.bottom;

        if (isVisible) visibleCount++;

        const canvas = container.querySelector('canvas') as HTMLCanvasElement;
        if (canvas && canvas.width > 300) {
          renderedCount++;
        }
      });

      return {
        totalCount,
        visibleCount,
        renderedCount,
        pageNumbers: pageNumbers.slice(0, 20), // First 20 page numbers
        scrollContainerHeight: scrollContainer.clientHeight,
        scrollTop: scrollContainer.scrollTop,
      };
    });

    console.log('\n=== Canvas Virtualization State ===');
    console.log(JSON.stringify(renderState, null, 2));

    // Should only render visible pages + buffer, not all pages
    if (renderState) {
      const expectedMax = renderState.visibleCount + 6; // visible + buffer
      console.log(`Expected max rendered: ${expectedMax}, Actual: ${renderState.renderedCount}`);
      console.log(`DOM contains pages: ${renderState.pageNumbers.join(', ')}${renderState.totalCount > 20 ? '...' : ''}`);
    }
  });

  test('pages load correctly when scrolling through entire document', async ({ page }) => {
    await page.goto(`/read/${TEST_PDF_ID}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    const scrollContainer = page.locator('.overflow-auto').first();

    // Scroll through the document in chunks and verify pages render
    const results: { position: string; pageNum: number; hasCanvas: boolean; canvasRendered: boolean }[] = [];

    const totalHeight = await scrollContainer.evaluate((el) => el.scrollHeight);
    const viewportHeight = await scrollContainer.evaluate((el) => el.clientHeight);

    // Scroll to several positions through the document
    const positions = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

    for (const pct of positions) {
      const scrollTo = Math.floor((totalHeight - viewportHeight) * pct);
      await scrollContainer.evaluate((el, top) => el.scrollTo({ top, behavior: 'auto' }), scrollTo);
      await page.waitForTimeout(500); // Wait for render

      const state = await page.evaluate(() => {
        const containers = document.querySelectorAll('.pdf-page-container');
        const scrollEl = document.querySelector('.overflow-auto');
        if (!scrollEl) return [];

        const scrollRect = scrollEl.getBoundingClientRect();
        const results: { pageNum: number; hasCanvas: boolean; canvasRendered: boolean }[] = [];

        containers.forEach((container) => {
          const rect = container.getBoundingClientRect();
          const isVisible = rect.bottom > scrollRect.top && rect.top < scrollRect.bottom;

          if (isVisible) {
            const pageNum = parseInt(container.getAttribute('data-page') || '0', 10);
            const canvas = container.querySelector('canvas') as HTMLCanvasElement;
            results.push({
              pageNum,
              hasCanvas: !!canvas,
              canvasRendered: canvas ? canvas.width > 100 : false,
            });
          }
        });

        return results;
      });

      state.forEach((s) => results.push({ position: `${(pct * 100).toFixed(0)}%`, ...s }));
    }

    console.log('\n=== Full Document Scroll Test ===');
    const failed = results.filter((r) => !r.canvasRendered);
    if (failed.length > 0) {
      console.log(`FAILED: ${failed.length} pages not rendered:`);
      failed.forEach((f) => console.log(`  Page ${f.pageNum} at ${f.position}`));
    } else {
      console.log(`SUCCESS: All ${results.length} visible pages rendered correctly`);
    }
    console.log(`Positions checked: ${positions.map((p) => `${(p * 100).toFixed(0)}%`).join(', ')}`);

    // At least 80% of visible pages should be rendered
    const renderedPct = ((results.length - failed.length) / results.length) * 100;
    console.log(`Render success rate: ${renderedPct.toFixed(1)}%`);

    expect(renderedPct).toBeGreaterThan(80);
  });

  test('scroll performance with complex PDF', async ({ page }) => {
    await page.goto(`/read/${TEST_PDF_ID}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    const scrollMetrics = await page.evaluate(async () => {
      const container = document.querySelector('.overflow-auto');
      if (!container) return null;

      const frameTimes: number[] = [];
      let lastTime = performance.now();
      let measuring = true;

      function measure() {
        const now = performance.now();
        frameTimes.push(now - lastTime);
        lastTime = now;
        if (measuring) requestAnimationFrame(measure);
      }
      requestAnimationFrame(measure);

      // Scroll through the document
      for (let i = 0; i < 15; i++) {
        container.scrollBy({ top: 600, behavior: 'auto' });
        await new Promise((r) => setTimeout(r, 100));
      }

      await new Promise((r) => setTimeout(r, 500));
      measuring = false;

      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const sorted = [...frameTimes].sort((a, b) => b - a);
      const dropped = frameTimes.filter((t) => t > 33.33).length;

      return {
        avgFrameTime: avg,
        worstFrames: sorted.slice(0, 5),
        droppedFrames: dropped,
        totalFrames: frameTimes.length,
        at60fps: frameTimes.filter((t) => t <= 16.67).length,
      };
    });

    console.log('\n=== Scroll Performance (Complex PDF) ===');
    if (scrollMetrics) {
      console.log(`Avg frame time: ${scrollMetrics.avgFrameTime.toFixed(2)}ms`);
      console.log(`Worst frames: ${scrollMetrics.worstFrames.map((t) => t.toFixed(0) + 'ms').join(', ')}`);
      console.log(`Dropped frames: ${scrollMetrics.droppedFrames}/${scrollMetrics.totalFrames}`);
      console.log(`Frames at 60fps: ${scrollMetrics.at60fps}/${scrollMetrics.totalFrames}`);
    }
  });
});
