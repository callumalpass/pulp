import { readFileSync, writeFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import type { LiteratureNote, CreateHighlightRequest, UpdateHighlightRequest, Highlight, PDFHighlight, EPUBHighlight, TextSelection } from '@pulp/shared';
import type { Config } from '../config/schema.js';
import { generatePDFHighlightId, generateEPUBHighlightId } from './highlight-parser.js';

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
        selection: request.selection,
        text: request.text,
        note: request.note,
        createdAt,
      } satisfies PDFHighlight;

      const citekey = (note.frontmatter.id as string) || note.id;

      formatted = this.pdfTemplate({
        source: note.sourceRelative,
        page: highlight.page,
        selection: this.formatSelection(highlight.selection),
        text: this.formatBlockquote(highlight.text),
        note: highlight.note,
        citekey,
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

      formatted = this.epubTemplate({
        source: note.sourceRelative,
        cfi: highlight.cfi,
        text: this.formatBlockquote(highlight.text),
        note: highlight.note,
        citekey,
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
    const content = readFileSync(notePath, 'utf-8');

    // Ensure proper line endings
    const separator = content.endsWith('\n') ? '' : '\n';
    const newContent = content + separator + highlight + '\n';

    writeFileSync(notePath, newContent, 'utf-8');
  }

  /**
   * Update an existing highlight's note in the markdown file.
   * Finds the highlight link and updates/adds the note text after it.
   */
  async update(note: LiteratureNote, highlightId: string, request: UpdateHighlightRequest): Promise<Highlight | null> {
    // Find the highlight in the note's current highlights
    const highlight = note.highlights.find(h => h.id === highlightId);
    if (!highlight) {
      return null;
    }

    const content = readFileSync(note.notePath, 'utf-8');
    let linkPattern: string;

    if (highlight.type === 'pdf') {
      const sel = highlight.selection;
      linkPattern = `${this.escapeRegex(note.sourceRelative)}#page=${highlight.page}&selection=${sel.beginIndex},${sel.beginOffset},${sel.endIndex},${sel.endOffset}`;
    } else {
      linkPattern = `${this.escapeRegex(note.sourceRelative)}#cfi=${this.escapeRegex(highlight.cfi)}`;
    }

    // Find the highlight link in the content
    const linkRegex = new RegExp(`\\[\\[${linkPattern}\\|[^\\]]*\\]\\]`);
    const match = linkRegex.exec(content);

    if (!match) {
      return null;
    }

    // Find the end of this line and any existing note on the next line
    const afterLink = content.slice(match.index + match[0].length);

    // The link might be at the end of a blockquote line, so check where the note would go
    let insertPoint = match.index + match[0].length;
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
    let newContent: string;
    const noteText = request.note?.trim();

    if (noteText) {
      // Add or replace note
      const beforeNote = content.slice(0, insertPoint);
      const afterNote = content.slice(insertPoint + existingNoteLength);
      newContent = beforeNote + noteText + '\n' + afterNote;
    } else if (existingNoteLength > 0) {
      // Remove existing note
      const beforeNote = content.slice(0, insertPoint);
      const afterNote = content.slice(insertPoint + existingNoteLength);
      newContent = beforeNote + afterNote;
    } else {
      // No change needed
      newContent = content;
    }

    writeFileSync(note.notePath, newContent, 'utf-8');

    // Return updated highlight
    return {
      ...highlight,
      note: noteText,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
