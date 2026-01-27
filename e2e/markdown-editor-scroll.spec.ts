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

    // Test 1: Programmatic scrollTop assignment
    const progScroll = await cmScroller.evaluate(el => {
      el.scrollTop = 200;
      return el.scrollTop;
    });
    console.log(`\n=== Test 1: Programmatic scrollTop ===`);
    console.log(`Set scrollTop=200, actual: ${progScroll}`);

    // Reset
    await cmScroller.evaluate(el => { el.scrollTop = 0; });

    // Test 2: Check what element is at the center of cmScroller
    const elementAtCenter = await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller') as HTMLElement;
      const rect = scroller.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const el = document.elementFromPoint(cx, cy) as HTMLElement;
      return {
        tagName: el?.tagName,
        className: el?.className?.slice?.(0, 80) || '',
        scrollerRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        pointChecked: { x: cx, y: cy },
      };
    });
    console.log(`\n=== Test 2: Element at center of cmScroller ===`);
    console.log(JSON.stringify(elementAtCenter, null, 2));

    // Test 3: Check for wheel event listeners that preventDefault
    const wheelEventCheck = await page.evaluate(() => {
      return new Promise<{ scrolled: boolean; defaultPrevented: boolean; scrollTop: number }>(resolve => {
        const scroller = document.querySelector('.cm-scroller') as HTMLElement;
        scroller.scrollTop = 0;

        // Listen for wheel event to see if it's prevented
        let prevented = false;
        const listener = (e: WheelEvent) => {
          prevented = e.defaultPrevented;
        };
        scroller.addEventListener('wheel', listener, { capture: false });

        // Dispatch a synthetic wheel event
        const wheelEvent = new WheelEvent('wheel', {
          deltaY: 300,
          bubbles: true,
          cancelable: true,
        });
        scroller.dispatchEvent(wheelEvent);

        // Check after a frame
        requestAnimationFrame(() => {
          scroller.removeEventListener('wheel', listener);
          resolve({
            scrolled: scroller.scrollTop > 0,
            defaultPrevented: prevented,
            scrollTop: scroller.scrollTop,
          });
        });
      });
    });
    console.log(`\n=== Test 3: Synthetic wheel event ===`);
    console.log(JSON.stringify(wheelEventCheck, null, 2));

    // Test 4: Check all ancestors for event listeners / overflow
    const ancestorInfo = await page.evaluate(() => {
      const scroller = document.querySelector('.cm-scroller') as HTMLElement;
      const ancestors: any[] = [];
      let el: HTMLElement | null = scroller;
      while (el) {
        const cs = getComputedStyle(el);
        ancestors.push({
          tag: el.tagName,
          className: el.className?.slice?.(0, 60) || '',
          overflow: cs.overflow,
          overflowY: cs.overflowY,
          pointerEvents: cs.pointerEvents,
          touchAction: cs.touchAction,
          position: cs.position,
          zIndex: cs.zIndex,
          height: el.offsetHeight,
        });
        el = el.parentElement;
      }
      return ancestors;
    });
    console.log(`\n=== Test 4: Ancestor chain ===`);
    ancestorInfo.forEach((a, i) => {
      console.log(`  ${i}: <${a.tag}> .${a.className} | overflow=${a.overflow} overflowY=${a.overflowY} pointerEvents=${a.pointerEvents} touchAction=${a.touchAction} h=${a.height}`);
    });

    // Test 5: keyboard scrolling - click into editor, press Page Down
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.waitForTimeout(100);

    const scrollBeforeKey = await cmScroller.evaluate(el => el.scrollTop);
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(200);
    const scrollAfterKey = await cmScroller.evaluate(el => el.scrollTop);
    console.log(`\n=== Test 5: Keyboard PageDown ===`);
    console.log(`scrollTop before: ${scrollBeforeKey}, after: ${scrollAfterKey}, moved: ${scrollAfterKey - scrollBeforeKey}`);

    // Test 6: mouse.wheel with explicit coordinates on cm-content
    await cmScroller.evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(100);
    const box = await cmContent.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + 50);
      await page.waitForTimeout(100);
      const before = await cmScroller.evaluate(el => el.scrollTop);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(500);
      const after = await cmScroller.evaluate(el => el.scrollTop);
      console.log(`\n=== Test 6: mouse.wheel on cm-content ===`);
      console.log(`Mouse at (${box.x + box.width / 2}, ${box.y + 50})`);
      console.log(`scrollTop before: ${before}, after: ${after}, moved: ${after - before}`);
    }

    // Final screenshot
    await page.screenshot({ path: 'test-results/scroll-debug-final.png', fullPage: true });
  });
});
