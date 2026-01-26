import { test, expect } from '@playwright/test';

test.describe('PDF Render Timing Analysis', () => {
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

  test('detailed render timing breakdown', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    // Inject timing instrumentation before navigating
    await page.addInitScript(() => {
      (window as any).__renderTimings = {
        pageGetTimes: [] as number[],
        canvasSetupTimes: [] as number[],
        pdfRenderTimes: [] as number[],
        textContentTimes: [] as number[],
        textLayerTimes: [] as number[],
        spanAttributeTimes: [] as number[],
        totalRenderTimes: [] as number[],
      };
    });

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });

    // Wait for a few pages to render
    await page.waitForTimeout(3000);

    // Inject console monitoring to capture render timings
    const logs: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('TIMING:')) {
        logs.push(msg.text());
      }
    });

    // Add performance marks around key operations
    await page.evaluate(() => {
      // Monkey-patch to add timing
      const originalRender = (HTMLCanvasElement.prototype as any).__lookupGetter__
        ? undefined
        : undefined;

      // Track when pages are being rendered by watching canvas changes
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'width') {
            console.log('TIMING: Canvas resized at', performance.now());
          }
        }
      });

      document.querySelectorAll('.pdf-page-container canvas').forEach((canvas) => {
        observer.observe(canvas, { attributes: true });
      });
    });

    // Trigger scroll to force new page renders
    const scrollContainer = page.locator('.overflow-auto').first();

    // Measure frame times during rapid scroll
    const frameTimings = await page.evaluate(async () => {
      const container = document.querySelector('.overflow-auto');
      if (!container) return { frames: [], longTasks: [] };

      const frames: number[] = [];
      const longTasks: number[] = [];
      let lastFrame = performance.now();

      // Track long tasks
      const taskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          longTasks.push(entry.duration);
        });
      });
      taskObserver.observe({ entryTypes: ['longtask'] });

      // Track frames
      let measuring = true;
      function measureFrame() {
        const now = performance.now();
        frames.push(now - lastFrame);
        lastFrame = now;
        if (measuring) requestAnimationFrame(measureFrame);
      }
      requestAnimationFrame(measureFrame);

      // Scroll down rapidly
      for (let i = 0; i < 20; i++) {
        container.scrollBy({ top: 300, behavior: 'auto' });
        await new Promise((r) => setTimeout(r, 50));
      }

      // Wait for renders to complete
      await new Promise((r) => setTimeout(r, 1000));
      measuring = false;
      taskObserver.disconnect();

      return { frames, longTasks };
    });

    console.log('\n=== Detailed Frame Analysis ===');
    console.log(`Total frames measured: ${frameTimings.frames.length}`);

    if (frameTimings.frames.length > 0) {
      const sorted = [...frameTimings.frames].sort((a, b) => b - a);
      console.log(`Worst frame times: ${sorted.slice(0, 5).map((t) => t.toFixed(1) + 'ms').join(', ')}`);
      console.log(`Median frame time: ${sorted[Math.floor(sorted.length / 2)].toFixed(2)}ms`);

      const under16 = frameTimings.frames.filter((t) => t <= 16.67).length;
      const under33 = frameTimings.frames.filter((t) => t <= 33.33).length;
      console.log(`Frames at 60fps (<=16.67ms): ${under16}/${frameTimings.frames.length} (${(under16 / frameTimings.frames.length * 100).toFixed(1)}%)`);
      console.log(`Frames at 30fps (<=33.33ms): ${under33}/${frameTimings.frames.length} (${(under33 / frameTimings.frames.length * 100).toFixed(1)}%)`);
    }

    console.log('\n=== Long Task Analysis ===');
    console.log(`Long tasks detected: ${frameTimings.longTasks.length}`);
    if (frameTimings.longTasks.length > 0) {
      console.log(`Long task durations: ${frameTimings.longTasks.map((t) => t.toFixed(1) + 'ms').join(', ')}`);
      console.log(`Total blocking time: ${frameTimings.longTasks.reduce((a, b) => a + b, 0).toFixed(1)}ms`);
    }

    // Check what's happening during scroll
    const renderInfo = await page.evaluate(() => {
      const canvases = document.querySelectorAll('.pdf-page-container canvas');
      const textLayers = document.querySelectorAll('.textLayer');
      const renderedCanvases = Array.from(canvases).filter((c) => {
        const canvas = c as HTMLCanvasElement;
        return canvas.width > 0 && canvas.height > 0;
      });

      return {
        totalCanvases: canvases.length,
        renderedCanvases: renderedCanvases.length,
        textLayers: textLayers.length,
        textLayersWithContent: Array.from(textLayers).filter((t) => t.childElementCount > 0).length,
      };
    });

    console.log('\n=== Render State ===');
    console.log(`Total page containers: ${renderInfo.totalCanvases}`);
    console.log(`Rendered canvases: ${renderInfo.renderedCanvases}`);
    console.log(`Text layers with content: ${renderInfo.textLayersWithContent}`);
  });

  test('measure text layer impact', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Measure scroll with text layers
    const withTextLayers = await measureScrollPerformance(page, 'with text layers');

    // Hide text layers and measure again
    await page.evaluate(() => {
      document.querySelectorAll('.textLayer').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
    });

    // Scroll back up
    await page.locator('.overflow-auto').first().evaluate((el) => {
      el.scrollTo({ top: 0 });
    });
    await page.waitForTimeout(500);

    const withoutTextLayers = await measureScrollPerformance(page, 'without text layers');

    console.log('\n=== Text Layer Impact ===');
    console.log(`With text layers - Avg frame: ${withTextLayers.avgFrame.toFixed(2)}ms, Dropped: ${withTextLayers.droppedFrames}`);
    console.log(`Without text layers - Avg frame: ${withoutTextLayers.avgFrame.toFixed(2)}ms, Dropped: ${withoutTextLayers.droppedFrames}`);

    const improvement = ((withTextLayers.avgFrame - withoutTextLayers.avgFrame) / withTextLayers.avgFrame * 100);
    console.log(`Text layer overhead: ${improvement.toFixed(1)}%`);
  });
});

async function measureScrollPerformance(page: any, label: string) {
  const result = await page.evaluate(async () => {
    const container = document.querySelector('.overflow-auto');
    if (!container) return { frames: [], avgFrame: 0, droppedFrames: 0 };

    const frames: number[] = [];
    let lastFrame = performance.now();
    let measuring = true;

    function measureFrame() {
      const now = performance.now();
      frames.push(now - lastFrame);
      lastFrame = now;
      if (measuring) requestAnimationFrame(measureFrame);
    }
    requestAnimationFrame(measureFrame);

    for (let i = 0; i < 15; i++) {
      container.scrollBy({ top: 400, behavior: 'auto' });
      await new Promise((r) => setTimeout(r, 80));
    }

    await new Promise((r) => setTimeout(r, 500));
    measuring = false;

    const avgFrame = frames.length > 0 ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;
    const droppedFrames = frames.filter((t) => t > 33.33).length;

    return { frames, avgFrame, droppedFrames };
  });

  return result;
}
