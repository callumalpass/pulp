import { test, expect, Page } from '@playwright/test';

interface PerformanceMetrics {
  initialLoadTime: number;
  firstPageRenderTime: number;
  scrollPerformance: {
    avgFrameTime: number;
    maxFrameTime: number;
    droppedFrames: number;
  };
  zoomPerformance: {
    debounceWorking: boolean;
    renderTimeAfterZoom: number;
  };
  workerActive: boolean;
  memoryUsage?: number;
}

test.describe('PDF Rendering Performance', () => {
  let pdfId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // Get a PDF ID from the library
    const page = await browser.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for library to load and get first PDF
    const firstPdfLink = await page.locator('a[href^="/read/"]').first();
    if (await firstPdfLink.count() > 0) {
      const href = await firstPdfLink.getAttribute('href');
      pdfId = href?.replace('/read/', '') || null;
    }
    await page.close();
  });

  test('measure initial PDF load time', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    const metrics: Partial<PerformanceMetrics> = {};

    // Start timing
    const startTime = Date.now();

    await page.goto(`/read/${pdfId}`);

    // Wait for PDF to be loaded (loading spinner gone)
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });

    // Wait for first page canvas to have content
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.pdf-page-container canvas') as HTMLCanvasElement;
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      // Check if canvas has non-transparent pixels
      const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100));
      return imageData.data.some((v, i) => i % 4 === 3 && v > 0); // Check alpha channel
    }, { timeout: 30000 });

    metrics.initialLoadTime = Date.now() - startTime;
    metrics.firstPageRenderTime = Date.now() - startTime;

    console.log('\n=== Initial Load Metrics ===');
    console.log(`Initial load time: ${metrics.initialLoadTime}ms`);
    console.log(`First page render: ${metrics.firstPageRenderTime}ms`);

    expect(metrics.initialLoadTime).toBeLessThan(10000); // Should load within 10s
  });

  test('measure scroll performance', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });

    // Wait for initial render
    await page.waitForTimeout(1000);

    // Collect frame times during scroll
    const frameTimes: number[] = [];

    await page.evaluate(() => {
      (window as any).__frameTimes = [];
      let lastTime = performance.now();

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'frame') {
            const now = performance.now();
            (window as any).__frameTimes.push(now - lastTime);
            lastTime = now;
          }
        }
      });

      // Fallback: use requestAnimationFrame
      function measureFrames() {
        const now = performance.now();
        (window as any).__frameTimes.push(now - lastTime);
        lastTime = now;
        if ((window as any).__measuring) {
          requestAnimationFrame(measureFrames);
        }
      }
      (window as any).__measuring = true;
      requestAnimationFrame(measureFrames);
    });

    // Perform scrolling
    const scrollContainer = page.locator('.overflow-auto').first();

    // Scroll down through the document
    for (let i = 0; i < 10; i++) {
      await scrollContainer.evaluate((el) => {
        el.scrollBy({ top: 500, behavior: 'auto' });
      });
      await page.waitForTimeout(100);
    }

    // Scroll back up
    for (let i = 0; i < 10; i++) {
      await scrollContainer.evaluate((el) => {
        el.scrollBy({ top: -500, behavior: 'auto' });
      });
      await page.waitForTimeout(100);
    }

    // Stop measuring and collect results
    const collectedFrameTimes = await page.evaluate(() => {
      (window as any).__measuring = false;
      return (window as any).__frameTimes as number[];
    });

    if (collectedFrameTimes.length > 0) {
      const avgFrameTime = collectedFrameTimes.reduce((a, b) => a + b, 0) / collectedFrameTimes.length;
      const maxFrameTime = Math.max(...collectedFrameTimes);
      const droppedFrames = collectedFrameTimes.filter((t) => t > 33.33).length; // > 30fps threshold

      console.log('\n=== Scroll Performance Metrics ===');
      console.log(`Average frame time: ${avgFrameTime.toFixed(2)}ms`);
      console.log(`Max frame time: ${maxFrameTime.toFixed(2)}ms`);
      console.log(`Dropped frames (>33ms): ${droppedFrames}/${collectedFrameTimes.length}`);
      console.log(`Frame time samples: ${collectedFrameTimes.length}`);

      // Warn if performance is poor
      if (avgFrameTime > 16.67) {
        console.log('WARNING: Average frame time exceeds 60fps target');
      }
      if (maxFrameTime > 100) {
        console.log('WARNING: Significant frame drops detected (>100ms)');
      }
    }
  });

  test('measure zoom debounce and render performance', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Track render calls
    await page.evaluate(() => {
      (window as any).__renderCalls = 0;
      (window as any).__lastRenderTime = 0;

      // Intercept canvas getContext to count renders
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const ctx = originalGetContext.apply(this, args as [any]);
        if (ctx && args[0] === '2d') {
          const originalDrawImage = ctx.drawImage;
          (ctx as any).drawImage = function (...drawArgs: any[]) {
            (window as any).__renderCalls++;
            (window as any).__lastRenderTime = performance.now();
            return originalDrawImage.apply(this, drawArgs);
          };
        }
        return ctx;
      };
    });

    const initialRenderCalls = await page.evaluate(() => (window as any).__renderCalls);

    // Simulate rapid zoom changes (like dragging a slider)
    const zoomButton = page.locator('button:has-text("+"), button:has-text("Zoom In")').first();

    const startTime = Date.now();

    // Rapid clicks to simulate slider drag
    for (let i = 0; i < 5; i++) {
      if (await zoomButton.count() > 0) {
        await zoomButton.click();
        await page.waitForTimeout(30); // Fast clicks
      }
    }

    // Check render calls immediately after rapid changes
    const renderCallsDuringZoom = await page.evaluate(() => (window as any).__renderCalls);

    // Wait for debounce to complete (150ms + some buffer)
    await page.waitForTimeout(300);

    const renderCallsAfterDebounce = await page.evaluate(() => (window as any).__renderCalls);
    const totalTime = Date.now() - startTime;

    console.log('\n=== Zoom Performance Metrics ===');
    console.log(`Render calls before: ${initialRenderCalls}`);
    console.log(`Render calls during rapid zoom: ${renderCallsDuringZoom - initialRenderCalls}`);
    console.log(`Render calls after debounce: ${renderCallsAfterDebounce - initialRenderCalls}`);
    console.log(`Total time for zoom sequence: ${totalTime}ms`);

    // Debounce is working if we don't see 5 separate render bursts
    const debounceWorking = (renderCallsAfterDebounce - initialRenderCalls) < 20;
    console.log(`Debounce working: ${debounceWorking}`);

    if (!debounceWorking) {
      console.log('WARNING: Zoom debounce may not be working effectively');
    }
  });

  test('verify web worker is active', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    // Check if worker is loaded
    const workerPromise = page.waitForEvent('worker', { timeout: 10000 }).catch(() => null);

    await page.goto(`/read/${pdfId}`);

    const worker = await workerPromise;

    console.log('\n=== Worker Status ===');
    if (worker) {
      console.log(`Worker URL: ${worker.url()}`);
      console.log('Web Worker: ACTIVE');
    } else {
      console.log('Web Worker: NOT DETECTED');
      console.log('WARNING: PDF rendering may be blocking the main thread');
    }

    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
  });

  test('profile main thread blocking', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(500);

    // Use Long Task API to detect main thread blocking
    const longTasks = await page.evaluate(async () => {
      return new Promise<{ count: number; totalDuration: number; maxDuration: number }>((resolve) => {
        const tasks: PerformanceEntry[] = [];

        const observer = new PerformanceObserver((list) => {
          tasks.push(...list.getEntries());
        });

        observer.observe({ entryTypes: ['longtask'] });

        // Trigger some activity - scroll through pages
        const container = document.querySelector('.overflow-auto');
        if (container) {
          for (let i = 0; i < 5; i++) {
            container.scrollBy({ top: 800, behavior: 'auto' });
          }
        }

        // Wait and collect
        setTimeout(() => {
          observer.disconnect();
          const durations = tasks.map((t) => t.duration);
          resolve({
            count: tasks.length,
            totalDuration: durations.reduce((a, b) => a + b, 0),
            maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
          });
        }, 2000);
      });
    });

    console.log('\n=== Main Thread Blocking ===');
    console.log(`Long tasks detected: ${longTasks.count}`);
    console.log(`Total blocking time: ${longTasks.totalDuration.toFixed(2)}ms`);
    console.log(`Max single block: ${longTasks.maxDuration.toFixed(2)}ms`);

    if (longTasks.count > 5) {
      console.log('WARNING: Frequent main thread blocking detected');
    }
    if (longTasks.maxDuration > 100) {
      console.log('WARNING: Significant main thread blocks (>100ms)');
    }
  });

  test('measure page render timing breakdown', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });

    // Add detailed timing instrumentation
    await page.evaluate(() => {
      (window as any).__timings = {
        pageGetTime: [],
        canvasRenderTime: [],
        textLayerTime: [],
        totalRenderTime: [],
      };
    });

    // Scroll to trigger new page renders
    const scrollContainer = page.locator('.overflow-auto').first();
    await scrollContainer.evaluate((el) => {
      el.scrollTo({ top: el.scrollHeight / 2, behavior: 'auto' });
    });

    await page.waitForTimeout(2000);

    // Collect performance entries
    const perfEntries = await page.evaluate(() => {
      const entries = performance.getEntriesByType('measure');
      return entries.map((e) => ({ name: e.name, duration: e.duration }));
    });

    console.log('\n=== Performance Entries ===');
    if (perfEntries.length > 0) {
      perfEntries.slice(0, 20).forEach((e) => {
        console.log(`${e.name}: ${e.duration.toFixed(2)}ms`);
      });
    } else {
      console.log('No performance measures found');
    }

    // Get resource timing for PDF.js worker
    const resourceTimings = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return entries
        .filter((e) => e.name.includes('pdf') || e.name.includes('worker'))
        .map((e) => ({
          name: e.name.split('/').pop(),
          duration: e.duration,
          transferSize: e.transferSize,
        }));
    });

    console.log('\n=== Resource Timings ===');
    resourceTimings.forEach((r) => {
      console.log(`${r.name}: ${r.duration.toFixed(2)}ms (${(r.transferSize / 1024).toFixed(1)}KB)`);
    });
  });
});
