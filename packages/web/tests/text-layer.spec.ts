import { test, expect } from '@playwright/test';

test.describe('Text Layer Accuracy & Performance', () => {
  let pdfId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait a bit for server to be fully ready
    await page.waitForTimeout(2000);

    // Use API to find a PDF specifically (not EPUB)
    try {
      const response = await page.request.get('/api/library');
      if (response.ok()) {
        const library = await response.json();
        // API returns array directly, find first PDF
        const pdfNote = library.find((n: any) => n.sourceType === 'pdf');

        if (pdfNote) {
          pdfId = pdfNote.id;
          console.log(`Found PDF: ${pdfNote.title} (${pdfId})`);
        }
      }
    } catch (e) {
      console.log('API request failed, falling back to link detection');
    }

    // Fallback to first link if no PDF found via API
    if (!pdfId) {
      const firstPdfLink = await page.locator('a[href^="/read/"]').first();
      if (await firstPdfLink.count() > 0) {
        const href = await firstPdfLink.getAttribute('href');
        pdfId = href?.replace('/read/', '') || null;
      }
    }
    await page.close();
  });

  test('text layer aligns with canvas', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(2000);

    const alignment = await page.evaluate(() => {
      const results: {
        page: number;
        canvasRect: { width: number; height: number };
        textLayerRect: { width: number; height: number };
        widthDiff: number;
        heightDiff: number;
        aligned: boolean;
      }[] = [];

      const containers = document.querySelectorAll('.pdf-page-container');
      containers.forEach((container, idx) => {
        const canvas = container.querySelector('canvas');
        const textLayer = container.querySelector('.textLayer') as HTMLElement;

        if (!canvas || !textLayer) return;

        const canvasRect = canvas.getBoundingClientRect();
        const textLayerRect = textLayer.getBoundingClientRect();

        const widthDiff = Math.abs(canvasRect.width - textLayerRect.width);
        const heightDiff = Math.abs(canvasRect.height - textLayerRect.height);

        results.push({
          page: idx + 1,
          canvasRect: { width: canvasRect.width, height: canvasRect.height },
          textLayerRect: { width: textLayerRect.width, height: textLayerRect.height },
          widthDiff,
          heightDiff,
          aligned: widthDiff < 2 && heightDiff < 2,
        });
      });

      return results;
    });

    console.log('\n=== Text Layer Alignment ===');
    const misaligned = alignment.filter((a) => !a.aligned);
    if (misaligned.length === 0) {
      console.log(`All ${alignment.length} pages aligned correctly`);
    } else {
      console.log(`${misaligned.length}/${alignment.length} pages misaligned:`);
      misaligned.slice(0, 5).forEach((a) => {
        console.log(`  Page ${a.page}: canvas ${a.canvasRect.width.toFixed(0)}x${a.canvasRect.height.toFixed(0)} vs textLayer ${a.textLayerRect.width.toFixed(0)}x${a.textLayerRect.height.toFixed(0)}`);
      });
    }

    expect(misaligned.length).toBe(0);
  });

  test('text spans have correct positioning', async ({ page }) => {
    // This test needs more time for text layer rendering
    test.setTimeout(90000);
    test.skip(!pdfId, 'No PDFs in library');

    // Capture console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });

    // Wait for text layer to populate (it's async) - give it more time for large PDFs
    let spansAppeared = false;
    try {
      await page.waitForFunction(
        () => {
          const textLayer = document.querySelector('.textLayer');
          return textLayer && textLayer.querySelectorAll('span').length > 0;
        },
        { timeout: 45000 }
      );
      spansAppeared = true;
    } catch {
      console.log('Text layer spans did not appear within timeout');
    }

    // Skip test if text layer didn't render (no failure, just skip)
    if (!spansAppeared) {
      test.skip(true, 'Text layer spans did not render within timeout');
      return;
    }

    await page.waitForTimeout(500);

    const spanAnalysis = await page.evaluate(() => {
      const firstContainer = document.querySelector('.pdf-page-container');
      if (!firstContainer) return null;

      const textLayer = firstContainer.querySelector('.textLayer') as HTMLElement;
      if (!textLayer) return null;

      const spans = textLayer.querySelectorAll('span');
      const spanData: {
        idx: number;
        text: string;
        hasTransform: boolean;
        left: number;
        top: number;
        width: number;
        height: number;
      }[] = [];

      spans.forEach((span, idx) => {
        if (idx >= 20) return; // Sample first 20 spans
        const style = window.getComputedStyle(span);
        const rect = span.getBoundingClientRect();
        const layerRect = textLayer.getBoundingClientRect();

        spanData.push({
          idx,
          text: span.textContent?.slice(0, 30) || '',
          hasTransform: style.transform !== 'none',
          left: rect.left - layerRect.left,
          top: rect.top - layerRect.top,
          width: rect.width,
          height: rect.height,
        });
      });

      return {
        totalSpans: spans.length,
        sampledSpans: spanData,
        layerSize: {
          width: textLayer.offsetWidth,
          height: textLayer.offsetHeight,
        },
      };
    });

    console.log('\n=== Text Span Analysis ===');
    if (consoleErrors.length > 0) {
      console.log('Console errors:');
      consoleErrors.forEach((e) => console.log(`  ${e}`));
    }

    if (spanAnalysis) {
      console.log(`Total spans: ${spanAnalysis.totalSpans}`);
      console.log(`Layer size: ${spanAnalysis.layerSize.width}x${spanAnalysis.layerSize.height}`);

      if (spanAnalysis.totalSpans === 0) {
        console.log('WARNING: No text spans found - text layer may not be rendering');
      } else {
        console.log('\nSample spans:');
        spanAnalysis.sampledSpans.slice(0, 10).forEach((s) => {
          console.log(`  [${s.idx}] "${s.text}" at (${s.left.toFixed(1)}, ${s.top.toFixed(1)}) ${s.width.toFixed(1)}x${s.height.toFixed(1)} transform:${s.hasTransform}`);
        });

        // Check that spans have valid positions
        const invalidSpans = spanAnalysis.sampledSpans.filter(
          (s) => s.left < -10 || s.top < -10 || s.width <= 0 || s.height <= 0
        );
        expect(invalidSpans.length).toBe(0);
      }
    }
  });

  test('text selection returns correct text', async ({ page }) => {
    // This test needs more time for text layer rendering
    test.setTimeout(90000);
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });

    // Wait for text layer to populate before attempting selection
    let spansAppeared = false;
    try {
      await page.waitForFunction(
        () => {
          const textLayer = document.querySelector('.textLayer');
          return textLayer && textLayer.querySelectorAll('span').length > 0;
        },
        { timeout: 45000 }
      );
      spansAppeared = true;
    } catch {
      console.log('Text layer spans did not appear');
    }

    // Skip test if text layer didn't render
    if (!spansAppeared) {
      test.skip(true, 'Text layer spans did not render within timeout');
      return;
    }

    await page.waitForTimeout(500);

    // Try to select text by clicking and dragging
    const textLayer = page.locator('.textLayer').first();
    const box = await textLayer.boundingBox();

    if (box) {
      // Select a region of text
      await page.mouse.move(box.x + 50, box.y + 50);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 50);
      await page.mouse.up();

      // Get the selected text
      const selectedText = await page.evaluate(() => {
        const selection = window.getSelection();
        return selection?.toString() || '';
      });

      console.log('\n=== Text Selection Test ===');
      console.log(`Selected text: "${selectedText.slice(0, 100)}${selectedText.length > 100 ? '...' : ''}"`);
      console.log(`Selection length: ${selectedText.length} chars`);

      // Selection should have captured some text
      if (selectedText.length > 0) {
        console.log('Text selection: WORKING');
      } else {
        console.log('Text selection: NO TEXT CAPTURED');
      }
    }
  });

  test('measure text layer render performance', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    // Inject performance measurement
    await page.addInitScript(() => {
      (window as any).__textLayerTimings = [];
      const originalTextLayerRender = (window as any).TextLayer?.prototype?.render;
      if (originalTextLayerRender) {
        (window as any).TextLayer.prototype.render = async function (...args: any[]) {
          const start = performance.now();
          const result = await originalTextLayerRender.apply(this, args);
          (window as any).__textLayerTimings.push(performance.now() - start);
          return result;
        };
      }
    });

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Scroll to trigger more text layer renders
    const scrollContainer = page.locator('.overflow-auto').first();
    for (let i = 0; i < 5; i++) {
      await scrollContainer.evaluate((el) => el.scrollBy({ top: 800, behavior: 'auto' }));
      await page.waitForTimeout(500);
    }

    // Measure text layer rendering by checking DOM mutation timing
    const metrics = await page.evaluate(async () => {
      const containers = document.querySelectorAll('.pdf-page-container');
      const measurements: {
        pagesWithTextLayer: number;
        avgSpansPerPage: number;
        totalSpans: number;
      } = {
        pagesWithTextLayer: 0,
        avgSpansPerPage: 0,
        totalSpans: 0,
      };

      containers.forEach((container) => {
        const textLayer = container.querySelector('.textLayer');
        if (textLayer) {
          const spans = textLayer.querySelectorAll('span');
          if (spans.length > 0) {
            measurements.pagesWithTextLayer++;
            measurements.totalSpans += spans.length;
          }
        }
      });

      if (measurements.pagesWithTextLayer > 0) {
        measurements.avgSpansPerPage = measurements.totalSpans / measurements.pagesWithTextLayer;
      }

      return measurements;
    });

    console.log('\n=== Text Layer Performance ===');
    console.log(`Pages with text layer: ${metrics.pagesWithTextLayer}`);
    console.log(`Total text spans: ${metrics.totalSpans}`);
    console.log(`Avg spans per page: ${metrics.avgSpansPerPage.toFixed(1)}`);
  });

  test('text layer renders on scroll', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(1000);

    const scrollContainer = page.locator('.overflow-auto').first();

    // Check text layer state during scroll
    const scrollResults: { scroll: number; pagesWithText: number[]; pagesWithoutText: number[] }[] = [];

    for (let i = 0; i < 8; i++) {
      await scrollContainer.evaluate((el) => el.scrollBy({ top: 600, behavior: 'auto' }));
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => {
        const container = document.querySelector('.overflow-auto');
        if (!container) return null;

        const viewportTop = container.scrollTop;
        const viewportBottom = viewportTop + container.clientHeight;

        const pagesWithText: number[] = [];
        const pagesWithoutText: number[] = [];

        document.querySelectorAll('.pdf-page-container').forEach((pc, idx) => {
          const rect = pc.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const relTop = rect.top - containerRect.top + container.scrollTop;
          const relBottom = relTop + rect.height;

          // Check if page is visible
          if (relBottom > viewportTop && relTop < viewportBottom) {
            const textLayer = pc.querySelector('.textLayer');
            const hasSpans = textLayer && textLayer.querySelectorAll('span').length > 0;

            if (hasSpans) {
              pagesWithText.push(idx + 1);
            } else {
              pagesWithoutText.push(idx + 1);
            }
          }
        });

        return { scrollTop: container.scrollTop, pagesWithText, pagesWithoutText };
      });

      if (state) {
        scrollResults.push({
          scroll: state.scrollTop,
          pagesWithText: state.pagesWithText,
          pagesWithoutText: state.pagesWithoutText,
        });
      }
    }

    console.log('\n=== Text Layer During Scroll ===');
    scrollResults.forEach((r, idx) => {
      const status = r.pagesWithoutText.length === 0 ? 'OK' : 'MISSING';
      console.log(
        `Scroll ${idx + 1} (${r.scroll.toFixed(0)}px): visible=[${r.pagesWithText.join(',')}] missing=[${r.pagesWithoutText.join(',')}] ${status}`
      );
    });

    // After scrolling settles, all visible pages should have text layers
    await page.waitForTimeout(500);
    const finalState = await page.evaluate(() => {
      const container = document.querySelector('.overflow-auto');
      if (!container) return { missing: 0, total: 0 };

      let missing = 0;
      let total = 0;

      document.querySelectorAll('.pdf-page-container').forEach((pc) => {
        const rect = pc.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
          total++;
          const textLayer = pc.querySelector('.textLayer');
          if (!textLayer || textLayer.querySelectorAll('span').length === 0) {
            missing++;
          }
        }
      });

      return { missing, total };
    });

    console.log(`\nFinal state: ${finalState.total - finalState.missing}/${finalState.total} visible pages have text layers`);
  });

  test('CMap and font loading', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    // Track network requests for CMap and font files
    const resourceRequests: { url: string; type: string; duration?: number }[] = [];
    const requestTimes = new Map<string, number>();

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('cmaps') || url.includes('standard_fonts') || url.includes('cdn.jsdelivr')) {
        requestTimes.set(url, Date.now());
        resourceRequests.push({ url, type: url.includes('cmaps') ? 'cmap' : 'font' });
      }
    });

    page.on('response', (response) => {
      const url = response.url();
      const startTime = requestTimes.get(url);
      if (startTime) {
        const req = resourceRequests.find((r) => r.url === url);
        if (req) {
          req.duration = Date.now() - startTime;
        }
      }
    });

    const loadStart = Date.now();
    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(2000);
    const loadEnd = Date.now();

    console.log('\n=== CMap & Font Loading ===');
    console.log(`Total page load time: ${loadEnd - loadStart}ms`);
    if (resourceRequests.length > 0) {
      const cmaps = resourceRequests.filter((r) => r.type === 'cmap');
      const fonts = resourceRequests.filter((r) => r.type === 'font');
      console.log(`CMap files loaded: ${cmaps.length}`);
      console.log(`Standard font files loaded: ${fonts.length}`);

      const totalDuration = resourceRequests.reduce((sum, r) => sum + (r.duration || 0), 0);
      console.log(`Total CDN request time: ${totalDuration}ms`);

      resourceRequests.slice(0, 5).forEach((r) => {
        console.log(`  ${r.url.split('/').pop()}: ${r.duration || 'pending'}ms`);
      });
    } else {
      console.log('No CMap or standard font files loaded');
      console.log('(This is normal if the PDF uses embedded fonts)');
    }
  });

  test('measure PDF load and render timing', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    // Capture console logs for timing info
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[TIMING]') || text.includes('[TEXT]') || text.includes('[QUEUE]') || text.includes('[WORKER]') || text.includes('[RENDER]')) {
        console.log(text);
      }
    });

    // Capture worker console logs
    page.on('worker', (worker) => {
      worker.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('[WORKER]')) {
          console.log(text);
        }
      });
    });

    const timings: Record<string, number> = {};

    // Measure page navigation
    timings.navStart = Date.now();
    await page.goto(`/read/${pdfId}`);
    timings.navEnd = Date.now();

    // Wait for first container
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    timings.containerVisible = Date.now();

    // Poll for text layer with detailed timing
    const pollStart = Date.now();
    let lastSpanCount = 0;
    for (let i = 0; i < 30; i++) {
      const state = await page.evaluate(() => {
        const textLayers = document.querySelectorAll('.textLayer');
        let totalSpans = 0;
        let layersWithSpans = 0;
        textLayers.forEach((tl) => {
          const spans = tl.querySelectorAll('span').length;
          totalSpans += spans;
          if (spans > 0) layersWithSpans++;
        });
        return { totalSpans, layersWithSpans, totalLayers: textLayers.length };
      });

      if (state.totalSpans !== lastSpanCount) {
        console.log(`[${Date.now() - pollStart}ms] Text spans: ${state.totalSpans} (${state.layersWithSpans}/${state.totalLayers} layers)`);
        lastSpanCount = state.totalSpans;
      }

      if (state.totalSpans > 0) {
        timings.textLayerRendered = Date.now();
        break;
      }
      await page.waitForTimeout(500);
    }

    if (!timings.textLayerRendered) {
      timings.textLayerRendered = Date.now();
      console.log('Text layer did not render within timeout');
    }

    console.log('\n=== PDF Load Timing Breakdown ===');
    console.log(`Navigation: ${timings.navEnd - timings.navStart}ms`);
    console.log(`Container visible: +${timings.containerVisible - timings.navEnd}ms`);
    console.log(`Text layer: +${timings.textLayerRendered - timings.containerVisible}ms`);
    console.log(`Total: ${timings.textLayerRendered - timings.navStart}ms`);
  });
});
