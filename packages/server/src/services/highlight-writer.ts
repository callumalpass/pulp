import Handlebars from 'handlebars';
import type { LiteratureNote, CreateHighlightRequest, UpdateHighlightRequest, Highlight, PDFHighlight, EPUBHighlight, TextSelection } from '@pulp/shared';
import type { Config } from '../config/schema.js';
import { generatePDFHighlightId, generateEPUBHighlightId } from './highlight-parser.js';
import { atomicFrontmatterAndContentUpdate } from './file-lock.js';

export class HighlightWriter {
  private pdfTemplate: HandlebarsTemplateDelegate;
  private epubTemplate: HandlebarsTemplateDelegate;

  constructor(config: Config) {
    // Register helpers
    Handlebars.registerHelper('if', function(this: unknown, conditional, options) {
      if (conditional) {
        return options.fn(this);
      }
      return options.inverse ? options.inverse(this) : '';
    });

    // Compile templates
    this.pdfTemplate = Handlebars.compile(config.highlight_template);
    this.epubTemplate = Handlebars.compile(config.highlight_template_epub);
  }

  async write(note: LiteratureNote, request: CreateHighlightRequest): Promise<Highlight> {
    const createdAt = new Date().toISOString();

    let highlight: Highlight;
    let formatted: string;

    if (request.type === 'pdf') {
      if (!request.selection) {
        throw new Error('PDF highlights require selection data');
      }

      const id = generatePDFHighlightId(request.page!, request.selection);

      highlight = {
        id,
        type: 'pdf',
        page: request.page!,
        pageLabel: request.pageLabel,
        selection: request.selection,
        text: request.text,
        note: request.note,
        createdAt,
      } satisfies PDFHighlight;

      const citekey = (note.frontmatter.id as string) || note.id;
      // Format createdAt as YYYY-MM-DD for cleaner display in templates
      const createdAtDate = createdAt.split('T')[0];

      formatted = this.pdfTemplate({
        source: note.sourceRelative,
        page: highlight.page,
        pageLabel: highlight.pageLabel ?? String(highlight.page), // Falls back to physical page if no label
        selection: this.formatSelection(highlight.selection),
        text: this.formatBlockquote(highlight.text),
        note: highlight.note ? new Handlebars.SafeString(highlight.note) : undefined,
        citekey,
        createdAt: createdAtDate,
      });
    } else {
      const id = generateEPUBHighlightId(request.cfi!);

      highlight = {
        id,
        type: 'epub',
        cfi: request.cfi!,
        text: request.text,
        note: request.note,
        createdAt,
      } satisfies EPUBHighlight;

      const citekey = (note.frontmatter.id as string) || note.id;
      // Format createdAt as YYYY-MM-DD for cleaner display in templates
      const createdAtDate = createdAt.split('T')[0];

      formatted = this.epubTemplate({
        source: note.sourceRelative,
        cfi: highlight.cfi,
        text: this.formatBlockquote(highlight.text),
        note: highlight.note ? new Handlebars.SafeString(highlight.note) : undefined,
        citekey,
        createdAt: createdAtDate,
      });
    }

    // Append to note file
    await this.appendToNote(note.notePath, formatted);

    return highlight;
  }

  private formatSelection(sel: TextSelection): string {
    // Format: beginIndex,beginOffset,endIndex,endOffset (matching Obsidian PDF++ format)
    return `${sel.beginIndex},${sel.beginOffset},${sel.endIndex},${sel.endOffset}`;
  }

  private formatBlockquote(text: string): Handlebars.SafeString {
    // Format text for blockquote: add > prefix to each line
    const formatted = text
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n> ');
    // Return as SafeString to prevent HTML escaping
    return new Handlebars.SafeString(formatted);
  }

  private async appendToNote(notePath: string, highlight: string): Promise<void> {
    // Use atomic update to prevent race conditions when appending highlights
    await atomicFrontmatterAndContentUpdate(notePath, ({ frontmatter, content }) => {
      // Ensure proper line endings
      const separator = content.endsWith('\n') ? '' : '\n';
      const newContent = content + separator + highlight + '\n';

      return { frontmatter, content: newContent };
    });
  }

  /**
   * Update an existing highlight's note and/or category in the markdown file.
   * Finds the highlight link and updates/adds the note text after it.
   * If category changes, updates the link fragment as well.
   */
  async update(note: LiteratureNote, highlightId: string, request: UpdateHighlightRequest): Promise<Highlight | null> {
    // Find the highlight in the note's current highlights
    const highlight = note.highlights.find(h => h.id === highlightId);
    if (!highlight) {
      return null;
    }

    let linkPattern: string;

    if (highlight.type === 'pdf') {
      const sel = highlight.selection;
      const baseLinkPattern = `${this.escapeRegex(note.sourceRelative)}#page=${highlight.page}&selection=${sel.beginIndex},${sel.beginOffset},${sel.endIndex},${sel.endOffset}`;
      // Match with optional category suffix
      linkPattern = `${baseLinkPattern}(?:&category=\\w+)?`;
    } else {
      const baseLinkPattern = `${this.escapeRegex(note.sourceRelative)}#cfi=${this.escapeRegex(highlight.cfi)}`;
      // Match with optional category suffix
      linkPattern = `${baseLinkPattern}(?:&category=\\w+)?`;
    }

    const updatedAt = new Date().toISOString();
    let notFound = false;
    let noteText: string | undefined;

    // Use atomic update to prevent race conditions
    await atomicFrontmatterAndContentUpdate(note.notePath, ({ frontmatter, content }) => {
      // Find the highlight link in the content
      const linkRegex = new RegExp(`\\[\\[${linkPattern}\\|[^\\]]*\\]\\]`);
      const match = linkRegex.exec(content);

      if (!match) {
        notFound = true;
        return null;
      }

      const oldLink = match[0];
      let normalizedFragment: string;
      if (highlight.type === 'pdf') {
        const sel = highlight.selection;
        const selectionStr = `${sel.beginIndex},${sel.beginOffset},${sel.endIndex},${sel.endOffset}`;
        normalizedFragment = `#page=${highlight.page}&selection=${selectionStr}`;
      } else {
        normalizedFragment = `#cfi=${(highlight as EPUBHighlight).cfi}`;
      }
      const displayTextMatch = oldLink.match(/\|([^\]]*)\]\]$/);
      const displayText = displayTextMatch ? displayTextMatch[1] : '';
      const normalizedLink = `[[${note.sourceRelative}${normalizedFragment}|${displayText}]]`;
      if (normalizedLink !== oldLink) {
        content = content.slice(0, match.index) + normalizedLink + content.slice(match.index + oldLink.length);
      }

      // Now handle note text updates
      // Re-find the match since content may have changed
      const updatedLinkRegex = new RegExp(`\\[\\[${linkPattern}\\|[^\\]]*\\]\\]`);
      const updatedMatch = updatedLinkRegex.exec(content);

      if (!updatedMatch) {
        notFound = true;
        return null;
      }

      // Find the end of this line and any existing note on the next line
      const afterLink = content.slice(updatedMatch.index + updatedMatch[0].length);

      // The link might be at the end of a blockquote line, so check where the note would go
      let insertPoint = updatedMatch.index + updatedMatch[0].length;
      let existingNoteLength = 0;

      // Skip to end of current line
      const currentLineEnd = afterLink.indexOf('\n');
      if (currentLineEnd !== -1) {
        insertPoint += currentLineEnd + 1;

        // Check if there's an existing note (non-empty, non-blockquote, non-heading line)
        const nextLines = afterLink.slice(currentLineEnd + 1).split('\n');
        for (const line of nextLines) {
          const trimmed = line.trim();
          if (!trimmed) {
            // Empty line - could be between link and note
            existingNoteLength += line.length + 1;
            continue;
          }
          if (trimmed.startsWith('>') || trimmed.startsWith('#') || trimmed.startsWith('- ')) {
            // Next highlight or section - no existing note
            break;
          }
          // This is an existing note line - mark for replacement
          existingNoteLength += line.length + 1;
          break;
        }
      }

      // Build new content
      noteText = request.note !== undefined ? request.note?.trim() : highlight.note?.trim();

      if (noteText) {
        // Add or replace note
        const beforeNote = content.slice(0, insertPoint);
        const afterNote = content.slice(insertPoint + existingNoteLength);
        content = beforeNote + noteText + '\n' + afterNote;
      } else if (existingNoteLength > 0) {
        // Remove existing note
        const beforeNote = content.slice(0, insertPoint);
        const afterNote = content.slice(insertPoint + existingNoteLength);
        content = beforeNote + afterNote;
      }

      return { frontmatter, content };
    });

    if (notFound) {
      return null;
    }

    // Return updated highlight with updatedAt timestamp
    return {
      ...highlight,
      note: noteText,
      category: undefined,
      updatedAt,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Delete a highlight from the markdown file.
   * Finds the highlight block (blockquote + link + optional note) and removes it.
   */
  async delete(note: LiteratureNote, highlightId: string): Promise<boolean> {
    const highlight = note.highlights.find(h => h.id === highlightId);
    if (!highlight) {
      return false;
    }

    let linkPattern: string;

    if (highlight.type === 'pdf') {
      const sel = highlight.selection;
      linkPattern = `${this.escapeRegex(note.sourceRelative)}#page=${highlight.page}&selection=${sel.beginIndex},${sel.beginOffset},${sel.endIndex},${sel.endOffset}(?:&category=\\w+)?`;
    } else {
      linkPattern = `${this.escapeRegex(note.sourceRelative)}#cfi=${this.escapeRegex((highlight as EPUBHighlight).cfi)}(?:&category=\\w+)?`;
    }

    let notFound = false;

    // Use atomic update to prevent race conditions
    await atomicFrontmatterAndContentUpdate(note.notePath, ({ frontmatter, content }) => {
      // Find the link in the content
      const linkRegex = new RegExp(`\\[\\[${linkPattern}\\|[^\\]]*\\]\\]`);
      const match = linkRegex.exec(content);

      if (!match) {
        notFound = true;
        return null;
      }

      // Find the start of the highlight block by looking backwards for blockquote lines
      const beforeLink = content.slice(0, match.index);
      const lines = beforeLink.split('\n');
      let blockStart = match.index;

      // Walk backwards through lines to find the start of the blockquote
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const trimmed = line.trim();
        // First line has no preceding newline separator
        const separator = i === 0 ? 0 : 1;

        if (trimmed.startsWith('>')) {
          // This is part of the blockquote, include it
          blockStart -= line.length + separator;
        } else if (trimmed === '' || trimmed === '-') {
          // Empty line or list marker line (the part before [[) - check if we should continue
          // If this is a list marker, include it and continue looking for blockquotes
          if (trimmed === '-') {
            blockStart -= line.length + separator;
            continue;
          }
          // Empty line - stop here (don't include it in deletion)
          break;
        } else {
          // Non-blockquote, non-empty line - stop
          break;
        }
      }

      // Find the end of the highlight block by looking forwards
      const afterLink = content.slice(match.index + match[0].length);
      let blockEnd = match.index + match[0].length;

      // Skip to end of current line
      const currentLineEnd = afterLink.indexOf('\n');
      if (currentLineEnd !== -1) {
        blockEnd += currentLineEnd + 1;

        // Check for note content after the link line
        const afterLines = afterLink.slice(currentLineEnd + 1).split('\n');
        for (const line of afterLines) {
          const trimmed = line.trim();
          if (!trimmed) {
            // Empty line - include it and stop
            blockEnd += line.length + 1;
            break;
          }
          if (trimmed.startsWith('>') || trimmed.startsWith('#') || trimmed.startsWith('- ')) {
            // Next highlight or section - stop here
            break;
          }
          // This is a note line - include it
          blockEnd += line.length + 1;
          break;
        }
      }

      // Remove the block
      const newContent = content.slice(0, blockStart) + content.slice(blockEnd);

      return { frontmatter, content: newContent };
    });

    return !notFound;
  }
}
