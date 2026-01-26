import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testEpubPath = join(__dirname, 'fixtures', 'test.epub');
const testEpubData = readFileSync(testEpubPath);

/**
 * Visual regression tests for markdown preview rendering
 */
test.describe('Markdown Preview Visual Tests', () => {
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

  test('preview renders all markdown elements correctly', async ({ page }) => {
    // Comprehensive markdown content
    const markdownContent = [
      '# Main Title',
      '',
      'This is a paragraph with **bold text**, *italic text*, and ~~strikethrough~~.',
      '',
      '## Section Heading',
      '',
      'Here is some `inline code` in a paragraph.',
      '',
      '### Subsection',
      '',
      '- First bullet point',
      '- Second bullet point',
      '- Third bullet point',
      '',
      '1. First numbered item',
      '2. Second numbered item',
      '3. Third numbered item',
      '',
      '> This is a blockquote that should have a left border and subtle background.',
      '',
      '```javascript',
      'const code = "block";',
      'console.log(code);',
      '```',
      '',
      '[A link to example](https://example.com)',
      '',
      '---',
      '',
      'End of document.',
    ].join('\n');

    await page.route('**/api/library/epub1/content', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ content: markdownContent }),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });

    await page.goto('/read/epub1');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    // Open notes panel
    const notesButton = page.locator('button[aria-label*="Notes"], button[aria-label*="notes"]').first();
    await notesButton.click();
    await page.waitForTimeout(300);

    // Switch to preview mode
    const previewButton = page.locator('button:has-text("Preview")');
    await previewButton.click();
    await page.waitForTimeout(300);

    const prose = page.locator('.prose');
    await expect(prose).toBeVisible();

    // Verify H1 styling
    const h1 = prose.locator('h1').first();
    await expect(h1).toBeVisible();
    const h1FontSize = await h1.evaluate(el => window.getComputedStyle(el).fontSize);
    expect(parseFloat(h1FontSize)).toBeGreaterThanOrEqual(28); // 1.75rem = 28px

    // Verify H2 styling with accent color
    const h2 = prose.locator('h2').first();
    await expect(h2).toBeVisible();
    const h2Color = await h2.evaluate(el => window.getComputedStyle(el).color);
    // Should be accent-primary color (purple-ish)
    expect(h2Color).toMatch(/rgb\(162, 155, 254\)|rgba\(162, 155, 254/);

    // Verify bullet list has bullets
    const ul = prose.locator('ul').first();
    await expect(ul).toBeVisible();
    const ulListStyle = await ul.evaluate(el => window.getComputedStyle(el).listStyleType);
    expect(ulListStyle).toBe('disc');

    // Verify numbered list has numbers
    const ol = prose.locator('ol').first();
    await expect(ol).toBeVisible();
    const olListStyle = await ol.evaluate(el => window.getComputedStyle(el).listStyleType);
    expect(olListStyle).toBe('decimal');

    // Verify blockquote has left border
    const blockquote = prose.locator('blockquote').first();
    await expect(blockquote).toBeVisible();
    const bqBorderLeft = await blockquote.evaluate(el => window.getComputedStyle(el).borderLeftWidth);
    expect(parseFloat(bqBorderLeft)).toBeGreaterThanOrEqual(4);

    // Verify code block styling
    const pre = prose.locator('pre').first();
    await expect(pre).toBeVisible();
    const preBg = await pre.evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(preBg).not.toBe('rgba(0, 0, 0, 0)'); // Should have background

    // Verify inline code styling
    const inlineCode = prose.locator('p code').first();
    await expect(inlineCode).toBeVisible();
    const codeBg = await inlineCode.evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(codeBg).not.toBe('rgba(0, 0, 0, 0)'); // Should have background

    // Verify bold text
    const strong = prose.locator('strong').first();
    await expect(strong).toBeVisible();
    const strongWeight = await strong.evaluate(el => window.getComputedStyle(el).fontWeight);
    expect(parseInt(strongWeight)).toBeGreaterThanOrEqual(700);

    // Verify italic text
    const em = prose.locator('em').first();
    await expect(em).toBeVisible();
    const emStyle = await em.evaluate(el => window.getComputedStyle(el).fontStyle);
    expect(emStyle).toBe('italic');

    // Verify link styling
    const link = prose.locator('a').first();
    await expect(link).toBeVisible();
    const linkDecoration = await link.evaluate(el => window.getComputedStyle(el).textDecorationLine);
    expect(linkDecoration).toContain('underline');

    // Take final screenshot
    await page.screenshot({
      path: 'test-results/exploration/markdown-preview-comprehensive.png',
      fullPage: true
    });
  });
});
