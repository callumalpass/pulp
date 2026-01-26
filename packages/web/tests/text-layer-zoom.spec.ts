import { test, expect } from '@playwright/test';

test.describe('Text Layer at Different Zoom Levels', () => {
  let pdfId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

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
      console.log('API request failed');
    }
    await page.close();
  });

  // Zoom steps: negative = zoom out, positive = zoom in
  // 0 = fit-width (default), -2 = 2 steps out, +2 = 2 steps in
  const zoomSteps = [
    { name: '~75% (2 steps out)', steps: -2 },
    { name: '~90% (1 step out)', steps: -1 },
    { name: '~100% (fit-width)', steps: 0 },
    { name: '~125% (1 step in)', steps: 1 },
    { name: '~150% (2 steps in)', steps: 2 },
    { name: '~200% (4 steps in)', steps: 4 },
  ];

  for (const zoomConfig of zoomSteps) {
    test(`text layer aligns at ${zoomConfig.name}`, async ({ page }) => {
      test.skip(!pdfId, 'No PDFs in library');

      await page.goto(`/read/${pdfId}`);
      await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
      await page.waitForTimeout(2000);

      // Apply zoom steps using keyboard shortcuts
      // + or = zooms in, - zooms out
      const steps = zoomConfig.steps;
      if (steps > 0) {
        for (let i = 0; i < steps; i++) {
          await page.keyboard.press('=');
          await page.waitForTimeout(300);
        }
      } else if (steps < 0) {
        for (let i = 0; i < Math.abs(steps); i++) {
          await page.keyboard.press('-');
          await page.waitForTimeout(300);
        }
      }

      // Wait for re-render after zoom change
      await page.waitForTimeout(2000);

      // Check alignment
      const alignment = await page.evaluate(() => {
        const results: {
          page: number;
          canvasWidth: number;
          canvasHeight: number;
          textLayerWidth: number;
          textLayerHeight: number;
          widthDiff: number;
          heightDiff: number;
          aligned: boolean;
          rendered: boolean;
        }[] = [];

        const containers = document.querySelectorAll('.pdf-page-container');
        containers.forEach((container, idx) => {
          const canvas = container.querySelector('canvas');
          const textLayer = container.querySelector('.textLayer') as HTMLElement;

          if (!canvas || !textLayer) return;

          const canvasRect = canvas.getBoundingClientRect();
          const textLayerRect = textLayer.getBoundingClientRect();

          // Skip placeholder canvases (300x150 is the default HTML canvas size)
          // These are pages that haven't been rendered yet
          const isPlaceholder = canvasRect.width === 300 && canvasRect.height === 150;

          const widthDiff = Math.abs(canvasRect.width - textLayerRect.width);
          const heightDiff = Math.abs(canvasRect.height - textLayerRect.height);

          results.push({
            page: idx + 1,
            canvasWidth: canvasRect.width,
            canvasHeight: canvasRect.height,
            textLayerWidth: textLayerRect.width,
            textLayerHeight: textLayerRect.height,
            widthDiff,
            heightDiff,
            aligned: widthDiff < 2 && heightDiff < 2,
            rendered: !isPlaceholder,
          });
        });

        return results;
      });

      console.log(`\n=== Alignment at ${zoomConfig.name} ===`);
      // Only check pages that have actually rendered (not placeholder canvases)
      const renderedPages = alignment.filter((a) => a.rendered);
      const misaligned = renderedPages.filter((a) => !a.aligned);
      const unrendered = alignment.filter((a) => !a.rendered);

      if (unrendered.length > 0) {
        console.log(`${unrendered.length} pages not yet rendered (skipped)`);
      }
      if (misaligned.length === 0) {
        console.log(`All ${renderedPages.length} rendered pages aligned correctly`);
      } else {
        console.log(`${misaligned.length}/${renderedPages.length} rendered pages misaligned:`);
        misaligned.slice(0, 3).forEach((a) => {
          console.log(`  Page ${a.page}: canvas ${a.canvasWidth.toFixed(0)}x${a.canvasHeight.toFixed(0)} vs textLayer ${a.textLayerWidth.toFixed(0)}x${a.textLayerHeight.toFixed(0)} (diff: ${a.widthDiff.toFixed(1)}x${a.heightDiff.toFixed(1)})`);
        });
      }

      expect(misaligned.length).toBe(0);
    });
  }

  test('text layer updates correctly when zooming in and out', async ({ page }) => {
    test.skip(!pdfId, 'No PDFs in library');

    await page.goto(`/read/${pdfId}`);
    await page.waitForSelector('.pdf-page-container', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Helper to check alignment
    const checkAlignment = async () => {
      return page.evaluate(() => {
        const container = document.querySelector('.pdf-page-container');
        if (!container) return null;

        const canvas = container.querySelector('canvas');
        const textLayer = container.querySelector('.textLayer') as HTMLElement;
        if (!canvas || !textLayer) return null;

        const canvasRect = canvas.getBoundingClientRect();
        const textLayerRect = textLayer.getBoundingClientRect();

        return {
          canvasWidth: canvasRect.width,
          canvasHeight: canvasRect.height,
          textLayerWidth: textLayerRect.width,
          textLayerHeight: textLayerRect.height,
          widthDiff: Math.abs(canvasRect.width - textLayerRect.width),
          heightDiff: Math.abs(canvasRect.height - textLayerRect.height),
        };
      });
    };

    // Check initial state
    const initial = await checkAlignment();
    console.log(`\nInitial: canvas ${initial?.canvasWidth?.toFixed(0)}x${initial?.canvasHeight?.toFixed(0)}, textLayer ${initial?.textLayerWidth?.toFixed(0)}x${initial?.textLayerHeight?.toFixed(0)}`);

    // Zoom in using keyboard (Ctrl/Cmd + =)
    await page.keyboard.press('Control+=');
    await page.waitForTimeout(1500);

    const afterZoomIn = await checkAlignment();
    console.log(`After zoom in: canvas ${afterZoomIn?.canvasWidth?.toFixed(0)}x${afterZoomIn?.canvasHeight?.toFixed(0)}, textLayer ${afterZoomIn?.textLayerWidth?.toFixed(0)}x${afterZoomIn?.textLayerHeight?.toFixed(0)}`);

    // Zoom out using keyboard (Ctrl/Cmd + -)
    await page.keyboard.press('Control+-');
    await page.keyboard.press('Control+-');
    await page.waitForTimeout(1500);

    const afterZoomOut = await checkAlignment();
    console.log(`After zoom out: canvas ${afterZoomOut?.canvasWidth?.toFixed(0)}x${afterZoomOut?.canvasHeight?.toFixed(0)}, textLayer ${afterZoomOut?.textLayerWidth?.toFixed(0)}x${afterZoomOut?.textLayerHeight?.toFixed(0)}`);

    // Check that dimensions are aligned after zooming
    expect(afterZoomIn?.widthDiff).toBeLessThan(2);
    expect(afterZoomIn?.heightDiff).toBeLessThan(2);
    expect(afterZoomOut?.widthDiff).toBeLessThan(2);
    expect(afterZoomOut?.heightDiff).toBeLessThan(2);
  });
});
