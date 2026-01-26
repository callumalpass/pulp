import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testEpubPath = join(__dirname, 'fixtures', 'test.epub');
const testEpubData = readFileSync(testEpubPath);

/**
 * Markdown Editor UI/UX Exploration Test Suite
 *
 * Tests the markdown editor panel functionality, performance, and usability
 */
test.describe('Markdown Editor - UI/UX Exploration', () => {
  test.beforeEach(async ({ page }) => {
    // Mock EPUB book metadata
    await page.route('**/api/library/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'epub1',
          title: 'Test Book for Notes',
          source: '/path/to/test.epub',
          sourceType: 'epub',
          filePath: '/path/to/test.epub',
          notePath: '/path/to/note.md',
          progress: 25,
          lastRead: new Date().toISOString(),
          tags: ['literature-note'],
          cover: null,
          highlights: [],
          frontmatter: {},
        }),
      });
    });

    // Mock EPUB file content
    await page.route('**/api/files/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/epub+zip',
        body: testEpubData,
      });
    });

    // Mock highlights
    await page.route('**/api/library/epub1/highlights', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock reading goals
    await page.route('**/api/reading-goals**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          dailyGoal: 30,
          weeklyGoal: 150,
          todayMinutes: 15,
          weekMinutes: 60,
          currentStreak: 5,
        }),
      });
    });

    // Mock progress updates
    await page.route('**/api/library/epub1/progress', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });

    // Mock note content - simulate existing notes
    await page.route('**/api/library/epub1/content', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            content: '# My Notes\n\nThis is a test note with some **bold text** and *italic text*.\n\n## Key Insights\n\n- First insight\n- Second insight\n- Third insight\n\n> This is a blockquote from the book.\n\n```javascript\nconst example = "code block";\n```\n\n[Link example](https://example.com)',
          }),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });
  });

  async function openMarkdownEditor(page: Page) {
    await page.goto('/read/epub1');
    // Wait for EPUB to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    // Open the notes panel - try different selectors
    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    await notesButton.click();
    await page.waitForTimeout(300);
  }

  test('markdown editor - initial state and layout', async ({ page }) => {
    await openMarkdownEditor(page);

    // Verify panel is visible
    const panel = page.locator('.markdown-editor-panel, .mobile-fullscreen-modal');
    await expect(panel).toBeVisible();

    // Screenshot of initial state
    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-initial.png',
      fullPage: true
    });

    // Check for key elements
    await expect(page.locator('.font-medium:has-text("Notes")')).toBeVisible();
    await expect(page.locator('text=Saved').or(page.locator('text=Unsaved')).or(page.locator('text=Saving')).first()).toBeVisible();
  });

  test('markdown editor - toolbar buttons', async ({ page }) => {
    await openMarkdownEditor(page);

    // Screenshot toolbar
    const toolbar = page.locator('.flex.items-center.gap-1').first();
    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-toolbar.png',
      fullPage: true
    });

    // Test Bold button
    const boldButton = page.locator('button[title*="Bold"]');
    await expect(boldButton).toBeVisible();

    // Test Italic button
    const italicButton = page.locator('button[title*="Italic"]');
    await expect(italicButton).toBeVisible();

    // Test Strikethrough button
    const strikeButton = page.locator('button[title*="Strikethrough"]');
    await expect(strikeButton).toBeVisible();

    // Test heading buttons
    await expect(page.locator('button[title="Heading 1"]')).toBeVisible();
    await expect(page.locator('button[title="Heading 2"]')).toBeVisible();
    await expect(page.locator('button[title="Heading 3"]')).toBeVisible();

    // Test list buttons
    await expect(page.locator('button[title="Bullet list"]')).toBeVisible();
    await expect(page.locator('button[title="Numbered list"]')).toBeVisible();

    // Test quote button
    await expect(page.locator('button[title="Quote"]')).toBeVisible();

    // Test code and link buttons
    await expect(page.locator('button[title*="Code"]')).toBeVisible();
    await expect(page.locator('button[title*="Link"]')).toBeVisible();
  });

  test('markdown editor - view mode toggle', async ({ page }) => {
    await openMarkdownEditor(page);

    // Test Edit mode (default)
    const editButton = page.locator('button:has-text("Edit")');
    const splitButton = page.locator('button:has-text("Split")');
    const previewButton = page.locator('button:has-text("Preview")');

    await expect(editButton).toBeVisible();
    await expect(splitButton).toBeVisible();
    await expect(previewButton).toBeVisible();

    // Screenshot edit mode
    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-edit-mode.png',
      fullPage: true
    });

    // Switch to Split mode
    await splitButton.click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-split-mode.png',
      fullPage: true
    });

    // Switch to Preview mode
    await previewButton.click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-preview-mode.png',
      fullPage: true
    });
  });

  test('markdown editor - VIM mode toggle', async ({ page }) => {
    await openMarkdownEditor(page);

    // Find VIM button
    const vimButton = page.locator('button:has-text("VIM")');
    await expect(vimButton).toBeVisible();

    // Screenshot with VIM disabled
    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-vim-off.png',
      fullPage: true
    });

    // Enable VIM mode
    await vimButton.click();
    await page.waitForTimeout(200);

    // Screenshot with VIM enabled
    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-vim-on.png',
      fullPage: true
    });
  });

  test('markdown editor - formatting button interactions', async ({ page }) => {
    await openMarkdownEditor(page);

    // Focus the editor
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.waitForTimeout(100);

    // Select some text and apply bold
    await page.keyboard.press('Control+a'); // Select all
    await page.waitForTimeout(100);

    // Click bold button
    const boldButton = page.locator('button[title*="Bold"]');
    await boldButton.click();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-after-bold.png',
      fullPage: true
    });
  });

  test('markdown editor - keyboard shortcuts', async ({ page }) => {
    await openMarkdownEditor(page);

    // Focus the editor
    const editor = page.locator('.cm-content').first();
    await editor.click();

    // Test Cmd+B for bold
    await page.keyboard.type('test text');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(200);

    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-shortcut-bold.png',
      fullPage: true
    });

    // Test Cmd+S for save
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(500);

    // Check save status
    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-after-save.png',
      fullPage: true
    });
  });

  test('markdown editor - resize functionality', async ({ page }) => {
    await openMarkdownEditor(page);

    // Find resize handle
    const resizeHandle = page.locator('.markdown-panel-resize-handle');

    if (await resizeHandle.isVisible()) {
      // Get initial width
      const panel = page.locator('.markdown-editor-panel');
      const initialBox = await panel.boundingBox();

      await page.screenshot({
        path: 'test-results/exploration/markdown-editor-resize-before.png',
        fullPage: true
      });

      // Drag to resize
      const handleBox = await resizeHandle.boundingBox();
      if (handleBox && initialBox) {
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(handleBox.x - 100, handleBox.y + handleBox.height / 2);
        await page.mouse.up();
        await page.waitForTimeout(200);

        await page.screenshot({
          path: 'test-results/exploration/markdown-editor-resize-after.png',
          fullPage: true
        });
      }
    }
  });

  test('markdown editor - overlay vs dock mode', async ({ page }) => {
    await openMarkdownEditor(page);

    // Find overlay toggle button
    const overlayButton = page.locator('button[title*="Float"], button[title*="Dock"]').first();

    if (await overlayButton.isVisible()) {
      // Screenshot docked mode
      await page.screenshot({
        path: 'test-results/exploration/markdown-editor-docked.png',
        fullPage: true
      });

      // Toggle to overlay mode
      await overlayButton.click();
      await page.waitForTimeout(200);

      await page.screenshot({
        path: 'test-results/exploration/markdown-editor-overlay.png',
        fullPage: true
      });
    }
  });

  test('markdown editor - close button', async ({ page }) => {
    await openMarkdownEditor(page);

    // Find and click close button
    const closeButton = page.locator('button[title*="Close"]');
    await expect(closeButton).toBeVisible();

    await closeButton.click();
    await page.waitForTimeout(300);

    // Panel should be hidden
    const panel = page.locator('.markdown-editor-panel');
    await expect(panel).not.toBeVisible();

    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-closed.png',
      fullPage: true
    });
  });

  test('markdown editor - escape key closes panel (non-vim mode)', async ({ page }) => {
    await openMarkdownEditor(page);

    // Make sure VIM mode is off first
    const vimButton = page.locator('button:has-text("VIM")');
    // Check if VIM is active by looking at button style
    const vimActive = await vimButton.evaluate((el) =>
      el.classList.contains('bg-accent-primary/20') ||
      el.classList.contains('bg-black')
    );

    if (vimActive) {
      await vimButton.click();
      await page.waitForTimeout(200);
    }

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Panel should be closed
    const panel = page.locator('.markdown-editor-panel');
    await expect(panel).not.toBeVisible();
  });

  test('markdown editor - preview rendering quality', async ({ page }) => {
    await openMarkdownEditor(page);

    // Switch to preview mode
    const previewButton = page.locator('button:has-text("Preview")');
    await previewButton.click();
    await page.waitForTimeout(300);

    // Check that preview contains rendered HTML
    const previewPane = page.locator('.prose');
    await expect(previewPane).toBeVisible();

    // Check for rendered elements
    await expect(previewPane.locator('h1').first()).toBeVisible();
    await expect(previewPane.locator('strong').first()).toBeVisible();
    await expect(previewPane.locator('em').first()).toBeVisible();
    await expect(previewPane.locator('ul').first()).toBeVisible();
    await expect(previewPane.locator('blockquote').first()).toBeVisible();
    await expect(previewPane.locator('pre').first()).toBeVisible();
    await expect(previewPane.locator('a').first()).toBeVisible();

    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-preview-quality.png',
      fullPage: true
    });
  });

  test('markdown editor - save status transitions', async ({ page }) => {
    await openMarkdownEditor(page);

    // Initial state should be "Saved"
    await expect(page.locator('text=Saved')).toBeVisible();

    // Type to trigger unsaved state
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.type('New content');
    await page.waitForTimeout(100);

    // Should show "Unsaved"
    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-unsaved-status.png',
      fullPage: true
    });

    // Wait for auto-save debounce (1.5s + some buffer)
    await page.waitForTimeout(2000);

    // Should transition to "Saving..." then "Saved"
    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-saved-status.png',
      fullPage: true
    });
  });
});

test.describe('Markdown Editor - Mobile Experience', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    // Same mocks as desktop
    await page.route('**/api/library/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'epub1',
          title: 'Test Book for Notes',
          source: '/path/to/test.epub',
          sourceType: 'epub',
          filePath: '/path/to/test.epub',
          notePath: '/path/to/note.md',
          progress: 25,
          lastRead: new Date().toISOString(),
          tags: ['literature-note'],
          cover: null,
          highlights: [],
          frontmatter: {},
        }),
      });
    });

    await page.route('**/api/files/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/epub+zip',
        body: testEpubData,
      });
    });

    await page.route('**/api/library/epub1/highlights', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/reading-goals**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ dailyGoal: 30, weeklyGoal: 150, todayMinutes: 15, weekMinutes: 60, currentStreak: 5 }),
      });
    });

    await page.route('**/api/library/epub1/progress', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });

    await page.route('**/api/library/epub1/content', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ content: '# Mobile Notes\n\nTesting on mobile device.' }),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });
  });

  test('mobile - fullscreen modal layout', async ({ page }) => {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    // Open notes panel on mobile
    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    if (await notesButton.isVisible()) {
      await notesButton.click();
      await page.waitForTimeout(300);
    }

    // Should be fullscreen modal on mobile
    const modal = page.locator('.mobile-fullscreen-modal');
    if (await modal.isVisible()) {
      await expect(modal).toBeVisible();
    }

    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-mobile.png',
      fullPage: true
    });
  });

  test('mobile - toolbar usability', async ({ page }) => {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    if (await notesButton.isVisible()) {
      await notesButton.click();
      await page.waitForTimeout(300);
    }

    // Check toolbar is visible and accessible
    const boldButton = page.locator('button[title*="Bold"]');

    if (await boldButton.isVisible()) {
      // Get button size for touch target analysis
      const buttonBox = await boldButton.boundingBox();
      if (buttonBox) {
        console.log(`Bold button size: ${buttonBox.width}x${buttonBox.height}`);
        // Touch targets should be at least 44x44 for good mobile UX (Apple HIG)
        expect(buttonBox.width).toBeGreaterThanOrEqual(44);
        expect(buttonBox.height).toBeGreaterThanOrEqual(44);
      }
    }

    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-mobile-toolbar.png',
      fullPage: true
    });
  });

  test('mobile - keyboard interaction', async ({ page }) => {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    if (await notesButton.isVisible()) {
      await notesButton.click();
      await page.waitForTimeout(300);
    }

    // Focus editor to trigger virtual keyboard
    const editor = page.locator('.cm-content').first();
    if (await editor.isVisible()) {
      await editor.click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: 'test-results/exploration/markdown-editor-mobile-keyboard.png',
        fullPage: true
      });
    }
  });
});

test.describe('Markdown Editor - Performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/library/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'epub1',
          title: 'Test Book',
          source: '/path/to/test.epub',
          sourceType: 'epub',
          filePath: '/path/to/test.epub',
          notePath: '/path/to/note.md',
          progress: 25,
          lastRead: new Date().toISOString(),
          tags: ['literature-note'],
          cover: null,
          highlights: [],
          frontmatter: {},
        }),
      });
    });

    await page.route('**/api/files/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/epub+zip',
        body: testEpubData,
      });
    });

    await page.route('**/api/library/epub1/highlights', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/reading-goals**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ dailyGoal: 30, weeklyGoal: 150, todayMinutes: 15, weekMinutes: 60, currentStreak: 5 }),
      });
    });

    await page.route('**/api/library/epub1/progress', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });
  });

  test('performance - editor opening time', async ({ page }) => {
    // Large content to stress test
    const largeContent = '# Large Document\n\n' +
      Array(100).fill('This is a paragraph of text to test performance with larger documents.\n\n').join('') +
      '## Lists\n\n' +
      Array(50).fill('- List item with some content\n').join('') +
      '\n## Code\n\n```javascript\n' +
      Array(20).fill('const line = "code";\n').join('') +
      '```\n';

    await page.route('**/api/library/epub1/content', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ content: largeContent }),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });

    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    // Measure opening time
    const startTime = Date.now();
    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    await notesButton.click();

    // Wait for editor to be ready
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5000 });
    const openTime = Date.now() - startTime;

    console.log(`Editor open time with large content: ${openTime}ms`);

    await page.screenshot({
      path: 'test-results/exploration/markdown-editor-large-content.png',
      fullPage: true
    });

    // Should open within reasonable time
    expect(openTime).toBeLessThan(3000);
  });

  test('performance - typing responsiveness', async ({ page }) => {
    await page.route('**/api/library/epub1/content', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ content: '# Notes\n\n' }),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });

    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    await notesButton.click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5000 });

    // Focus editor
    const editor = page.locator('.cm-content').first();
    await editor.click();

    // Type quickly and measure if there's lag
    const typingStartTime = Date.now();
    const testText = 'Testing typing performance with a longer string to see how the editor handles it.';
    await page.keyboard.type(testText, { delay: 10 }); // Fast typing
    const typingEndTime = Date.now();

    const expectedMinTime = testText.length * 10; // Minimum time based on delay
    const actualTime = typingEndTime - typingStartTime;
    const overhead = actualTime - expectedMinTime;

    console.log(`Typing overhead: ${overhead}ms for ${testText.length} characters`);

    // Overhead should be minimal
    expect(overhead).toBeLessThan(500);
  });

  test('performance - mode switching', async ({ page }) => {
    await page.route('**/api/library/epub1/content', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            content: '# Test\n\n**Bold** and *italic* and `code`\n\n- List 1\n- List 2\n\n> Quote'
          }),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });

    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    await notesButton.click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5000 });

    // Measure mode switch times
    const previewButton = page.locator('button:has-text("Preview")');
    const splitButton = page.locator('button:has-text("Split")');
    const editButton = page.locator('button:has-text("Edit")');

    // Switch to preview
    let switchStart = Date.now();
    await previewButton.click();
    await expect(page.locator('.prose')).toBeVisible();
    let switchTime = Date.now() - switchStart;
    console.log(`Edit -> Preview switch: ${switchTime}ms`);

    // Switch to split
    switchStart = Date.now();
    await splitButton.click();
    await page.waitForTimeout(100);
    switchTime = Date.now() - switchStart;
    console.log(`Preview -> Split switch: ${switchTime}ms`);

    // Switch back to edit
    switchStart = Date.now();
    await editButton.click();
    await page.waitForTimeout(100);
    switchTime = Date.now() - switchStart;
    console.log(`Split -> Edit switch: ${switchTime}ms`);
  });
});

test.describe('Markdown Editor - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/library/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'epub1',
          title: 'Test Book',
          source: '/path/to/test.epub',
          sourceType: 'epub',
          filePath: '/path/to/test.epub',
          notePath: '/path/to/note.md',
          progress: 25,
          lastRead: new Date().toISOString(),
          tags: ['literature-note'],
          cover: null,
          highlights: [],
          frontmatter: {},
        }),
      });
    });

    await page.route('**/api/files/epub1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/epub+zip',
        body: testEpubData,
      });
    });

    await page.route('**/api/library/epub1/highlights', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/api/reading-goals**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ dailyGoal: 30, weeklyGoal: 150, todayMinutes: 15, weekMinutes: 60, currentStreak: 5 }),
      });
    });

    await page.route('**/api/library/epub1/progress', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });

    await page.route('**/api/library/epub1/content', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ content: '# Test Notes' }),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });
  });

  test('accessibility - keyboard navigation', async ({ page }) => {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    await notesButton.click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5000 });

    // Tab through toolbar buttons
    await page.keyboard.press('Tab');
    await page.screenshot({ path: 'test-results/exploration/markdown-a11y-tab-1.png', fullPage: true });

    await page.keyboard.press('Tab');
    await page.screenshot({ path: 'test-results/exploration/markdown-a11y-tab-2.png', fullPage: true });

    await page.keyboard.press('Tab');
    await page.screenshot({ path: 'test-results/exploration/markdown-a11y-tab-3.png', fullPage: true });
  });

  test('accessibility - button titles and labels', async ({ page }) => {
    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    await notesButton.click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5000 });

    // Check all toolbar buttons have title attributes
    const toolbarButtons = page.locator('.flex.items-center.gap-1 button');
    const buttonCount = await toolbarButtons.count();

    let buttonsWithTitles = 0;
    for (let i = 0; i < buttonCount; i++) {
      const title = await toolbarButtons.nth(i).getAttribute('title');
      if (title) buttonsWithTitles++;
    }

    console.log(`Buttons with titles: ${buttonsWithTitles}/${buttonCount}`);

    // Close button should have title
    const closeButton = page.locator('button[title*="Close"]');
    await expect(closeButton).toHaveAttribute('title', /Close/);
  });
});
