import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testEpubPath = join(__dirname, 'fixtures', 'test.epub');
const testEpubData = readFileSync(testEpubPath);

const longContent = [
  '# Scroll Test Notes',
  '',
  ...Array.from({ length: 80 }, (_, i) => `Line ${i + 1}: This is a line of content to test scrolling in the markdown editor.`),
  '',
  '## End of content',
].join('\n');

test.describe('Markdown Editor - Scroll Debugging', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/library/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'epub1', title: 'Test Book for Notes', source: '/path/to/test.epub',
          sourceType: 'epub', filePath: '/path/to/test.epub', notePath: '/path/to/note.md',
          progress: 25, lastRead: new Date().toISOString(), tags: [], cover: null,
          highlights: [], frontmatter: {},
        }),
      });
    });
    await page.route('**/api/files/epub1', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/epub+zip', body: testEpubData });
    });
    await page.route('**/api/library/epub1/highlights', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/reading-goals**', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ dailyGoal: 30, weeklyGoal: 150, todayMinutes: 15, weekMinutes: 60, currentStreak: 5 }),
      });
    });
    await page.route('**/api/library/epub1/progress', async (route) => {
      if (route.request().method() === 'PUT')
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
    });
    await page.route('**/api/library/epub1/content', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ content: longContent }),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });
  });

  async function openMarkdownEditor(page: Page) {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);
    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    await notesButton.click();
    await page.waitForTimeout(500);
  }

  test('diagnose scroll in edit mode', async ({ page }) => {
    await openMarkdownEditor(page);

    const panel = page.locator('.markdown-editor-panel, .mobile-fullscreen-modal');
    await expect(panel).toBeVisible();

    const cmScroller = page.locator('.cm-scroller');
    await expect(cmScroller).toBeVisible();

    // Get CDP session for deeper inspection
    const client = await page.context().newCDPSession(page);

    // Get the DOM node ID for cm-scroller
    const doc = await client.send('DOM.getDocument');
    const scrollerNode = await client.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '.cm-scroller',
    });

    // Get event listeners on the scroller
    const listeners = await client.send('DOMDebugger.getEventListeners', {
      objectId: (await client.send('DOM.resolveNode', { nodeId: scrollerNode.nodeId })).object.objectId!,
    });

    console.log('\n=== Event listeners on .cm-scroller ===');
    for (const l of listeners.listeners) {
      console.log(`  ${l.type} | passive=${l.passive} | once=${l.once} | useCapture=${l.useCapture}`);
    }

    // Also check event listeners on ancestors
    for (const selector of ['.cm-editor', '.absolute.inset-0', '.panel-content', '.markdown-editor-panel']) {
      const node = await client.send('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector,
      });
      if (node.nodeId) {
        const resolved = await client.send('DOM.resolveNode', { nodeId: node.nodeId });
        const ancestorListeners = await client.send('DOMDebugger.getEventListeners', {
          objectId: resolved.object.objectId!,
        });
        const wheelListeners = ancestorListeners.listeners.filter(l => l.type === 'wheel' || l.type === 'scroll' || l.type === 'mousewheel');
        if (wheelListeners.length > 0) {
          console.log(`\n  ${selector} has wheel/scroll listeners:`);
          for (const l of wheelListeners) {
            console.log(`    ${l.type} | passive=${l.passive} | once=${l.once} | useCapture=${l.useCapture}`);
          }
        }
      }
    }

    // Check window-level wheel listeners
    const windowObj = await page.evaluateHandle(() => window);
    const windowListeners = await client.send('DOMDebugger.getEventListeners', {
      objectId: (windowObj as any)._remoteObject?.objectId || (await page.evaluate(() => 'window')),
    });

    console.log('\n=== Window-level scroll/wheel listeners ===');
    const windowScrollListeners = windowListeners.listeners.filter(l =>
      l.type === 'wheel' || l.type === 'scroll' || l.type === 'mousewheel'
    );
    for (const l of windowScrollListeners) {
      console.log(`  ${l.type} | passive=${l.passive} | once=${l.once} | useCapture=${l.useCapture}`);
    }

    // Now test: add an actual wheel event listener to catch what happens
    const wheelResult = await page.evaluate(() => {
      return new Promise<any>(resolve => {
        const scroller = document.querySelector('.cm-scroller') as HTMLElement;
        const results: any = {
          scrollerScrollTop: scroller.scrollTop,
          scrollerScrollHeight: scroller.scrollHeight,
          scrollerClientHeight: scroller.clientHeight,
          wheelEventReceived: false,
          wheelEventPrevented: false,
          scrollEventReceived: false,
          finalScrollTop: 0,
        };

        const wheelHandler = (e: WheelEvent) => {
          results.wheelEventReceived = true;
          results.wheelEventPrevented = e.defaultPrevented;
          results.wheelEventTarget = (e.target as HTMLElement)?.className?.slice(0, 50);
          results.wheelEventCurrentTarget = (e.currentTarget as HTMLElement)?.className?.slice(0, 50);
        };

        const scrollHandler = () => {
          results.scrollEventReceived = true;
          results.finalScrollTop = scroller.scrollTop;
        };

        scroller.addEventListener('wheel', wheelHandler, { passive: true });
        scroller.addEventListener('scroll', scrollHandler, { passive: true });

        // Also listen on document to catch bubbled events
        document.addEventListener('wheel', (e: WheelEvent) => {
          results.documentWheelReceived = true;
          results.documentWheelPrevented = e.defaultPrevented;
        }, { passive: true });

        // Give time for events to fire and then resolve
        setTimeout(() => {
          scroller.removeEventListener('wheel', wheelHandler);
          scroller.removeEventListener('scroll', scrollHandler);
          results.finalScrollTop = scroller.scrollTop;
          resolve(results);
        }, 2000);
      });
    });

    // Now dispatch the actual mouse wheel via Playwright
    const box = await cmScroller.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
      await page.mouse.wheel(0, 300);
    }

    // Wait for the promise to resolve
    await page.waitForTimeout(2500);
    const result = await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller') as HTMLElement;
      return { currentScrollTop: scroller.scrollTop };
    });

    console.log('\n=== Wheel event result ===');
    console.log('scrollTop after wheel:', result.currentScrollTop);

    // Now try using CDP directly to dispatch mouse wheel
    if (box) {
      // Reset scroll
      await cmScroller.evaluate(el => { el.scrollTop = 0; });

      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 2),
        deltaX: 0,
        deltaY: 300,
      });
      await page.waitForTimeout(500);
      const cdpResult = await cmScroller.evaluate(el => el.scrollTop);
      console.log('\n=== CDP direct mouseWheel ===');
      console.log('scrollTop after CDP wheel:', cdpResult);
    }

    // Final test: try scrollIntoView on the last line
    await cmScroller.evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(100);
    const scrollIntoViewResult = await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller') as HTMLElement;
      const lines = scroller.querySelectorAll('.cm-line');
      const lastLine = lines[lines.length - 1] as HTMLElement;
      lastLine.scrollIntoView({ block: 'center' });
      return {
        scrollTopAfterScrollIntoView: scroller.scrollTop,
        totalLines: lines.length,
      };
    });
    console.log('\n=== scrollIntoView last line ===');
    console.log(JSON.stringify(scrollIntoViewResult, null, 2));
  });
});
