import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Highlight, PDFHighlight, EPUBHighlight, TextSelection } from '@pulp/shared';

/**
 * Generate a stable ID for a PDF highlight based on its position.
 */
export function generatePDFHighlightId(page: number, selection: TextSelection): string {
  const data = `pdf:${page}:${selection.beginIndex},${selection.beginOffset},${selection.endIndex},${selection.endOffset}`;
  return createHash('md5').update(data).digest('hex').slice(0, 10);
}

/**
 * Generate a stable ID for an EPUB highlight based on its CFI.
 */
export function generateEPUBHighlightId(cfi: string): string {
  const data = `epub:${cfi}`;
  return createHash('md5').update(data).digest('hex').slice(0, 10);
}

/**
 * Parses highlights from a note's markdown content.
 * Supports Obsidian PDF++ style links with selection format.
 */
export function parseHighlightsFromNote(notePath: string, sourceRelative: string): Highlight[] {
  try {
    const content = readFileSync(notePath, 'utf-8');
    return parseHighlights(content, sourceRelative);
  } catch (error) {
    console.error(`Failed to parse highlights from ${notePath}:`, error);
    return [];
  }
}

function parseHighlights(content: string, sourceRelative: string): Highlight[] {
  const highlights: Highlight[] = [];

  // Match PDF highlights with selection format (PDF++ style):
  // [[source#page=N&selection=beginIndex,beginOffset,endIndex,endOffset|...]]
  const pdfSelectionRegex = new RegExp(
    `\\[\\[${escapeRegex(sourceRelative)}#page=(\\d+)&selection=([\\d,]+)\\|[^\\]]*\\]\\]`,
    'g'
  );

  // Match EPUB highlights with CFI:
  // [[source#cfi=...]]
  const epubRegex = new RegExp(
    `\\[\\[${escapeRegex(sourceRelative)}#cfi=([^|\\]]+)\\|[^\\]]*\\]\\]`,
    'g'
  );

  // Parse PDF selection highlights
  let match;
  while ((match = pdfSelectionRegex.exec(content)) !== null) {
    const page = parseInt(match[1], 10);
    const selectionParts = match[2].split(',').map(s => parseInt(s, 10));

    if (selectionParts.length === 4) {
      const selection: TextSelection = {
        beginIndex: selectionParts[0],
        beginOffset: selectionParts[1],
        endIndex: selectionParts[2],
        endOffset: selectionParts[3],
      };

      // Extract the quoted text from the blockquote before this link
      const { text, note } = extractHighlightContext(content, match.index);

      highlights.push({
        id: generatePDFHighlightId(page, selection),
        type: 'pdf',
        page,
        selection,
        text: text || 'Highlight',
        note,
        createdAt: new Date().toISOString(),
      } satisfies PDFHighlight);
    }
  }

  // Parse EPUB highlights
  while ((match = epubRegex.exec(content)) !== null) {
    const cfi = match[1];
    const { text, note } = extractHighlightContext(content, match.index);

    highlights.push({
      id: generateEPUBHighlightId(cfi),
      type: 'epub',
      cfi,
      text: text || 'Highlight',
      note,
      createdAt: new Date().toISOString(),
    } satisfies EPUBHighlight);
  }

  return highlights;
}

/**
 * Extract the highlighted text and note from context around the link.
 * Looks for blockquote content before the link.
 */
function extractHighlightContext(content: string, linkIndex: number): { text: string | undefined; note: string | undefined } {
  // Look backwards from the link to find blockquote content
  const beforeLink = content.slice(Math.max(0, linkIndex - 2000), linkIndex);
  const lines = beforeLink.split('\n').reverse();

  const quoteLines: string[] = [];
  let foundQuote = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Stop at empty line after finding quote content
    if (foundQuote && trimmed === '') {
      break;
    }

    // Collect blockquote lines
    if (trimmed.startsWith('>')) {
      foundQuote = true;
      // Remove the > prefix and the link if it's on this line
      let quoteLine = trimmed.slice(1).trim();
      // Remove wiki-link from the line if present
      quoteLine = quoteLine.replace(/\[\[[^\]]+\]\]/g, '').trim();
      if (quoteLine) {
        quoteLines.unshift(quoteLine);
      }
    } else if (foundQuote) {
      break;
    }
  }

  const text = quoteLines.length > 0 ? quoteLines.join('\n') : undefined;

  // Look for note content after the link
  const afterLink = content.slice(linkIndex);
  const afterLines = afterLink.split('\n').slice(1);
  let note: string | undefined = undefined;

  for (const line of afterLines) {
    const trimmed = line.trim();
    // Skip empty lines
    if (!trimmed) continue;
    // Stop at next blockquote or heading
    if (trimmed.startsWith('>') || trimmed.startsWith('#') || trimmed.startsWith('- ')) {
      break;
    }
    // This is likely the note
    note = trimmed;
    break;
  }

  return { text, note };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
