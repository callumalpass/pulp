import type { FastifyPluginAsync } from 'fastify';
import type { CreateHighlightRequest, UpdateHighlightRequest, HighlightExportFormat, Highlight, HighlightCategory } from '@pulp/shared';
import { HIGHLIGHT_CATEGORIES as CATEGORIES } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { HighlightWriter } from '../services/highlight-writer.js';

interface ExportQuerystring {
  format: HighlightExportFormat;
  includeNotes?: boolean;
  includeCategories?: boolean;
  includeTimestamps?: boolean;
  groupByCategory?: boolean;
}

interface HighlightsRouteOptions {
  scanner: LibraryScanner;
  highlightWriter: HighlightWriter;
}

export const highlightsRoutes: FastifyPluginAsync<HighlightsRouteOptions> = async (fastify, opts) => {
  const { scanner, highlightWriter } = opts;

  // POST /api/library/:id/highlights - Add a new highlight
  fastify.post<{
    Params: { id: string };
    Body: CreateHighlightRequest;
  }>('/api/library/:id/highlights', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['type', 'text'],
        properties: {
          type: { type: 'string', enum: ['pdf', 'epub'] },
          page: { type: 'number' },
          selection: {
            type: 'object',
            properties: {
              beginIndex: { type: 'number' },
              beginOffset: { type: 'number' },
              endIndex: { type: 'number' },
              endOffset: { type: 'number' },
            },
          },
          cfi: { type: 'string' },
          text: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const body = request.body;

    // Validate type-specific requirements
    if (body.type === 'pdf' && (body.page === undefined || !body.selection)) {
      return reply.code(400).send({ error: 'PDF highlights require page and selection' });
    }

    if (body.type === 'epub' && !body.cfi) {
      return reply.code(400).send({ error: 'EPUB highlights require cfi' });
    }

    try {
      const highlight = await highlightWriter.write(note, body);

      // Update in-memory cache
      note.highlights.push(highlight);

      return { success: true, highlight };
    } catch (error) {
      fastify.log.error(error, 'Failed to write highlight');
      return reply.code(500).send({ error: 'Failed to save highlight' });
    }
  });

  // PATCH /api/library/:id/highlights/:highlightId - Update a highlight's note
  fastify.patch<{
    Params: { id: string; highlightId: string };
    Body: UpdateHighlightRequest;
  }>('/api/library/:id/highlights/:highlightId', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'highlightId'],
        properties: {
          id: { type: 'string' },
          highlightId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          note: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    try {
      const updatedHighlight = await highlightWriter.update(note, request.params.highlightId, request.body);

      if (!updatedHighlight) {
        return reply.code(404).send({ error: 'Highlight not found' });
      }

      // Update in-memory cache
      const index = note.highlights.findIndex((h) => h.id === request.params.highlightId);
      if (index !== -1) {
        note.highlights[index] = updatedHighlight;
      }

      return { success: true, highlight: updatedHighlight };
    } catch (error) {
      fastify.log.error(error, 'Failed to update highlight');
      return reply.code(500).send({ error: 'Failed to update highlight' });
    }
  });

  // DELETE /api/library/:id/highlights/:highlightId
  fastify.delete<{
    Params: { id: string; highlightId: string };
  }>('/api/library/:id/highlights/:highlightId', async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const highlightIndex = note.highlights.findIndex((h) => h.id === request.params.highlightId);

    if (highlightIndex === -1) {
      return reply.code(404).send({ error: 'Highlight not found' });
    }

    try {
      const deleted = await highlightWriter.delete(note, request.params.highlightId);

      if (!deleted) {
        return reply.code(404).send({ error: 'Highlight not found in file' });
      }

      // Remove from in-memory cache
      note.highlights.splice(highlightIndex, 1);

      return { success: true };
    } catch (error) {
      fastify.log.error(error, 'Failed to delete highlight');
      return reply.code(500).send({ error: 'Failed to delete highlight' });
    }
  });

  // GET /api/library/:id/highlights/export - Export highlights in various formats
  fastify.get<{
    Params: { id: string };
    Querystring: ExportQuerystring;
  }>('/api/library/:id/highlights/export', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        required: ['format'],
        properties: {
          format: { type: 'string', enum: ['markdown', 'json', 'csv', 'plaintext'] },
          includeNotes: { type: 'boolean', default: true },
          includeCategories: { type: 'boolean', default: true },
          includeTimestamps: { type: 'boolean', default: true },
          groupByCategory: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const {
      format,
      includeNotes = true,
      includeCategories = true,
      includeTimestamps = true,
      groupByCategory = false,
    } = request.query;

    const highlights = note.highlights;

    if (highlights.length === 0) {
      return reply.code(400).send({ error: 'No highlights to export' });
    }

    // Sort highlights by position (page for PDF, creation date for EPUB)
    const sortedHighlights = [...highlights].sort((a, b) => {
      if (a.type === 'pdf' && b.type === 'pdf') {
        return a.page - b.page;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    let content: string;
    let mimeType: string;
    let extension: string;

    switch (format) {
      case 'markdown':
        content = exportToMarkdown(note.title, sortedHighlights, {
          includeNotes,
          includeCategories,
          includeTimestamps,
          groupByCategory,
        });
        mimeType = 'text/markdown';
        extension = 'md';
        break;

      case 'json':
        content = exportToJSON(note.title, sortedHighlights, {
          includeNotes,
          includeCategories,
          includeTimestamps,
        });
        mimeType = 'application/json';
        extension = 'json';
        break;

      case 'csv':
        content = exportToCSV(sortedHighlights, {
          includeNotes,
          includeCategories,
          includeTimestamps,
        });
        mimeType = 'text/csv';
        extension = 'csv';
        break;

      case 'plaintext':
        content = exportToPlaintext(note.title, sortedHighlights, {
          includeNotes,
          includeTimestamps,
        });
        mimeType = 'text/plain';
        extension = 'txt';
        break;

      default:
        return reply.code(400).send({ error: 'Unsupported export format' });
    }

    // Sanitize title for filename
    const safeTitle = note.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50);
    const filename = `${safeTitle}-highlights.${extension}`;

    return {
      content,
      filename,
      mimeType,
    };
  });
};

// Export helper functions

interface ExportOptions {
  includeNotes?: boolean;
  includeCategories?: boolean;
  includeTimestamps?: boolean;
  groupByCategory?: boolean;
}

function exportToMarkdown(
  title: string,
  highlights: Highlight[],
  options: ExportOptions
): string {
  const lines: string[] = [`# Highlights from "${title}"`, ''];

  if (options.groupByCategory) {
    // Group highlights by category
    const byCategory = new Map<HighlightCategory, Highlight[]>();
    for (const h of highlights) {
      const cat = h.category || 'highlight';
      if (!byCategory.has(cat)) {
        byCategory.set(cat, []);
      }
      byCategory.get(cat)!.push(h);
    }

    const categoryOrder: HighlightCategory[] = ['highlight', 'important', 'question', 'todo', 'definition'];
    for (const cat of categoryOrder) {
      const catHighlights = byCategory.get(cat);
      if (!catHighlights || catHighlights.length === 0) continue;

      const catInfo = CATEGORIES[cat];
      lines.push(`## ${catInfo.label}`, '');

      for (const h of catHighlights) {
        lines.push(...formatHighlightMarkdown(h, options));
        lines.push('');
      }
    }
  } else {
    for (const h of highlights) {
      lines.push(...formatHighlightMarkdown(h, options));
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatHighlightMarkdown(h: Highlight, options: ExportOptions): string[] {
  const lines: string[] = [];

  // Location info
  const location = h.type === 'pdf'
    ? `Page ${h.pageLabel || h.page}`
    : 'EPUB';

  // Category badge
  const categoryBadge = options.includeCategories && h.category
    ? ` [${CATEGORIES[h.category].label}]`
    : '';

  // Timestamp
  const timestamp = options.includeTimestamps
    ? ` — ${formatDate(h.createdAt)}`
    : '';

  lines.push(`> ${h.text}`);
  lines.push(`— *${location}${categoryBadge}${timestamp}*`);

  if (options.includeNotes && h.note) {
    lines.push('', `**Note:** ${h.note}`);
  }

  return lines;
}

function exportToJSON(
  title: string,
  highlights: Highlight[],
  options: ExportOptions
): string {
  const data = {
    title,
    exportedAt: new Date().toISOString(),
    highlightCount: highlights.length,
    highlights: highlights.map(h => {
      const item: Record<string, unknown> = {
        text: h.text,
        type: h.type,
      };

      if (h.type === 'pdf') {
        item.page = h.page;
        if (h.pageLabel) item.pageLabel = h.pageLabel;
      } else {
        item.cfi = h.cfi;
      }

      if (options.includeNotes && h.note) {
        item.note = h.note;
      }

      if (options.includeCategories && h.category) {
        item.category = h.category;
      }

      if (options.includeTimestamps) {
        item.createdAt = h.createdAt;
        if (h.updatedAt) item.updatedAt = h.updatedAt;
      }

      return item;
    }),
  };

  return JSON.stringify(data, null, 2);
}

function exportToCSV(highlights: Highlight[], options: ExportOptions): string {
  const headers = ['Text', 'Type', 'Location'];
  if (options.includeCategories) headers.push('Category');
  if (options.includeNotes) headers.push('Note');
  if (options.includeTimestamps) headers.push('Created');

  const rows: string[][] = [headers];

  for (const h of highlights) {
    const row: string[] = [
      escapeCSV(h.text),
      h.type,
      h.type === 'pdf' ? `Page ${h.pageLabel || h.page}` : h.cfi,
    ];

    if (options.includeCategories) {
      row.push(h.category ? CATEGORIES[h.category].label : 'Highlight');
    }

    if (options.includeNotes) {
      row.push(escapeCSV(h.note || ''));
    }

    if (options.includeTimestamps) {
      row.push(formatDate(h.createdAt));
    }

    rows.push(row);
  }

  return rows.map(row => row.join(',')).join('\n');
}

function exportToPlaintext(
  title: string,
  highlights: Highlight[],
  options: ExportOptions
): string {
  const lines: string[] = [`HIGHLIGHTS FROM: ${title}`, '', '='.repeat(50), ''];

  for (let i = 0; i < highlights.length; i++) {
    const h = highlights[i];
    const location = h.type === 'pdf'
      ? `Page ${h.pageLabel || h.page}`
      : 'EPUB';

    lines.push(`[${i + 1}] ${location}`);
    if (options.includeTimestamps) {
      lines.push(`    ${formatDate(h.createdAt)}`);
    }
    lines.push('');
    lines.push(`    "${h.text}"`);

    if (options.includeNotes && h.note) {
      lines.push('', `    Note: ${h.note}`);
    }

    lines.push('', '-'.repeat(50), '');
  }

  return lines.join('\n');
}

function escapeCSV(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
